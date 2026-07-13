const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { assertPaynowPollUrl, createPaynowProvider, normalizePaynowStatus, paynowEventId, paynowHash, verifyPaynowHash } = require('../src/services/payments/providers/paynow.provider');
const { OZOW_REQUEST_ORDER, OZOW_RESPONSE_ORDER, createOzowProvider, matchingStatusResult, ozowEventId, ozowHash, ozowResponseHash, verifyOzowHash } = require('../src/services/payments/providers/ozow.provider');

function textResponse(text, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => text, headers: { get: () => null } };
}

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function paynowConnection() { return { id: 'pn-connection', companyId: 'company-a' }; }
function paynowSecrets() { return { INTEGRATION_ID: '123', INTEGRATION_KEY: 'SECRET' }; }
function invoice(email = 'buyer@example.com') { return { id: 'invoice-a', number: 'INV-1', customer: { name: 'Buyer', email } }; }

test('Paynow request hash follows the posted field order', () => {
  const fields = {
    id: '123', reference: 'INV-100', amount: '10.00', additionalinfo: 'Invoice INV-100',
    returnurl: 'https://field.test/return', resulturl: 'https://field.test/result', authemail: 'buyer@example.com', merchanttrace: 'TRACE123', status: 'Message'
  };
  assert.equal(paynowHash(fields, 'SECRET'), 'B41B1D8BDB690052A6AE62D306D46B6D115BEEA55D0922A7D07DF3BE953EA3C37C7F08099726029EA5098D0F09E0627946BA824A7A315B425C33CF12AC89E4D0');
});

test('Paynow verifies signed form responses and gives each status a distinct event id', () => {
  const created = { reference: 'FC-1', paynowreference: 'PN-1', amount: '5.00', status: 'Created' };
  created.hash = paynowHash(created, 'secret');
  assert.equal(verifyPaynowHash(created, 'secret'), true);
  assert.notEqual(paynowEventId(created), paynowEventId({ ...created, status: 'Paid' }));
  assert.equal(normalizePaynowStatus('Awaiting   Delivery'), 'AWAITING DELIVERY');
});

test('Paynow polling blocks attacker-controlled URLs', () => {
  assert.match(assertPaynowPollUrl('https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc'), /^https:/);
  assert.throws(() => assertPaynowPollUrl('https://attacker.test/steal'), /not allowed/);
  assert.throws(() => assertPaynowPollUrl('http://www.paynow.co.zw/check'), /not allowed/);
});

test('Paynow successful initiation stores browser and poll values separately and sends configured test email', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, fields: Object.fromEntries(new URLSearchParams(options.body)) };
    const response = { status: 'Ok', browserurl: 'https://www.paynow.co.zw/pay/abc', pollurl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc' };
    response.hash = paynowHash(response, 'SECRET');
    return textResponse(new URLSearchParams(response).toString());
  };
  const provider = createPaynowProvider({ connection: paynowConnection(), secrets: paynowSecrets(), env: { NODE_ENV: 'test', PAYNOW_TEST_AUTH_EMAIL: 'merchant@example.com', PAYNOW_TEST_COMPANY_ID: 'company-a', PAYNOW_TEST_INTEGRATION_ID: '123' }, fetchImpl });
  const result = await provider.createPaymentLink({ invoice: invoice(), amount: 25, currency: 'USD', reference: 'FC-1', merchantTrace: 'TRACE-1' });
  assert.equal(request.fields.authemail, 'merchant@example.com');
  assert.equal(request.fields.merchanttrace, 'TRACE-1');
  assert.equal(result.checkoutUrl, 'https://www.paynow.co.zw/pay/abc');
  assert.equal(result.pollUrl, 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc');
  assert.equal(result.merchantTrace, 'TRACE-1');
});

test('Paynow omits test authemail without the environment value and never uses it live', async () => {
  const bodies = [];
  const fetchImpl = async (_url, options) => {
    bodies.push(Object.fromEntries(new URLSearchParams(options.body)));
    const response = { status: 'Ok', browserurl: 'https://www.paynow.co.zw/pay/abc', pollurl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc' };
    response.hash = paynowHash(response, 'SECRET');
    return textResponse(new URLSearchParams(response).toString());
  };
  await createPaynowProvider({ connection: paynowConnection(), secrets: paynowSecrets(), env: { NODE_ENV: 'test' }, fetchImpl }).createPaymentLink({ invoice: invoice(), amount: 10, currency: 'USD', reference: 'FC-2', merchantTrace: 'TRACE-2' });
  await createPaynowProvider({ connection: paynowConnection(), secrets: paynowSecrets(), env: { APP_BASE_URL: 'https://fieldcore.test', PAYNOW_MODE: 'live', PAYNOW_TEST_AUTH_EMAIL: 'merchant@example.com', PAYNOW_TEST_COMPANY_ID: 'company-a', PAYNOW_TEST_INTEGRATION_ID: '123' }, fetchImpl }).createPaymentLink({ invoice: invoice('customer@example.com'), amount: 10, currency: 'USD', reference: 'FC-3', merchantTrace: 'TRACE-3' });
  assert.equal('authemail' in bodies[0], false);
  assert.equal(bodies[1].authemail, 'customer@example.com');
  assert.notEqual(bodies[1].authemail, 'merchant@example.com');
});

test('Paynow initiation handles documented Error before hash and rejects an invalid Ok hash', async () => {
  const rejected = createPaynowProvider({ connection: paynowConnection(), secrets: paynowSecrets(), env: { NODE_ENV: 'test' }, fetchImpl: async () => textResponse('status=Error&error=Invalid+credentials') });
  await assert.rejects(() => rejected.createPaymentLink({ invoice: invoice(), amount: 10, currency: 'USD', reference: 'FC-4', merchantTrace: 'TRACE-4' }), (error) => error.code === 'PAYNOW_REJECTED' && error.safeProviderMessage === 'Invalid credentials');
  const untrusted = createPaynowProvider({ connection: paynowConnection(), secrets: paynowSecrets(), env: { NODE_ENV: 'test' }, fetchImpl: async () => textResponse('status=Ok&browserurl=https%3A%2F%2Fwww.paynow.co.zw%2Fpay&pollurl=https%3A%2F%2Fwww.paynow.co.zw%2Fpoll&hash=BAD') });
  await assert.rejects(() => untrusted.createPaymentLink({ invoice: invoice(), amount: 10, currency: 'USD', reference: 'FC-5', merchantTrace: 'TRACE-5' }), /untrusted/);
});

test('Paynow poll and merchant trace responses are signed and deliberately classified', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).includes('/trace')) {
      const traced = { reference: 'FC-6', paynowreference: 'PN-6', amount: '10.00', status: 'Paid', pollurl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=6' };
      traced.hash = paynowHash(traced, 'SECRET');
      return textResponse(new URLSearchParams(traced).toString());
    }
    const polled = { reference: 'FC-6', paynowreference: 'PN-6', amount: '10.00', status: 'Paid', pollurl: String(url) };
    polled.hash = paynowHash(polled, 'SECRET');
    return textResponse(new URLSearchParams(polled).toString());
  };
  const provider = createPaynowProvider({ connection: paynowConnection(), secrets: paynowSecrets(), env: {}, fetchImpl });
  const poll = await provider.getPaymentStatus({ pollUrl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=6' });
  const trace = await provider.recoverByMerchantTrace('TRACE-6');
  assert.equal(poll.status, 'PAID');
  assert.equal(trace.found, true);
  assert.equal(trace.providerPaymentId, 'PN-6');
  assert.equal(calls.length, 2);
});

test('Paynow trace NotFound and Error never pretend a transaction was absent after an error', async () => {
  const notFound = { status: 'NotFound' }; notFound.hash = paynowHash(notFound, 'SECRET');
  const responses = [new URLSearchParams(notFound).toString(), 'status=Error&error=Trace+failed'];
  const provider = createPaynowProvider({ connection: paynowConnection(), secrets: paynowSecrets(), env: {}, fetchImpl: async () => textResponse(responses.shift()) });
  assert.deepEqual(await provider.recoverByMerchantTrace('TRACE-7'), { found: false, status: 'NOTFOUND' });
  const error = await provider.recoverByMerchantTrace('TRACE-8');
  assert.equal(error.found, null);
  assert.equal(error.status, 'ERROR');
});

test('Paynow provider source has no personal or fake fallback and frontend files cannot expose the environment value', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'src/services/payments/providers/paynow.provider.js'), 'utf8');
  const frontend = fs.readFileSync(path.join(root, 'assets/api.js'), 'utf8');
  assert.equal(source.includes('kgkatunga04@gmail.com'), false);
  assert.equal(source.includes('payments@fieldcore.local'), false);
  assert.equal(source.includes('EMAIL_FROM'), false);
  assert.equal(frontend.includes('PAYNOW_TEST_AUTH_EMAIL'), false);
});

test('Ozow request hash keeps optional fields and uses the documented order', () => {
  assert.deepEqual(OZOW_REQUEST_ORDER, ['SiteCode', 'CountryCode', 'CurrencyCode', 'Amount', 'TransactionReference', 'BankReference', 'Optional1', 'Optional2', 'Optional3', 'Optional4', 'Optional5', 'Customer', 'CancelUrl', 'ErrorUrl', 'SuccessUrl', 'NotifyUrl', 'IsTest']);
  const fields = { SiteCode: 'SITE', CountryCode: 'ZA', CurrencyCode: 'ZAR', Amount: '100.00', TransactionReference: 'FC-1', BankReference: 'INV-1', Optional1: '', Optional2: '', Optional3: '', Optional4: '', Optional5: '', Customer: 'Jane', CancelUrl: 'https://x/cancel', ErrorUrl: 'https://x/error', SuccessUrl: 'https://x/success', NotifyUrl: 'https://x/notify', IsTest: 'true' };
  assert.equal(ozowHash(fields, 'PRIVATE'), 'f0e30a7c3aa777ff24f3770098e1469e2640105cfde6e16340bb7b5b2346f717c34887dbd2a712d40d8f612120f9b5e54f74dc18075378c886ec96b38fae9b97');
});

test('Ozow response hash is separate from request hashing and timing-safe verification rejects changes', () => {
  assert.deepEqual(OZOW_RESPONSE_ORDER, ['SiteCode', 'TransactionId', 'TransactionReference', 'Amount', 'Status', 'Optional1', 'Optional2', 'Optional3', 'Optional4', 'Optional5', 'CurrencyCode', 'IsTest', 'StatusMessage']);
  const payload = { SiteCode: 'SITE', TransactionId: 'OZ-1', TransactionReference: 'FC-1', Amount: '100.00', Status: 'Complete', Optional1: '', Optional2: '', Optional3: '', Optional4: '', Optional5: '', CurrencyCode: 'ZAR', IsTest: 'true', StatusMessage: 'Complete' };
  payload.Hash = ozowResponseHash(payload, 'PRIVATE');
  assert.equal(verifyOzowHash(payload, 'PRIVATE'), true);
  assert.equal(verifyOzowHash({ ...payload, Amount: '101.00' }, 'PRIVATE'), false);
  assert.notEqual(payload.Hash, ozowHash(payload, 'PRIVATE'));
});

test('Ozow status results are filtered instead of trusting the first result', () => {
  const wrong = { SiteCode: 'SITE', TransactionReference: 'OTHER', Amount: '100.00', CurrencyCode: 'ZAR', IsTest: true, Status: 'Complete' };
  const match = { SiteCode: 'SITE', TransactionReference: 'FC-1', Amount: '100.00', CurrencyCode: 'ZAR', IsTest: true, Status: 'Complete' };
  assert.equal(matchingStatusResult([wrong, match], { siteCode: 'SITE', reference: 'FC-1', amount: '100', currency: 'ZAR', isTest: true }), match);
  assert.notEqual(ozowEventId(match), ozowEventId({ ...match, Status: 'Cancelled' }));
});

test('Ozow test matching allows missing IsTest but rejects an explicit conflict', () => {
  const base = { SiteCode: 'SITE', TransactionReference: 'FC-1', Amount: '100.00', CurrencyCode: 'ZAR', Status: 'Complete' };
  const expected = { siteCode: 'SITE', reference: 'FC-1', amount: '100', currency: 'ZAR', isTest: true };
  assert.equal(matchingStatusResult([base], expected), base);
  assert.equal(matchingStatusResult([{ ...base, IsTest: true }], expected).IsTest, true);
  assert.equal(matchingStatusResult([{ ...base, IsTest: false }], expected), null);
  assert.equal(matchingStatusResult([{ ...base, IsTest: false }], { ...expected, isTest: false }).IsTest, false);
});

test('Ozow status matching rejects wrong ownership and financial fields', () => {
  const base = { SiteCode: 'SITE', TransactionReference: 'FC-1', Amount: '100.00', CurrencyCode: 'ZAR', IsTest: false, Status: 'Complete' };
  const expected = { siteCode: 'SITE', reference: 'FC-1', amount: '100', currency: 'ZAR', isTest: false };
  assert.equal(matchingStatusResult([{ ...base, SiteCode: 'OTHER' }], expected), null);
  assert.equal(matchingStatusResult([{ ...base, TransactionReference: 'OTHER' }], expected), null);
  assert.equal(matchingStatusResult([{ ...base, Amount: '99.99' }], expected), null);
  assert.equal(matchingStatusResult([{ ...base, CurrencyCode: 'USD' }], expected), null);
});

test('Ozow builds a signed auto-submit form without exposing API or private keys', async () => {
  const provider = createOzowProvider({ connection: { id: 'oz-1', companyId: 'company-a', config: { mode: 'test' } }, secrets: { SITE_CODE: 'SITE', API_KEY: 'API-SECRET', PRIVATE_KEY: 'PRIVATE' }, env: { NODE_ENV: 'test' } });
  const form = await provider.buildPaymentForm({ invoice: invoice(), amount: 100, currency: 'ZAR', reference: 'FC-OZ-1' });
  assert.equal(form.action, 'https://pay.ozow.com/');
  assert.equal(verifyOzowHash({ SiteCode: 'SITE' }, 'PRIVATE'), false);
  assert.equal(JSON.stringify(form).includes('API-SECRET'), false);
  assert.equal(JSON.stringify(form).includes('PRIVATE'), false);
  assert.equal(form.fields.HashCheck, ozowHash(form.fields, 'PRIVATE'));
});

test('Ozow GetTransactionByReference sends required headers/query and retains saved test mode when result omits IsTest', async () => {
  let request;
  const transaction = { SiteCode: 'SITE', TransactionId: 'OZ-1', TransactionReference: 'FC-OZ-2', Amount: '100.00', CurrencyCode: 'ZAR', Status: 'Complete', StatusMessage: 'Complete' };
  const provider = createOzowProvider({
    connection: { id: 'oz-1', companyId: 'company-a', config: { mode: 'test' } }, secrets: { SITE_CODE: 'SITE', API_KEY: 'API-SECRET', PRIVATE_KEY: 'PRIVATE' }, env: {},
    fetchImpl: async (url, options) => { request = { url: new URL(url), options }; return jsonResponse([transaction]); }
  });
  const result = await provider.getPaymentStatus({ reference: 'FC-OZ-2', amount: '100.00', currency: 'ZAR', providerIsTest: true });
  assert.equal(request.options.headers.ApiKey, 'API-SECRET');
  assert.equal(request.options.headers.Accept, 'application/json');
  assert.equal(request.url.searchParams.get('SiteCode'), 'SITE');
  assert.equal(request.url.searchParams.get('TransactionReference'), 'FC-OZ-2');
  assert.equal(request.url.searchParams.get('IsTest'), 'true');
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.providerIsTest, true);
});

test('provider hash helpers never embed private material in their output', () => {
  const digest = crypto.createHash('sha512').update('valuePRIVATE').digest('hex');
  assert.equal(digest.includes('PRIVATE'), false);
});
