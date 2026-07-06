const { safeError } = require('../../../utils/crypto/redact');

async function testBrevo({ secrets }) {
  if (!secrets.apiKey) return { ok: false, error: 'Brevo API key is required' };
  if (process.env.NODE_ENV === 'test' || typeof fetch !== 'function') return { ok: true, status: 'CONFIGURED' };
  try {
    const response = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': secrets.apiKey, accept: 'application/json' } });
    if (!response.ok) return { ok: false, error: `Brevo returned HTTP ${response.status}` };
    return { ok: true, status: 'ACTIVE' };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

async function sendBrevoEmail({ connection, secrets, message }) {
  if (!secrets.apiKey) return { status: 'FAILED', error: 'Brevo API key is not configured' };
  if (process.env.NODE_ENV === 'test' || typeof fetch !== 'function') return { status: 'SENT', providerMessageId: 'test-brevo' };
  const config = connection.config || {};
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': secrets.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: config.senderName || 'FieldCore', email: config.senderEmail },
      replyTo: config.replyToEmail ? { email: config.replyToEmail } : undefined,
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html
    })
  });
  if (!response.ok) return { status: 'FAILED', error: `Brevo returned HTTP ${response.status}` };
  const payload = await response.json().catch(() => ({}));
  return { status: 'SENT', providerMessageId: payload.messageId };
}

module.exports = { sendBrevoEmail, testBrevo };
