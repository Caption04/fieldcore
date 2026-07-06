const { prisma } = require('../db');
const { buildNotificationTemplate, buildWhatsAppTemplate } = require('./notificationTemplates.service');
const { cleanError, sendEmail } = require('./emailProvider.service');
const { normalizePhoneNumber } = require('./phoneNumber.service');
const { canUseFeature } = require('./subscription.service');
const { sendWhatsApp, templateName } = require('./whatsappProvider.service');
const { sendViaIntegration } = require('./integrations/integrationConnections.service');

const CHANNEL = { EMAIL: 'EMAIL', WHATSAPP: 'WHATSAPP', SMS: 'SMS' };
const dedupeStatuses = ['SENT', 'SKIPPED', 'PENDING'];

function channels() {
  return String(process.env.NOTIFICATION_CHANNELS || 'EMAIL,WHATSAPP')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item === CHANNEL.EMAIL || item === CHANNEL.WHATSAPP || item === CHANNEL.SMS);
}

function uniqBy(recipients, keyFn) {
  const seen = new Set();
  return recipients.filter((recipient) => {
    if (!recipient) return false;
    const key = keyFn(recipient);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function company(companyId) {
  return prisma.company.findFirst({ where: { id: companyId }, include: { branding: true } });
}

async function adminRecipients(companyId, tenant) {
  const users = await prisma.user.findMany({ where: { companyId, role: { in: ['OWNER', 'ADMIN'] } }, select: { id: true, email: true, phone: true, name: true, role: true } });
  const recipients = users.map((user) => ({ name: user.name, email: user.email, phone: user.phone, role: user.role }));
  if (!recipients.some((recipient) => recipient.phone) && tenant && tenant.phone) recipients.push({ name: tenant.name, phone: tenant.phone, role: 'COMPANY' });
  return recipients;
}

async function clientRecipient(companyId, customer, record) {
  if (!customer && !record) return [];
  const account = customer ? await prisma.clientAccount.findFirst({ where: { companyId, customerId: customer.id, status: { in: ['ACTIVE', 'INVITED'] } } }) : null;
  return [{
    name: account && account.name || customer && customer.name || record && record.customerName,
    email: account && account.email || customer && customer.email || record && record.customerEmail,
    phone: account && account.phone || customer && customer.phone || record && record.customerPhone,
    role: 'CLIENT'
  }];
}

async function workerRecipient(companyId, workerId) {
  if (!workerId) return [];
  const worker = await prisma.workerProfile.findFirst({ where: { id: workerId, companyId, active: true }, include: { user: { select: { id: true, email: true, name: true, role: true } } } });
  if (!worker) return [];
  return [{ name: worker.user && worker.user.name, email: worker.user && worker.user.email, phone: worker.phone, role: 'WORKER' }];
}

async function loadRecord(eventType, companyId, relatedId, fallback) {
  if (fallback) return fallback;
  if (eventType === 'BOOKING_CREATED') return prisma.bookingRequest.findFirst({ where: { id: relatedId, companyId }, include: { customer: true, service: true, clientAccount: true } });
  if (eventType.startsWith('QUOTE_')) return prisma.quote.findFirst({ where: { id: relatedId, companyId }, include: { customer: true, service: true, job: true } });
  if (eventType === 'INVOICE_SENT') return prisma.invoice.findFirst({ where: { id: relatedId, companyId }, include: { customer: true, service: true, job: true } });
  if (eventType === 'PAYMENT_RECEIVED') {
    const payment = await prisma.payment.findFirst({ where: { id: relatedId, companyId }, include: { receipt: true } });
    if (!payment) return null;
    const invoice = await prisma.invoice.findFirst({ where: { id: payment.invoiceId, companyId }, include: { customer: true, service: true, job: true } });
    return { ...payment, invoice };
  }
  if (eventType.startsWith('JOB_') || eventType === 'WORKER_ASSIGNED') return prisma.job.findFirst({ where: { id: relatedId, companyId }, include: { customer: true, service: true, worker: { include: { user: { select: { id: true, email: true, name: true, role: true } } } }, proofPhotos: true, signature: true } });
  return null;
}

async function recipientsFor(eventType, companyId, record, tenant) {
  if (!record) return [];
  if (eventType === 'BOOKING_CREATED') return adminRecipients(companyId, tenant);
  if (['QUOTE_ACCEPTED', 'QUOTE_REJECTED'].includes(eventType)) return adminRecipients(companyId, tenant);
  if (['QUOTE_SENT', 'INVOICE_SENT'].includes(eventType)) return clientRecipient(companyId, record.customer, record);
  if (eventType === 'PAYMENT_RECEIVED') return (await adminRecipients(companyId, tenant)).concat(await clientRecipient(companyId, record.invoice && record.invoice.customer, record.invoice));
  if (['JOB_SCHEDULED', 'JOB_RESCHEDULED'].includes(eventType)) return (await clientRecipient(companyId, record.customer, record)).concat(await workerRecipient(companyId, record.workerId));
  if (eventType === 'WORKER_ASSIGNED') return workerRecipient(companyId, record.workerId);
  if (eventType === 'JOB_COMPLETED') return (await adminRecipients(companyId, tenant)).concat(await clientRecipient(companyId, record.customer, record));
  return [];
}

async function writeLog(data) {
  return prisma.notificationLog.create({ data });
}

async function duplicateLog(companyId, eventType, channel, recipient, relatedType, relatedId) {
  return prisma.notificationLog.findFirst({ where: { companyId, eventType, channel, recipient, relatedType, relatedId, status: { in: dedupeStatuses } } });
}

async function skippedLog({ companyId, eventType, channel, recipient, subject, error, relatedType, relatedId }) {
  const duplicate = await duplicateLog(companyId, eventType, channel, recipient, relatedType, relatedId);
  if (duplicate) return duplicate;
  return writeLog({ companyId, eventType, channel, recipient, subject, status: 'SKIPPED', error, relatedType, relatedId });
}

async function deliverEmail({ companyId, eventType, recipient, template, relatedType, relatedId }) {
  const email = String(recipient.email || '').trim().toLowerCase();
  if (!email) return skippedLog({ companyId, eventType, channel: CHANNEL.EMAIL, recipient: 'none', subject: template.subject, error: 'No recipient email available', relatedType, relatedId });
  const duplicate = await duplicateLog(companyId, eventType, CHANNEL.EMAIL, email, relatedType, relatedId);
  if (duplicate) return duplicate;
  const pending = await writeLog({ companyId, eventType, channel: CHANNEL.EMAIL, recipient: email, subject: template.subject, status: 'PENDING', relatedType, relatedId });
  try {
    let result = await sendViaIntegration({ companyId, channel: CHANNEL.EMAIL, message: { to: email, subject: template.subject, text: template.text, html: template.html }, relatedType, relatedId, notificationLogId: pending.id });
    if (result.status === 'SKIPPED') result = await sendEmail({ to: email, subject: template.subject, text: template.text, html: template.html });
    return prisma.notificationLog.update({ where: { id: pending.id }, data: { status: result.status || 'SENT', error: result.error ? cleanError(result.error) : null, sentAt: result.status === 'SENT' ? new Date() : null } });
  } catch (error) {
    return prisma.notificationLog.update({ where: { id: pending.id }, data: { status: 'FAILED', error: cleanError(error) } });
  }
}

async function deliverWhatsApp({ companyId, eventType, recipient, template, relatedType, relatedId }) {
  const phone = normalizePhoneNumber(recipient.phone);
  const subject = template.templateName || template.label || eventType;
  if (!phone) return skippedLog({ companyId, eventType, channel: CHANNEL.WHATSAPP, recipient: 'none', subject, error: 'No valid WhatsApp phone number available', relatedType, relatedId });
  if (!template.templateName) return skippedLog({ companyId, eventType, channel: CHANNEL.WHATSAPP, recipient: phone, subject, error: 'WhatsApp template is not configured', relatedType, relatedId });
  const duplicate = await duplicateLog(companyId, eventType, CHANNEL.WHATSAPP, phone, relatedType, relatedId);
  if (duplicate) return duplicate;
  const pending = await writeLog({ companyId, eventType, channel: CHANNEL.WHATSAPP, recipient: phone, subject, status: 'PENDING', relatedType, relatedId });
  try {
    let result = await sendViaIntegration({ companyId, channel: CHANNEL.WHATSAPP, message: { to: phone, eventType, templateName: template.templateName, text: template.text }, relatedType, relatedId, notificationLogId: pending.id });
    if (result.status === 'SKIPPED') result = await sendWhatsApp({ to: phone, eventType, templateName: template.templateName, text: template.text });
    return prisma.notificationLog.update({ where: { id: pending.id }, data: { status: result.status || 'SENT', error: result.error ? cleanError(result.error) : null, sentAt: result.status === 'SENT' ? new Date() : null } });
  } catch (error) {
    return prisma.notificationLog.update({ where: { id: pending.id }, data: { status: 'FAILED', error: cleanError(error) } });
  }
}

async function deliverSms({ companyId, eventType, recipient, template, relatedType, relatedId }) {
  const phone = normalizePhoneNumber(recipient.phone);
  const subject = template.subject || eventType;
  if (!phone) return skippedLog({ companyId, eventType, channel: CHANNEL.SMS, recipient: 'none', subject, error: 'No valid SMS phone number available', relatedType, relatedId });
  const duplicate = await duplicateLog(companyId, eventType, CHANNEL.SMS, phone, relatedType, relatedId);
  if (duplicate) return duplicate;
  const pending = await writeLog({ companyId, eventType, channel: CHANNEL.SMS, recipient: phone, subject, status: 'PENDING', relatedType, relatedId });
  try {
    const result = await sendViaIntegration({ companyId, channel: CHANNEL.SMS, message: { to: phone, eventType, text: template.text || subject }, relatedType, relatedId, notificationLogId: pending.id });
    return prisma.notificationLog.update({ where: { id: pending.id }, data: { status: result.status || 'SENT', error: result.error ? cleanError(result.error) : null, sentAt: result.status === 'SENT' ? new Date() : null } });
  } catch (error) {
    return prisma.notificationLog.update({ where: { id: pending.id }, data: { status: 'FAILED', error: cleanError(error) } });
  }
}

async function notify(eventType, options = {}) {
  try {
    const companyId = options.companyId;
    const relatedType = options.relatedType || null;
    const relatedId = options.relatedId || options.record && options.record.id || null;
    const record = await loadRecord(eventType, companyId, relatedId, options.record);
    const tenant = await company(companyId);
    const recipients = options.recipients || await recipientsFor(eventType, companyId, record, tenant);
    const emailTemplate = buildNotificationTemplate(eventType, { company: tenant, record, ...options.context });
    const whatsappTemplate = { ...buildWhatsAppTemplate(eventType, { company: tenant, record, ...options.context }), templateName: templateName(eventType) };
    const activeChannels = channels();
    const tasks = [];

    if (activeChannels.includes(CHANNEL.EMAIL)) {
      const emailRecipients = uniqBy(recipients, (recipient) => String(recipient.email || '').trim().toLowerCase());
      if (!emailRecipients.length) tasks.push(skippedLog({ companyId, eventType, channel: CHANNEL.EMAIL, recipient: 'none', subject: emailTemplate.subject, error: 'No recipient email available', relatedType, relatedId }));
      else tasks.push(...emailRecipients.map((recipient) => deliverEmail({ companyId, eventType, recipient, template: emailTemplate, relatedType, relatedId })));
    }

    if (activeChannels.includes(CHANNEL.WHATSAPP)) {
      const gate = await canUseFeature(companyId, 'whatsappNotifications');
      if (!gate.allowed) {
        tasks.push(skippedLog({ companyId, eventType, channel: CHANNEL.WHATSAPP, recipient: 'none', subject: whatsappTemplate.templateName || whatsappTemplate.label, error: gate.reason, relatedType, relatedId }));
        return Promise.all(tasks);
      }
      const whatsappRecipients = uniqBy(recipients, (recipient) => normalizePhoneNumber(recipient.phone) || String(recipient.name || recipient.email || 'none'));
      if (!whatsappRecipients.length) tasks.push(skippedLog({ companyId, eventType, channel: CHANNEL.WHATSAPP, recipient: 'none', subject: whatsappTemplate.templateName || whatsappTemplate.label, error: 'No valid WhatsApp phone number available', relatedType, relatedId }));
      else tasks.push(...whatsappRecipients.map((recipient) => deliverWhatsApp({ companyId, eventType, recipient, template: whatsappTemplate, relatedType, relatedId })));
    }

    if (activeChannels.includes(CHANNEL.SMS)) {
      const smsRecipients = uniqBy(recipients, (recipient) => normalizePhoneNumber(recipient.phone) || String(recipient.name || recipient.email || 'none'));
      if (!smsRecipients.length) tasks.push(skippedLog({ companyId, eventType, channel: CHANNEL.SMS, recipient: 'none', subject: emailTemplate.subject, error: 'No valid SMS phone number available', relatedType, relatedId }));
      else tasks.push(...smsRecipients.map((recipient) => deliverSms({ companyId, eventType, recipient, template: emailTemplate, relatedType, relatedId })));
    }

    return Promise.all(tasks);
  } catch (error) {
    console.error('[notification:error]', cleanError(error));
    return [];
  }
}

module.exports = { CHANNEL, notify };
