const { readPaymentProviderSecrets } = require('../paymentToken.service');
const {
  absoluteUrl,
  amountString,
  configValue,
  firstValue,
  formEncode,
  normalizePaymentStatus,
  parseFormBody,
  secretValue,
  upperSha512
} = require('./providerUtils');

const DEFAULT_ENDPOINT = 'https://www.paynow.co.zw/interface/initiatetransaction';

async function credentials(connection) {
  const secrets = await readPaymentProviderSecrets(connection);
  const integrationId = secretValue(secrets, 'integrationId', 'PAYNOW_INTEGRATION_ID') || secretValue(secrets, 'id', 'PAYNOW_ID');
  const integrationKey = secretValue(secrets, 'integrationKey', 'PAYNOW_INTEGRATION_KEY') || secretValue(secrets, 'key', 'PAYNOW_KEY');
  return {
    integrationId,
    integrationKey,
    endpoint: configValue(connection, 'endpoint', 'PAYNOW_ENDPOINT', DEFAULT_ENDPOINT),
    resultUrl: configValue(connection, 'resultUrl', 'PAYNOW_RESULT_URL'),
    returnUrl: configValue(connection, 'returnUrl', 'PAYNOW_RETURN_URL'),
    authemail: configValue(connection, 'authemail', 'PAYNOW_AUTH_EMAIL') || configValue(connection, 'authEmail', 'PAYNOW_AUTH_EMAIL') || process.env.EMAIL_FROM || 'payments@fieldcore.local',
    mode: configValue(connection, 'mode', 'PAYNOW_MODE', 'test')
  };
}

function paynowHash(values, integrationKey) {
  let text = '';
  for (const [key, value] of Object.entries(values || {})) {
    if (String(key).toLowerCase() === 'hash') continue;
    text += value == null ? '' : String(value);
  }
  text += String(integrationKey || '');
  return upperSha512(text);
}

function verifyPaynowHash(values, integrationKey) {
  const supplied = firstValue(values, ['hash']);
  if (!supplied || !integrationKey) return false;
  return paynowHash(values, integrationKey) === String(supplied).toUpperCase();
}

function defaultResultUrl(connection) {
  return absoluteUrl(`/api/payment-webhooks/PAYNOW/${connection.companyId}`);
}

function defaultReturnUrl(connection, reference) {
  return absoluteUrl(`/api/payment-return/PAYNOW/${connection.companyId}?reference=${encodeURIComponent(reference)}`);
}

function parsePaynowPayload(payload) {
  if (typeof payload === 'string') return parseFormBody(payload);
  return payload || {};
}

function createPaynowProvider({ connection = {} } = {}) {
  return {
    async testConnection() {
      const creds = await credentials(connection);
      const ok = Boolean(creds.integrationId && creds.integrationKey);
      return { ok, provider: 'PAYNOW', mode: creds.mode, message: ok ? 'Paynow credentials are configured.' : 'Paynow Integration ID and Integration Key are not configured.' };
    },

    async createCheckoutSession(input) {
      return this.createPaymentLink(input);
    },

    async createPaymentLink({ invoice, amount, currency, reference }) {
      const creds = await credentials(connection);
      if (!creds.integrationId || !creds.integrationKey) throw new Error('Paynow Integration ID and Integration Key are required');
      const finalAmount = amountString(amount);
      const resultUrl = absoluteUrl(creds.resultUrl) || defaultResultUrl(connection);
      const returnUrl = absoluteUrl(creds.returnUrl) || defaultReturnUrl(connection, reference);
      const fields = {
        id: creds.integrationId,
        reference,
        amount: finalAmount,
        additionalinfo: `FieldCore invoice ${invoice && (invoice.number || invoice.id) || reference}`,
        returnurl: returnUrl,
        resulturl: resultUrl,
        authemail: creds.authemail,
        status: 'Message'
      };
      fields.hash = paynowHash(fields, creds.integrationKey);
      const response = await fetch(creds.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formEncode(fields)
      });
      const text = await response.text();
      const parsed = parseFormBody(text);
      if (!response.ok) throw new Error(`Paynow initiate failed with HTTP ${response.status}`);
      if (!verifyPaynowHash(parsed, creds.integrationKey)) throw new Error('Paynow response hash validation failed');
      const status = firstValue(parsed, ['status']);
      if (String(status || '').toLowerCase() !== 'ok') throw new Error(firstValue(parsed, ['error']) || 'Paynow rejected the transaction request');
      const checkoutUrl = firstValue(parsed, ['browserurl', 'BrowserUrl']);
      const pollUrl = firstValue(parsed, ['pollurl', 'PollUrl']);
      if (!checkoutUrl || !pollUrl) throw new Error('Paynow response did not include browserurl and pollurl');
      return {
        provider: 'PAYNOW',
        externalId: pollUrl,
        checkoutUrl,
        pollUrl,
        status: 'CREATED',
        amount: finalAmount,
        currency,
        invoiceId: invoice && invoice.id
      };
    },

    async verifyWebhook(req) {
      const creds = await credentials(connection);
      return verifyPaynowHash(parsePaynowPayload(req.body || {}), creds.integrationKey);
    },

    async handleWebhookEvent(payload = {}) {
      const parsed = parsePaynowPayload(payload);
      const paynowReference = firstValue(parsed, ['paynowreference', 'PaynowReference', 'referenceNumber']);
      const reference = firstValue(parsed, ['reference', 'Reference']);
      const status = firstValue(parsed, ['status', 'Status']);
      return {
        eventId: paynowReference || [reference, status].filter(Boolean).join(':') || null,
        eventType: 'paynow.status_update',
        reference,
        providerPaymentId: paynowReference || null,
        amount: firstValue(parsed, ['amount', 'Amount']),
        currency: firstValue(parsed, ['currency', 'Currency']) || 'USD',
        status: normalizePaymentStatus(status),
        pollUrl: firstValue(parsed, ['pollurl', 'PollUrl']) || null
      };
    },

    async getPaymentStatus(paymentLink) {
      const creds = await credentials(connection);
      if (!paymentLink || !paymentLink.externalId) return { status: 'PENDING', provider: 'PAYNOW' };
      const response = await fetch(paymentLink.externalId, { method: 'POST' });
      const text = await response.text();
      const parsed = parseFormBody(text);
      if (!response.ok) throw new Error(`Paynow poll failed with HTTP ${response.status}`);
      if (!verifyPaynowHash(parsed, creds.integrationKey)) throw new Error('Paynow poll hash validation failed');
      return this.handleWebhookEvent(parsed);
    }
  };
}

module.exports = { createPaynowProvider, paynowHash, verifyPaynowHash };
