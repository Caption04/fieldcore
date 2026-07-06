const { safeError } = require('../../../utils/crypto/redact');

async function testClickatell({ secrets }) {
  if (!secrets.apiKey) return { ok: false, error: 'Clickatell API key is required' };
  if (process.env.NODE_ENV === 'test' || typeof fetch !== 'function') return { ok: true, status: 'CONFIGURED' };
  try {
    const response = await fetch('https://platform.clickatell.com/public-client/user', { headers: { Authorization: secrets.apiKey } });
    if (!response.ok) return { ok: false, error: `Clickatell returned HTTP ${response.status}` };
    return { ok: true, status: 'ACTIVE' };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

async function sendClickatellSms({ connection, secrets, message }) {
  if (!secrets.apiKey) return { status: 'FAILED', error: 'Clickatell API key is not configured' };
  if (process.env.NODE_ENV === 'test' || typeof fetch !== 'function') return { status: 'SENT', providerMessageId: 'test-clickatell' };
  const response = await fetch('https://platform.clickatell.com/messages', {
    method: 'POST',
    headers: { Authorization: secrets.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ content: message.text, to: [message.to], from: connection.config && connection.config.senderId || undefined })
  });
  if (!response.ok) return { status: 'FAILED', error: `Clickatell returned HTTP ${response.status}` };
  const payload = await response.json().catch(() => ({}));
  return { status: 'SENT', providerMessageId: payload.messages && payload.messages[0] && payload.messages[0].apiMessageId };
}

module.exports = { sendClickatellSms, testClickatell };
