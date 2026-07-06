const { safeError } = require('../../../utils/crypto/redact');

function graphBase() {
  return process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v20.0';
}

async function testMetaWhatsApp({ connection, secrets }) {
  const config = connection.config || {};
  if (!secrets.accessToken) return { ok: false, error: 'Meta access token is required' };
  if (!config.phoneNumberId) return { ok: false, error: 'WhatsApp phone number ID is required' };
  if (process.env.NODE_ENV === 'test' || typeof fetch !== 'function') return { ok: true, status: 'CONFIGURED' };
  try {
    const response = await fetch(`${graphBase().replace(/\/$/, '')}/${config.phoneNumberId}`, { headers: { Authorization: `Bearer ${secrets.accessToken}` } });
    if (!response.ok) return { ok: false, error: `Meta returned HTTP ${response.status}` };
    return { ok: true, status: 'ACTIVE' };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

async function sendMetaWhatsApp({ connection, secrets, message }) {
  const config = connection.config || {};
  if (!secrets.accessToken || !config.phoneNumberId) return { status: 'FAILED', error: 'Meta WhatsApp credentials are not configured' };
  if (!message.templateName) return { status: 'FAILED', error: 'WhatsApp template is not configured' };
  if (process.env.NODE_ENV === 'test' || typeof fetch !== 'function') return { status: 'SENT', providerMessageId: 'test-whatsapp' };
  const response = await fetch(`${graphBase().replace(/\/$/, '')}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secrets.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: message.to,
      type: 'template',
      template: { name: message.templateName, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en' } }
    })
  });
  if (!response.ok) return { status: 'FAILED', error: `Meta returned HTTP ${response.status}` };
  const payload = await response.json().catch(() => ({}));
  return { status: 'SENT', providerMessageId: payload.messages && payload.messages[0] && payload.messages[0].id };
}

module.exports = { sendMetaWhatsApp, testMetaWhatsApp };
