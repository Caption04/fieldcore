function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString('en-US', { style: 'currency', currency: process.env.DEFAULT_CURRENCY || 'USD' });
}

function date(value) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function textTemplate(subject, lines) {
  const text = lines.filter(Boolean).join('\n');
  const html = '<p>' + lines.filter(Boolean).map((line) => String(line).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))).join('</p><p>') + '</p>';
  return { subject, text, html };
}

function buildNotificationTemplate(eventType, context = {}) {
  const company = context.company || {};
  const record = context.record || {};
  const customer = record.customer || {};
  const serviceName = record.service && record.service.name || record.serviceName || record.title || 'Service request';
  const prefix = company.tradingName || company.name || 'FieldCore';

  if (eventType === 'BOOKING_CREATED') return textTemplate(prefix + ': new booking request', [
    'A new booking request was submitted.',
    'Service: ' + serviceName,
    'Customer: ' + (record.customerName || customer.name || 'Unknown'),
    'Contact: ' + [record.customerEmail, record.customerPhone].filter(Boolean).join(' / '),
    record.preferredDate ? 'Preferred: ' + date(record.preferredDate) + (record.preferredTimeWindow ? ' (' + record.preferredTimeWindow.replace(/_/g, ' ') + ')' : '') : null,
    'Review it in the admin dashboard.'
  ]);

  if (eventType === 'QUOTE_SENT') return textTemplate(prefix + ': quote sent', [
    'Your quote is ready to review.',
    'Quote: ' + record.id,
    'Service: ' + serviceName,
    'Total: ' + money(record.total || record.amount),
    record.validUntil ? 'Valid until: ' + date(record.validUntil) : null,
    process.env.APP_BASE_URL ? 'Open your client portal: ' + process.env.APP_BASE_URL : 'Please contact us to accept or reject this quote.'
  ]);

  if (eventType === 'QUOTE_ACCEPTED') return textTemplate(prefix + ': quote accepted', [
    'A quote was accepted.',
    'Quote: ' + record.id,
    'Customer: ' + (customer.name || 'Unknown'),
    'Total: ' + money(record.total || record.amount),
    'Accepted: ' + date(record.acceptedAt || new Date()),
    record.jobId ? 'Linked job: ' + record.jobId : null
  ]);

  if (eventType === 'QUOTE_REJECTED') return textTemplate(prefix + ': quote rejected', [
    'A quote was rejected.',
    'Quote: ' + record.id,
    'Customer: ' + (customer.name || 'Unknown'),
    'Rejected: ' + date(record.rejectedAt || new Date()),
    context.reason ? 'Reason: ' + context.reason : null
  ]);

  if (eventType === 'INVOICE_SENT') return textTemplate(prefix + ': invoice sent', [
    'Your invoice is ready.',
    'Invoice: ' + record.number,
    'Amount due: ' + money(record.balanceDue || record.total || record.amount),
    record.dueDate ? 'Due: ' + date(record.dueDate) : null,
    process.env.APP_BASE_URL ? 'Open your client portal: ' + process.env.APP_BASE_URL : 'Please contact us for payment instructions.'
  ]);

  if (eventType === 'PAYMENT_RECEIVED') return textTemplate(prefix + ': payment received', [
    'A payment was received.',
    'Invoice: ' + (record.invoice && record.invoice.number || record.invoiceId),
    'Amount paid: ' + money(record.amount),
    'Method: ' + String(record.method || 'OTHER').replace(/_/g, ' '),
    record.receipt ? 'Receipt: ' + record.receipt.receiptNumber : null,
    'Payment date: ' + date(record.confirmedAt || record.receivedAt || record.createdAt)
  ]);

  if (eventType === 'JOB_SCHEDULED' || eventType === 'WORKER_ASSIGNED') return textTemplate(prefix + ': job scheduled', [
    'A job has been scheduled.',
    'Job: ' + record.title,
    'Service: ' + serviceName,
    'Scheduled: ' + date(record.scheduledStart),
    'Address: ' + (customer.address || record.address || 'Not set')
  ]);

  if (eventType === 'JOB_RESCHEDULED') return textTemplate(prefix + ': job rescheduled', [
    'A job has been rescheduled.',
    'Job: ' + record.title,
    context.oldStartsAt ? 'Previous time: ' + date(context.oldStartsAt) : null,
    'New time: ' + date(record.scheduledStart),
    'Address: ' + (customer.address || record.address || 'Not set')
  ]);

  if (eventType === 'JOB_COMPLETED') return textTemplate(prefix + ': job completed', [
    'A job was completed.',
    'Job: ' + record.title,
    'Service: ' + serviceName,
    'Completed: ' + date(record.completedAt || new Date()),
    record.proofCompletedAt || record.signatureCompletedAt ? 'Proof of work is available in FieldCore.' : null
  ]);

  return textTemplate(prefix + ': notification', ['A FieldCore notification was generated.']);
}

function buildWhatsAppTemplate(eventType, context = {}) {
  const record = context.record || {};
  const customer = record.customer || {};
  const serviceName = record.service && record.service.name || record.serviceName || record.title || 'Service request';
  const reference = record.number || record.receiptNumber || record.id || 'record';
  const lines = {
    BOOKING_CREATED: ['Booking created', serviceName, record.customerName || customer.name, record.preferredDate ? date(record.preferredDate) : null],
    QUOTE_SENT: ['Quote sent', reference, money(record.total || record.amount), process.env.APP_BASE_URL ? 'Portal: ' + process.env.APP_BASE_URL : null],
    QUOTE_ACCEPTED: ['Quote accepted', reference, customer.name || 'Customer', money(record.total || record.amount)],
    QUOTE_REJECTED: ['Quote rejected', reference, customer.name || 'Customer'],
    INVOICE_SENT: ['Invoice sent', record.number, money(record.balanceDue || record.total || record.amount), record.dueDate ? 'Due ' + date(record.dueDate) : null],
    PAYMENT_RECEIVED: ['Payment received', money(record.amount), 'Invoice ' + (record.invoice && record.invoice.number || record.invoiceId), record.receipt ? 'Receipt ' + record.receipt.receiptNumber : null],
    JOB_SCHEDULED: ['Job scheduled', record.title, date(record.scheduledStart), customer.address || record.address],
    JOB_RESCHEDULED: ['Job rescheduled', record.title, date(record.scheduledStart), customer.address || record.address],
    WORKER_ASSIGNED: ['Worker assigned', record.title, date(record.scheduledStart), customer.address || record.address],
    JOB_COMPLETED: ['Job completed', record.title, date(record.completedAt || new Date())]
  }[eventType] || ['FieldCore notification', reference];
  return { label: String(lines[0] || eventType).slice(0, 120), text: lines.filter(Boolean).join(' - ').slice(0, 900) };
}

module.exports = { buildNotificationTemplate, buildWhatsAppTemplate };
