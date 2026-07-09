const crypto = require('crypto');
const { createPayFastProvider } = require('./providers/payfast.provider');
const { createYocoProvider } = require('./providers/yoco.provider');
const { createOzowProvider } = require('./providers/ozow.provider');
const { createPaynowProvider } = require('./providers/paynow.provider');
const { createManualProvider } = require('./providers/manual.provider');

const PROVIDERS = ['PAYFAST', 'YOCO', 'OZOW', 'PAYNOW', 'SNAPSCAN', 'ZAPPER', 'STRIPE', 'MANUAL_BANK', 'ECOCASH_MANUAL', 'MOCK'];

function createPaymentProvider(provider, options = {}) {
  if (provider === 'PAYFAST') return createPayFastProvider(options);
  if (provider === 'YOCO') return createYocoProvider(options);
  if (provider === 'OZOW') return createOzowProvider(options);
  if (provider === 'PAYNOW') return createPaynowProvider(options);
  return createManualProvider({ ...options, provider });
}

function safeCompare(expected, actual) {
  const left = Buffer.from(String(expected || ''), 'hex');
  const right = Buffer.from(String(actual || ''), 'hex');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function signPayload(secret, payload) {
  return crypto.createHmac('sha256', String(secret || '')).update(JSON.stringify(payload || {})).digest('hex');
}

function verifySharedSecretWebhook(connection, req) {
  const secret = connection && connection.config && connection.config.webhookSecret;
  if (!secret) return Boolean(connection && connection.config && connection.config.mockMode);
  const signature = req.headers['x-fieldcore-payment-signature'] || req.headers['x-payfast-signature'] || req.headers['x-yoco-signature'] || req.headers['x-ozow-signature'] || req.headers['x-paynow-signature'];
  return safeCompare(signPayload(secret, req.body || {}), signature);
}

function safePaymentProviderConnection(connection) {
  if (!connection) return connection;
  const config = { ...(connection.config || {}) };
  for (const key of Object.keys(config)) if (/secret|token|key|password/i.test(key)) config[key] = '[redacted]';
  return {
    id: connection.id,
    companyId: connection.companyId,
    provider: connection.provider,
    displayName: connection.displayName || null,
    status: connection.status,
    config,
    lastTestedAt: connection.lastTestedAt || null,
    lastTestStatus: connection.lastTestStatus || null,
    lastTestError: connection.lastTestError || null,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  };
}

module.exports = { PROVIDERS, createPaymentProvider, safePaymentProviderConnection, signPayload, verifySharedSecretWebhook };
