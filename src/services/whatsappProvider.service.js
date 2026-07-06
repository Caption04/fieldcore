const { cleanError } = require('./emailProvider.service');

const defaultTemplateNames = {
  BOOKING_CREATED: 'booking_created',
  QUOTE_SENT: 'quote_sent',
  QUOTE_ACCEPTED: 'quote_accepted',
  QUOTE_REJECTED: 'quote_rejected',
  INVOICE_SENT: 'invoice_sent',
  PAYMENT_RECEIVED: 'payment_received',
  JOB_SCHEDULED: 'job_scheduled',
  JOB_RESCHEDULED: 'job_rescheduled',
  WORKER_ASSIGNED: 'worker_assigned',
  JOB_COMPLETED: 'job_completed',
  CONTRACT_ACTIVATED: 'contract_activated',
  MAINTENANCE_VISIT_DUE: 'maintenance_visit_due',
  SLA_AT_RISK: 'sla_at_risk',
  SLA_BREACHED: 'sla_breached',
  JOB_PROOF_READY: 'job_proof_ready',
  INVOICE_OVERDUE: 'invoice_overdue',
  PURCHASE_SHORTAGE_BLOCKING_JOB: 'purchase_shortage_blocking_job'
};

let overrideProvider = null;

function templateName(eventType) {
  const key = 'WHATSAPP_TEMPLATE_' + eventType;
  return Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : defaultTemplateNames[eventType];
}

function languageCode() {
  return process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
}

function authHeaders(provider) {
  if (provider === 'meta') return { Authorization: 'Bearer ' + process.env.WHATSAPP_ACCESS_TOKEN, 'Content-Type': 'application/json' };
  if (provider === '360dialog') return { 'D360-API-KEY': process.env.WHATSAPP_API_KEY, 'Content-Type': 'application/json' };
  return { 'Content-Type': 'application/json' };
}

function providerUrl(provider) {
  if (provider === 'meta') {
    const base = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v20.0';
    return base.replace(/\/$/, '') + '/' + process.env.WHATSAPP_PHONE_NUMBER_ID + '/messages';
  }
  if (provider === '360dialog') return (process.env.WHATSAPP_API_URL || 'https://waba.360dialog.io/v1/messages').replace(/\/$/, '');
  return process.env.WHATSAPP_API_URL;
}

function templatePayload(message) {
  return {
    messaging_product: 'whatsapp',
    to: message.to,
    type: 'template',
    template: {
      name: message.templateName,
      language: { code: languageCode() }
    }
  };
}

async function sendWhatsApp(message) {
  const provider = String(process.env.WHATSAPP_PROVIDER || '').toLowerCase();
  if (!message.templateName) return { status: 'SKIPPED', error: 'WhatsApp template is not configured' };
  if (overrideProvider) return overrideProvider(message);
  if (!provider || provider === 'disabled') return { status: 'SKIPPED', error: 'WhatsApp provider is not configured' };
  if (process.env.NODE_ENV === 'test') return { status: 'SKIPPED', error: 'WhatsApp sending disabled in tests' };
  if (provider === 'console') {
    console.info('[notification:whatsapp]', { to: message.to, templateName: message.templateName, eventType: message.eventType });
    return { status: 'SENT' };
  }
  if (provider === 'meta' && (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID)) return { status: 'SKIPPED', error: 'WhatsApp Meta credentials are not configured' };
  if (provider === '360dialog' && (!process.env.WHATSAPP_API_KEY || !process.env.WHATSAPP_API_URL)) return { status: 'SKIPPED', error: 'WhatsApp 360dialog credentials are not configured' };
  const url = providerUrl(provider);
  if (!url) return { status: 'SKIPPED', error: 'WhatsApp API URL is not configured' };
  if (typeof fetch !== 'function') return { status: 'FAILED', error: 'Fetch API is unavailable for WhatsApp delivery' };
  try {
    const response = await fetch(url, { method: 'POST', headers: authHeaders(provider), body: JSON.stringify(templatePayload(message)) });
    if (!response.ok) return { status: 'FAILED', error: cleanError('WhatsApp provider returned HTTP ' + response.status) };
    return { status: 'SENT' };
  } catch (error) {
    return { status: 'FAILED', error: cleanError(error) };
  }
}

function setWhatsAppProvider(provider) {
  overrideProvider = provider;
}

module.exports = { defaultTemplateNames, sendWhatsApp, setWhatsAppProvider, templateName };
