const { readPaymentProviderSecrets } = require('../paymentToken.service');
const {
  absoluteUrl,
  amountString,
  configValue,
  firstValue,
  formEncode,
  getHeader,
  lowerSha512,
  normalizePaymentStatus,
  secretValue
} = require('./providerUtils');

const DEFAULT_ENDPOINT = 'https://pay.ozow.com';

async function credentials(connection) {
  const secrets = await readPaymentProviderSecrets(connection);
  return {
    siteCode: secretValue(secrets, 'siteCode', 'OZOW_SITE_CODE'),
    apiKey: secretValue(secrets, 'apiKey', 'OZOW_API_KEY'),
    privateKey: secretValue(secrets, 'privateKey', 'OZOW_PRIVATE_KEY'),
    endpoint: configValue(connection, 'endpoint', 'OZOW_ENDPOINT', DEFAULT_ENDPOINT),
    countryCode: configValue(connection, 'countryCode', 'OZOW_COUNTRY_CODE', 'ZA'),
    currencyCode: configValue(connection, 'currencyCode', 'OZOW_CURRENCY_CODE', 'ZAR'),
    successUrl: configValue(connection, 'successUrl', 'OZOW_SUCCESS_URL'),
    errorUrl: configValue(connection, 'errorUrl', 'OZOW_ERROR_URL'),
    cancelUrl: configValue(connection, 'cancelUrl', 'OZOW_CANCEL_URL'),
    notifyUrl: configValue(connection, 'notifyUrl', 'OZOW_NOTIFY_URL'),
    isTest: String(configValue(connection, 'isTest', 'OZOW_IS_TEST', configValue(connection, 'mode', 'OZOW_MODE', 'test'))).toLowerCase() !== 'live'
  };
}

const OZOW_HASH_ORDER = [
  'SiteCode',
  'CountryCode',
  'CurrencyCode',
  'Amount',
  'TransactionReference',
  'BankReference',
  'Optional1',
  'Optional2',
  'Optional3',
  'Optional4',
  'Optional5',
  'Customer',
  'CustomerEmail',
  'NotifyUrl',
  'SuccessUrl',
  'ErrorUrl',
  'CancelUrl',
  'IsTest'
];

function ozowHash(fields, privateKey) {
  let text = '';
  for (const key of OZOW_HASH_ORDER) text += fields[key] == null ? '' : String(fields[key]);
  text += String(privateKey || '');
  return lowerSha512(text.toLowerCase());
}

function verifyOzowHash(payload, privateKey) {
  const supplied = firstValue(payload, ['HashCheck', 'hashcheck', 'Hash', 'hash']);
  if (!supplied || !privateKey) return false;
  const fields = {};
  for (const key of OZOW_HASH_ORDER) fields[key] = firstValue(payload, [key, key.charAt(0).toLowerCase() + key.slice(1)]);
  return ozowHash(fields, privateKey) === String(supplied).toLowerCase();
}

function returnUrl(connection, provider, reference, configured) {
  return absoluteUrl(configured) || absoluteUrl(`/api/payment-return/${provider}/${connection.companyId}?reference=${encodeURIComponent(reference)}`);
}

function createOzowProvider({ connection = {} } = {}) {
  return {
    async testConnection() {
      const creds = await credentials(connection);
      const ok = Boolean(creds.siteCode && creds.apiKey && creds.privateKey);
      return { ok, provider: 'OZOW', mode: creds.isTest ? 'test' : 'live', message: ok ? 'Ozow credentials are configured.' : 'Ozow Site Code, API Key, and Private Key are required.' };
    },

    async createCheckoutSession(input) {
      return this.createPaymentLink(input);
    },

    async createPaymentLink({ invoice, amount, currency, reference }) {
      const creds = await credentials(connection);
      if (!creds.siteCode || !creds.privateKey) throw new Error('Ozow Site Code and Private Key are required');
      const finalAmount = amountString(amount);
      const customer = invoice && invoice.customer || {};
      const fields = {
        SiteCode: creds.siteCode,
        CountryCode: creds.countryCode || 'ZA',
        CurrencyCode: currency || creds.currencyCode || 'ZAR',
        Amount: finalAmount,
        TransactionReference: reference,
        BankReference: (invoice && (invoice.number || invoice.id) || reference).slice(0, 20),
        Optional1: invoice && invoice.id || '',
        Optional2: connection.companyId || '',
        Optional3: '',
        Optional4: '',
        Optional5: '',
        Customer: customer.name || '',
        CustomerEmail: customer.email || '',
        NotifyUrl: absoluteUrl(creds.notifyUrl) || absoluteUrl(`/api/payment-webhooks/OZOW/${connection.companyId}`),
        SuccessUrl: returnUrl(connection, 'OZOW', reference, creds.successUrl),
        ErrorUrl: returnUrl(connection, 'OZOW', reference, creds.errorUrl),
        CancelUrl: returnUrl(connection, 'OZOW', reference, creds.cancelUrl),
        IsTest: creds.isTest ? 'true' : 'false'
      };
      fields.HashCheck = ozowHash(fields, creds.privateKey);
      const response = await fetch(creds.endpoint, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          ...(creds.apiKey ? { ApiKey: creds.apiKey } : {})
        },
        body: formEncode(fields)
      });
      const location = getHeader(response.headers, 'location');
      const text = location ? '' : await response.text();
      if (![200, 201, 202, 302, 303].includes(response.status)) throw new Error(`Ozow payment request failed with HTTP ${response.status}${text ? ': ' + text.slice(0, 160) : ''}`);
      const checkoutUrl = location || firstValue(safeJson(text), ['url', 'paymentUrl', 'paymentRequestUrl', 'checkoutUrl']) || (String(text || '').trim().startsWith('http') ? String(text).trim() : null);
      if (!checkoutUrl) throw new Error('Ozow response did not include a checkout URL');
      return {
        provider: 'OZOW',
        externalId: firstValue(safeJson(text), ['requestId', 'paymentRequestId', 'id']) || reference,
        checkoutUrl,
        status: 'CREATED',
        amount: finalAmount,
        currency: fields.CurrencyCode,
        invoiceId: invoice && invoice.id
      };
    },

    async verifyWebhook(req) {
      const creds = await credentials(connection);
      return verifyOzowHash(req.body || {}, creds.privateKey);
    },

    async handleWebhookEvent(payload = {}) {
      const reference = firstValue(payload, ['TransactionReference', 'transactionReference', 'reference']);
      const providerPaymentId = firstValue(payload, ['TransactionId', 'transactionId', 'OzowReference', 'ozowReference', 'PaymentId', 'paymentId']);
      const status = firstValue(payload, ['Status', 'status', 'PaymentStatus', 'paymentStatus']);
      return {
        eventId: providerPaymentId || [reference, status].filter(Boolean).join(':') || null,
        eventType: 'ozow.notify',
        reference,
        providerPaymentId: providerPaymentId || null,
        amount: firstValue(payload, ['Amount', 'amount']),
        currency: firstValue(payload, ['CurrencyCode', 'currencyCode', 'currency']) || 'ZAR',
        status: normalizePaymentStatus(status)
      };
    },

    async getPaymentStatus(paymentLink) {
      return { status: paymentLink.status || 'PENDING', provider: 'OZOW', externalId: paymentLink.externalId || null };
    }
  };
}

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

module.exports = { createOzowProvider, ozowHash, verifyOzowHash };
