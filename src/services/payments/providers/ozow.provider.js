const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const { readPaymentProviderCredentialVersion, readPaymentProviderSecrets } = require('../paymentToken.service');
const { absoluteUrl, amountString, firstValue, lowerSha512, pairsToObject, parseFormPairs, secretValue } = require('./providerUtils');
const { assertNoRedirect, assertProviderUrl, secureFetchOptions } = require('./providerEndpointSecurity');

const DEFAULT_PAYMENT_ENDPOINT = 'https://pay.ozow.com/';
const DEFAULT_STATUS_ENDPOINT = 'https://api.ozow.com/GetTransactionByReference';
const OZOW_PAYMENT_HOSTS = new Set(['pay.ozow.com']);
const OZOW_STATUS_HOSTS = new Set(['api.ozow.com']);
const OZOW_REQUEST_ORDER = ['SiteCode', 'CountryCode', 'CurrencyCode', 'Amount', 'TransactionReference', 'BankReference', 'Optional1', 'Optional2', 'Optional3', 'Optional4', 'Optional5', 'Customer', 'CancelUrl', 'ErrorUrl', 'SuccessUrl', 'NotifyUrl', 'IsTest'];
const OZOW_RESPONSE_ORDER = ['SiteCode', 'TransactionId', 'TransactionReference', 'Amount', 'Status', 'Optional1', 'Optional2', 'Optional3', 'Optional4', 'Optional5', 'CurrencyCode', 'IsTest', 'StatusMessage'];

async function credentials(connection, options = {}) {
  const env = options.env || process.env;
  const version = options.credentialVersionId ? await readPaymentProviderCredentialVersion(connection, options.credentialVersionId) : null;
  if (options.credentialVersionId && !version) {
    const error = new Error('Payment credential version is not available');
    error.code = 'PAYMENT_CREDENTIAL_VERSION_UNAVAILABLE';
    throw error;
  }
  const secrets = options.secrets || version && version.values || await readPaymentProviderSecrets(connection);
  const mode = String(version && version.mode || env.OZOW_MODE || (env.NODE_ENV === 'production' ? 'live' : 'test')).toLowerCase();
  return {
    siteCode: secretValue(secrets, 'siteCode'), apiKey: secretValue(secrets, 'apiKey'), privateKey: secretValue(secrets, 'privateKey'),
    paymentEndpoint: DEFAULT_PAYMENT_ENDPOINT,
    statusEndpoint: DEFAULT_STATUS_ENDPOINT,
    isTest: mode !== 'live', mode,
    appBaseUrl: env.APP_BASE_URL || null,
    allowTestBaseFallback: env.NODE_ENV === 'test'
  };
}
function orderedHash(fields, privateKey, order) { return lowerSha512(order.map((key) => fields[key] == null ? '' : String(fields[key])).join('').concat(String(privateKey || '')).toLowerCase()); }
function ozowHash(fields, privateKey) { return orderedHash(fields, privateKey, OZOW_REQUEST_ORDER); }
function ozowResponseHash(fields, privateKey) { return orderedHash(fields, privateKey, OZOW_RESPONSE_ORDER); }
function timingSafeHex(expected, supplied) {
  const left = Buffer.from(String(expected || ''), 'hex'); const right = Buffer.from(String(supplied || ''), 'hex');
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}
function caseFields(payload, order) { return Object.fromEntries(order.map((key) => [key, firstValue(payload, [key]) || ''])); }
function verifyOzowHash(payload, privateKey) {
  const supplied = firstValue(payload, ['Hash', 'HashCheck']);
  return Boolean(supplied && privateKey && timingSafeHex(ozowResponseHash(caseFields(payload, OZOW_RESPONSE_ORDER), privateKey), String(supplied).toLowerCase()));
}
function safeStatusMessage(value) { return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/https?:\/\/\S+/gi, '').trim().slice(0, 160) || null; }
function assertPaymentEndpoint(value) { return assertProviderUrl(value, { provider: 'Ozow', hosts: OZOW_PAYMENT_HOSTS, exactPaths: ['/'] }); }
function assertStatusEndpoint(value) { return assertProviderUrl(value, { provider: 'Ozow', hosts: OZOW_STATUS_HOSTS, exactPaths: ['/GetTransactionByReference'] }); }
function normalizeBoolean(value) { return String(value).toLowerCase() === 'true'; }
function ozowEventId(payload) {
  const transactionId = firstValue(payload, ['TransactionId']); const reference = firstValue(payload, ['TransactionReference']); const status = String(firstValue(payload, ['Status']) || '').toUpperCase();
  return ['OZOW', transactionId || reference, status].filter(Boolean).join(':');
}
function matchingStatusResult(data, expected) {
  const rows = Array.isArray(data) ? data : Array.isArray(data && data.data) ? data.data : Array.isArray(data && data.results) ? data.results : data ? [data] : [];
  const matches = rows.filter((row) => {
    const modeKey = Object.keys(row || {}).find((key) => key.toLowerCase() === 'istest');
    const modeMatches = !modeKey || normalizeBoolean(row[modeKey]) === Boolean(expected.isTest);
    const providerIdMatches = !expected.providerPaymentId
      || String(firstValue(row, ['TransactionId']) || '') === String(expected.providerPaymentId);
    return String(firstValue(row, ['SiteCode']) || '') === String(expected.siteCode)
      && String(firstValue(row, ['TransactionReference']) || '') === String(expected.reference)
      && amountString(firstValue(row, ['Amount'])) === amountString(expected.amount)
      && String(firstValue(row, ['CurrencyCode']) || '').toUpperCase() === String(expected.currency).toUpperCase()
      && modeMatches
      && providerIdMatches;
  });
  if (expected.providerPaymentId) return matches[0] || null;
  return matches.length === 1 ? matches[0] : null;
}


function createOzowProvider({ connection = {}, secrets = null, credentialVersionId = null, env = process.env, fetchImpl = fetch } = {}) {
  return {
    async buildPaymentForm({ invoice, amount, currency, reference }) {
      const creds = await credentials(connection, { secrets, credentialVersionId, env });
      if (!creds.siteCode || !creds.apiKey || !creds.privateKey) throw new Error('Ozow payment details are not set up');
      if (String(creds.siteCode).length > 50) throw new Error('Ozow Site Code is too long');
      const customer = invoice && invoice.customer || {};
      const safeReference = String(reference || '').trim();
      const amountValue = amountString(amount);
      if (!safeReference || safeReference.length > 50 || /[\r\n\0]/.test(safeReference)) throw new Error('Ozow payment reference is invalid');
      if (new Prisma.Decimal(amountValue).greaterThan(new Prisma.Decimal('9999999.99'))) throw new Error('Ozow payment amount is too large');
      const rawBankReference = String(invoice && (invoice.number || invoice.id) || safeReference).replace(/[^A-Za-z0-9 _-]/g, '').trim();
      if (!rawBankReference) throw new Error('Ozow bank reference is invalid');
      const bankReference = rawBankReference.length <= 20 ? rawBankReference : `FC${crypto.createHash('sha256').update(rawBankReference).digest('hex').slice(0, 18).toUpperCase()}`;
      const callbackOptions = { allowTestFallback: creds.allowTestBaseFallback };
      const fields = {
        SiteCode: String(creds.siteCode).slice(0, 50), CountryCode: 'ZA', CurrencyCode: 'ZAR', Amount: amountValue, TransactionReference: safeReference,
        BankReference: bankReference,
        Optional1: String(invoice && invoice.id || '').slice(0, 50), Optional2: '', Optional3: '', Optional4: '', Optional5: '', Customer: String(customer.name || '').slice(0, 100),
        CancelUrl: absoluteUrl(`/api/payment-return/OZOW/${connection.callbackToken || connection.companyId}?reference=${encodeURIComponent(safeReference)}&result=cancelled`, creds.appBaseUrl, callbackOptions),
        ErrorUrl: absoluteUrl(`/api/payment-return/OZOW/${connection.callbackToken || connection.companyId}?reference=${encodeURIComponent(safeReference)}&result=error`, creds.appBaseUrl, callbackOptions),
        SuccessUrl: absoluteUrl(`/api/payment-return/OZOW/${connection.callbackToken || connection.companyId}?reference=${encodeURIComponent(safeReference)}&result=success`, creds.appBaseUrl, callbackOptions),
        NotifyUrl: absoluteUrl(`/api/payment-webhooks/OZOW/${connection.callbackToken || connection.companyId}`, creds.appBaseUrl, callbackOptions), IsTest: creds.isTest ? 'true' : 'false'
      };
      if (String(currency || 'ZAR').toUpperCase() !== 'ZAR') throw new Error('Ozow payments must use ZAR');
      fields.HashCheck = ozowHash(fields, creds.privateKey);
      return { action: assertPaymentEndpoint(creds.paymentEndpoint).toString(), fields, providerIsTest: creds.isTest };
    },
    async createCheckoutSession(input) { return this.createPaymentLink(input); },
    async createPaymentLink({ invoice, amount, currency, reference }) {
      const form = await this.buildPaymentForm({ invoice, amount, currency, reference });
      const creds = await credentials(connection, { secrets, credentialVersionId, env });
      return { provider: 'OZOW', checkoutUrl: absoluteUrl(`/api/public/payments/${encodeURIComponent(reference)}/ozow/redirect`, creds.appBaseUrl, { allowTestFallback: creds.allowTestBaseFallback }), providerStatus: 'CREATED', providerIsTest: form.providerIsTest, amount: amountString(amount), currency: 'ZAR', invoiceId: invoice && invoice.id };
    },
    async verifyWebhook(req) {
      const creds = await credentials(connection, { secrets, credentialVersionId, env });
      try {
        const payload = req.rawFormBody ? pairsToObject(parseFormPairs(req.rawFormBody)) : req.body || {};
        return verifyOzowHash(payload, creds.privateKey);
      } catch {
        return false;
      }
    },
    async handleWebhookEvent(payload = {}) {
      const status = String(firstValue(payload, ['Status']) || '').trim().toUpperCase();
      const rawMode = firstValue(payload, ['IsTest']);
      return { eventId: ozowEventId(payload), eventType: 'ozow.notification', reference: firstValue(payload, ['TransactionReference']), providerPaymentId: firstValue(payload, ['TransactionId']) || null, amount: firstValue(payload, ['Amount']), currency: firstValue(payload, ['CurrencyCode']) || 'ZAR', status, providerStatus: status, providerStatusMessage: safeStatusMessage(firstValue(payload, ['StatusMessage'])), providerIsTest: rawMode == null ? null : normalizeBoolean(rawMode) };
    },
    async queryByReference({ reference, amount, currency = 'ZAR', isTest, providerPaymentId = null }) {
      const creds = await credentials(connection, { secrets, credentialVersionId, env });
      if (!creds.siteCode || !creds.apiKey || !creds.privateKey) throw new Error('Ozow payment details are not set up');
      const endpoint = assertStatusEndpoint(creds.statusEndpoint);
      endpoint.searchParams.set('SiteCode', creds.siteCode); endpoint.searchParams.set('TransactionReference', reference); if (isTest) endpoint.searchParams.set('IsTest', 'true');
      const response = await fetchImpl(endpoint, secureFetchOptions({ headers: { ApiKey: creds.apiKey, Accept: 'application/json' } }));
      assertNoRedirect(response, 'Ozow');
      if (response.status === 401 || response.status === 403) { const error = new Error('Ozow did not accept these connection details'); error.code = 'OZOW_UNAUTHORIZED'; throw error; }
      if (!response.ok) {
        const error = new Error(response.status === 429 ? 'Ozow is busy. The payment will be checked again.' : 'Ozow payment status could not be checked');
        error.code = response.status === 429 || response.status >= 500 ? 'OZOW_TEMPORARY' : 'OZOW_STATUS_FAILED';
        throw error;
      }
      const contentType = response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') : null;
      if (contentType && !/application\/json/i.test(contentType)) throw new Error('Ozow returned an unexpected payment response');
      const text = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json());
      if (Buffer.byteLength(text, 'utf8') > 256 * 1024) throw new Error('Ozow payment response is too large');
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('Ozow returned an invalid payment response'); }
      const match = matchingStatusResult(data, { siteCode: creds.siteCode, reference, amount, currency, isTest, providerPaymentId });
      return { authorized: true, match, data: match ? undefined : null };
    },
    async getPaymentStatus(paymentLink) {
      const result = await this.queryByReference({ reference: paymentLink.reference, amount: paymentLink.amount, currency: paymentLink.currency, isTest: paymentLink.providerIsTest, providerPaymentId: paymentLink.providerPaymentId || null });
      if (!result.match) return { status: 'PENDING', reference: paymentLink.reference, verifiedAt: new Date() };
      const parsed = await this.handleWebhookEvent(result.match);
      parsed.providerIsTest = Boolean(paymentLink.providerIsTest);
      parsed.verifiedAt = new Date();
      return parsed;
    },
    async testConnection() {
      const creds = await credentials(connection, { secrets, credentialVersionId, env }); const saved = Boolean(creds.siteCode && creds.apiKey && creds.privateKey);
      if (!saved) return { ok: false, detailsSaved: false, provider: 'OZOW', mode: creds.mode, message: 'Add your Ozow Site Code, API key, and Private key.' };
      try {
        const reference = `FC-CHECK-${crypto.randomBytes(8).toString('hex')}`;
        const endpoint = assertStatusEndpoint(creds.statusEndpoint); endpoint.searchParams.set('SiteCode', creds.siteCode); endpoint.searchParams.set('TransactionReference', reference); if (creds.isTest) endpoint.searchParams.set('IsTest', 'true');
        const response = await fetchImpl(endpoint, secureFetchOptions({ headers: { ApiKey: creds.apiKey, Accept: 'application/json' } }));
        assertNoRedirect(response, 'Ozow');
        if (response.status === 401 || response.status === 403) return { ok: false, authorized: false, detailsSaved: true, provider: 'OZOW', mode: creds.mode, message: 'Ozow did not accept these connection details.' };
        if (!response.ok) return { ok: false, detailsSaved: true, provider: 'OZOW', mode: creds.mode, message: 'Ozow could not check this connection.' };
        return { ok: Boolean(connection.signedResponseVerifiedAt), authorized: true, detailsSaved: true, provider: 'OZOW', mode: creds.mode, message: connection.signedResponseVerifiedAt ? 'Ozow is ready.' : 'Details saved. A signed payment response is needed before this connection is ready.' };
      } catch { return { ok: false, detailsSaved: true, provider: 'OZOW', mode: creds.mode, message: 'Ozow could not check this connection.' }; }
    }
  };
}

module.exports = { OZOW_REQUEST_ORDER, OZOW_RESPONSE_ORDER, assertPaymentEndpoint, assertStatusEndpoint, createOzowProvider, matchingStatusResult, ozowEventId, ozowHash, ozowResponseHash, verifyOzowHash };
