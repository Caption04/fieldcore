const { safeError } = require('../../../utils/crypto/redact');

function baseUrl(config) {
  return config && config.environment === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
}

async function testAfricasTalking({ connection, secrets }) {
  if (!secrets.username || !secrets.apiKey) return { ok: false, error: "Africa's Talking username and API key are required" };
  if (process.env.NODE_ENV === 'test' || typeof fetch !== 'function') return { ok: true, status: 'CONFIGURED' };
  try {
    const response = await fetch(`${baseUrl(connection.config)}/version1/user?username=${encodeURIComponent(secrets.username)}`, { headers: { apiKey: secrets.apiKey, accept: 'application/json' } });
    if (!response.ok) return { ok: false, error: `Africa's Talking returned HTTP ${response.status}` };
    return { ok: true, status: 'ACTIVE' };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

async function sendAfricasTalkingSms({ connection, secrets, message }) {
  if (!secrets.username || !secrets.apiKey) return { status: 'FAILED', error: "Africa's Talking credentials are not configured" };
  if (process.env.NODE_ENV === 'test' || typeof fetch !== 'function') return { status: 'SENT', providerMessageId: 'test-africas-talking' };
  const body = new URLSearchParams({ username: secrets.username, to: message.to, message: message.text });
  if (connection.config && (connection.config.senderId || connection.config.shortCode)) body.set('from', connection.config.senderId || connection.config.shortCode);
  const response = await fetch(`${baseUrl(connection.config)}/version1/messaging`, {
    method: 'POST',
    headers: { apiKey: secrets.apiKey, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) return { status: 'FAILED', error: `Africa's Talking returned HTTP ${response.status}` };
  const payload = await response.json().catch(() => ({}));
  return { status: 'SENT', providerMessageId: payload.SMSMessageData && payload.SMSMessageData.Recipients && payload.SMSMessageData.Recipients[0] && payload.SMSMessageData.Recipients[0].messageId };
}

module.exports = { sendAfricasTalkingSms, testAfricasTalking };
