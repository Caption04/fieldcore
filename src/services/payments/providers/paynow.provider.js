const crypto = require('crypto');
const { readPaymentProviderCredentialVersion, readPaymentProviderSecrets } = require('../paymentToken.service');
const { absoluteUrl, amountString, firstValue, formEncode, pairsToObject, parseFormPairs, secretValue, upperSha512 } = require('./providerUtils');
const { assertNoRedirect, assertProviderUrl, secureFetchOptions } = require('./providerEndpointSecurity');

const DEFAULT_ENDPOINT = 'https://www.paynow.co.zw/interface/initiatetransaction';
const DEFAULT_TRACE_ENDPOINT = 'https://www.paynow.co.zw/interface/trace';
const PAYNOW_HOSTS = new Set(['paynow.co.zw', 'www.paynow.co.zw']);
const IMPORTANT_STATUSES = new Set(['PAID', 'AWAITING DELIVERY', 'DELIVERED', 'DISPUTED', 'REFUNDED']);
const PAYNOW_REQUEST_ORDER = ['id', 'reference', 'amount', 'additionalinfo', 'returnurl', 'resulturl', 'authemail', 'merchanttrace', 'status'];

async function credentials(connection, options = {}) {
  const env = options.env || process.env;
  const version = options.credentialVersionId ? await readPaymentProviderCredentialVersion(connection, options.credentialVersionId) : null;
  if (options.credentialVersionId && !version) {
    const error = new Error('Payment credential version is not available');
    error.code = 'PAYMENT_CREDENTIAL_VERSION_UNAVAILABLE';
    throw error;
  }
  const secrets = options.secrets || version && version.values || await readPaymentProviderSecrets(connection);
  const mode = String(version && version.mode || env.PAYNOW_MODE || (env.NODE_ENV === 'production' ? 'live' : 'test')).toLowerCase();
  const integrationId = secretValue(secrets, 'integrationId');
  const boundTestEmail = mode !== 'live'
    && String(connection.companyId || '') === String(env.PAYNOW_TEST_COMPANY_ID || '')
    && String(integrationId || '') === String(env.PAYNOW_TEST_INTEGRATION_ID || '')
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(env.PAYNOW_TEST_AUTH_EMAIL || ''))
    ? env.PAYNOW_TEST_AUTH_EMAIL : null;
  return {
    integrationId,
    integrationKey: secretValue(secrets, 'integrationKey'),
    endpoint: DEFAULT_ENDPOINT,
    traceEndpoint: DEFAULT_TRACE_ENDPOINT,
    testAuthEmail: boundTestEmail,
    mode,
    isTest: mode !== 'live',
    appBaseUrl: env.APP_BASE_URL || null,
    allowTestBaseFallback: env.NODE_ENV === 'test'
  };
}

function payloadParts(payload) {
  if (typeof payload === 'string') {
    const pairs = parseFormPairs(payload);
    return { pairs, values: pairsToObject(pairs) };
  }
  if (Array.isArray(payload)) {
    return { pairs: payload, values: pairsToObject(payload) };
  }
  const values = payload || {};
  return { pairs: Object.entries(values), values };
}

function paynowHash(values, integrationKey) {
  const pairs = Array.isArray(values) ? values : Object.entries(values || {});
  const text = pairs
    .filter(([key]) => String(key).toLowerCase() !== 'hash')
    .map(([, value]) => value == null ? '' : String(value))
    .join('');
  return upperSha512(text + String(integrationKey || ''));
}

function timingSafeHex(expected, supplied) {
  const left = Buffer.from(String(expected || ''), 'hex');
  const right = Buffer.from(String(supplied || ''), 'hex');
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPaynowHash(payload, integrationKey) {
  const { pairs, values } = payloadParts(payload);
  const supplied = firstValue(values, ['hash']);
  return Boolean(supplied && integrationKey && timingSafeHex(paynowHash(pairs, integrationKey), String(supplied).toUpperCase()));
}

function parsePaynowPayload(payload) { return payloadParts(payload).values; }
function normalizePaynowStatus(status) { return String(status || 'Created').trim().replace(/\s+/g, ' ').toUpperCase(); }
function paynowEventId(payload) {
  const parsed = parsePaynowPayload(payload);
  const reference = firstValue(parsed, ['reference']);
  const providerId = firstValue(parsed, ['paynowreference']);
  const status = normalizePaynowStatus(firstValue(parsed, ['status']));
  return ['PAYNOW', providerId || reference, status].filter(Boolean).join(':');
}
function safePaynowMessage(value) {
  const text = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/https?:\/\/\S+/gi, '').trim();
  return text ? text.slice(0, 160) : null;
}
function assertPaynowPollUrl(value) {
  const url = assertProviderUrl(value, { provider: 'Paynow', hosts: PAYNOW_HOSTS, pathPrefixes: ['/Interface/CheckPayment/', '/interface/checkpayment/'] });
  if (!/^\/interface\/checkpayment\//i.test(url.pathname)) throw new Error('Paynow address is not allowed');
  return url.toString();
}
async function postForm(fetchImpl, url, fields, timeoutMs = 10000) {
  const response = await fetchImpl(url, secureFetchOptions({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: formEncode(fields), signal: AbortSignal.timeout(timeoutMs) }));
  assertNoRedirect(response, 'Paynow');
  const text = await response.text();
  const pairs = parseFormPairs(text);
  return { response, text, pairs, parsed: pairsToObject(pairs) };
}

function assertMerchantTrace(value) {
  const trace = String(value || '').trim();
  if (!trace || trace.length > 32 || !/^[A-Za-z0-9_-]+$/.test(trace)) throw new Error('A valid payment attempt reference is required');
  return trace;
}

function createPaynowProvider({ connection = {}, secrets = null, credentialVersionId = null, env = process.env, fetchImpl = fetch } = {}) {
  return {
    async testConnection() {
      const creds = await credentials(connection, { secrets, credentialVersionId, env });
      const detailsSaved = Boolean(creds.integrationId && creds.integrationKey);
      const ok = detailsSaved && Boolean(connection.signedResponseVerifiedAt);
      return { ok, detailsSaved, provider: 'PAYNOW', mode: creds.mode, message: ok ? 'Paynow is ready.' : detailsSaved ? 'Details saved. A payment response is needed before this connection is ready.' : 'Add your Paynow ID and key.' };
    },

    async createCheckoutSession(input) { return this.createPaymentLink(input); },

    async createPaymentLink({ invoice, amount, currency, reference, merchantTrace }) {
      const creds = await credentials(connection, { secrets, credentialVersionId, env });
      if (!creds.integrationId || !creds.integrationKey) throw new Error('Paynow payment details are not set up');
      if (String(currency || 'USD').toUpperCase() !== 'USD') throw new Error('Paynow payments must use USD');
      const trace = assertMerchantTrace(merchantTrace);
      const safeReference = String(reference || '').trim();
      if (!safeReference || safeReference.length > 100 || /[\r\n\0]/.test(safeReference)) throw new Error('Payment reference is invalid');
      const customerEmail = invoice && invoice.customer && invoice.customer.email;
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customerEmail || '')) ? customerEmail : null;
      const callbackOptions = { allowTestFallback: creds.allowTestBaseFallback };
      const fields = {
        id: creds.integrationId,
        reference: safeReference,
        amount: amountString(amount),
        additionalinfo: `Invoice ${invoice && (invoice.number || invoice.id) || safeReference}`.slice(0, 100),
        returnurl: absoluteUrl(`/api/payment-return/PAYNOW/${connection.callbackToken || connection.companyId}?reference=${encodeURIComponent(safeReference)}`, creds.appBaseUrl, callbackOptions),
        resulturl: absoluteUrl(`/api/payment-webhooks/PAYNOW/${connection.callbackToken || connection.companyId}`, creds.appBaseUrl, callbackOptions),
        authemail: creds.isTest ? creds.testAuthEmail : validEmail,
        merchanttrace: trace,
        status: 'Message'
      };
      if (!fields.authemail) delete fields.authemail;
      const orderedFields = PAYNOW_REQUEST_ORDER.filter((key) => fields[key] !== undefined).map((key) => [key, fields[key]]);
      fields.hash = paynowHash(orderedFields, creds.integrationKey);
      const endpoint = assertProviderUrl(creds.endpoint, { provider: 'Paynow', hosts: PAYNOW_HOSTS, exactPaths: ['/interface/initiatetransaction'] });
      const { response, parsed, pairs } = await postForm(fetchImpl, endpoint, [...orderedFields, ['hash', fields.hash]]);
      const status = String(firstValue(parsed, ['status']) || '');
      if (!response.ok) throw new Error('Paynow could not start the payment');
      if (status.toLowerCase() === 'error') {
        const error = new Error('Paynow could not start the payment');
        error.safeProviderMessage = safePaynowMessage(firstValue(parsed, ['error']));
        error.code = 'PAYNOW_REJECTED';
        throw error;
      }
      if (status.toLowerCase() !== 'ok' || !verifyPaynowHash(pairs, creds.integrationKey)) throw new Error('Paynow returned an untrusted payment response');
      const checkoutValue = firstValue(parsed, ['browserurl']);
      const checkoutUrl = checkoutValue ? assertProviderUrl(checkoutValue, { provider: 'Paynow', hosts: PAYNOW_HOSTS, pathPrefixes: ['/'] }).toString() : null;
      const pollUrl = assertPaynowPollUrl(firstValue(parsed, ['pollurl']));
      if (!checkoutUrl) throw new Error('Paynow did not return a payment page');
      return { provider: 'PAYNOW', checkoutUrl, pollUrl, merchantTrace: trace, providerStatus: 'CREATED', providerIsTest: creds.isTest, amount: fields.amount, currency: 'USD', invoiceId: invoice && invoice.id, verifiedAt: new Date() };
    },

    async verifyWebhook(req) {
      const creds = await credentials(connection, { secrets, credentialVersionId, env });
      try {
        return verifyPaynowHash(req.rawFormBody || req.body || {}, creds.integrationKey);
      } catch {
        return false;
      }
    },

    async handleWebhookEvent(payload = {}) {
      const parsed = parsePaynowPayload(payload);
      const providerStatus = normalizePaynowStatus(firstValue(parsed, ['status']));
      return {
        eventId: paynowEventId(parsed), eventType: 'paynow.status_update', reference: firstValue(parsed, ['reference']),
        providerPaymentId: firstValue(parsed, ['paynowreference']) || null, amount: firstValue(parsed, ['amount']), currency: 'USD',
        status: providerStatus, providerStatus, providerStatusMessage: safePaynowMessage(firstValue(parsed, ['error'])), pollUrl: firstValue(parsed, ['pollurl']) || null,
        important: IMPORTANT_STATUSES.has(providerStatus)
      };
    },

    async getPaymentStatus(paymentLink) {
      const creds = await credentials(connection, { secrets, credentialVersionId, env });
      const legacyPollUrl = paymentLink && /^https:\/\//i.test(String(paymentLink.externalId || '')) ? paymentLink.externalId : null;
      const storedPollUrl = paymentLink && (paymentLink.pollUrl || legacyPollUrl);
      if (!storedPollUrl) throw new Error('Paynow payment status is not available');
      const url = assertPaynowPollUrl(storedPollUrl);
      const { response, parsed, pairs } = await postForm(fetchImpl, url, []);
      if (!response.ok || !verifyPaynowHash(pairs, creds.integrationKey)) throw new Error('Paynow payment status could not be verified');
      const result = await this.handleWebhookEvent(parsed);
      result.verifiedAt = new Date();
      return result;
    },

    async recoverByMerchantTrace(merchantTrace) {
      const creds = await credentials(connection, { secrets, credentialVersionId, env });
      if (!creds.integrationId || !creds.integrationKey) throw new Error('Paynow payment details are not set up');
      const trace = assertMerchantTrace(merchantTrace);
      const ordered = [['id', creds.integrationId], ['merchanttrace', trace], ['status', 'Message']];
      const hash = paynowHash(ordered, creds.integrationKey);
      const endpoint = assertProviderUrl(creds.traceEndpoint, { provider: 'Paynow', hosts: PAYNOW_HOSTS, exactPaths: ['/interface/trace'] });
      const { response, parsed, pairs } = await postForm(fetchImpl, endpoint, [...ordered, ['hash', hash]]);
      if (!response.ok) throw new Error('Paynow recovery could not be completed');
      const status = normalizePaynowStatus(firstValue(parsed, ['status']));
      if (status === 'ERROR') return { found: null, status, safeMessage: safePaynowMessage(firstValue(parsed, ['error'])) };
      if (!verifyPaynowHash(pairs, creds.integrationKey)) throw new Error('Paynow recovery response could not be verified');
      if (status === 'NOTFOUND') return { found: false, status };
      const result = await this.handleWebhookEvent(parsed);
      return { found: true, ...result, pollUrl: assertPaynowPollUrl(result.pollUrl), verifiedAt: new Date() };
    }
  };
}

module.exports = { IMPORTANT_STATUSES, PAYNOW_HOSTS, PAYNOW_REQUEST_ORDER, assertPaynowPollUrl, createPaynowProvider, normalizePaynowStatus, paynowEventId, paynowHash, verifyPaynowHash };
