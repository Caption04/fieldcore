const assert = require('node:assert/strict');
const test = require('node:test');

const { STATES, decidePaymentTransition, normalizedProviderState } = require('../src/services/payments/paymentStateMachine.service');
const { assertProviderUrl } = require('../src/services/payments/providers/providerEndpointSecurity');
const { createPaynowProvider, paynowHash } = require('../src/services/payments/providers/paynow.provider');
const { assertPaymentEndpoint, assertStatusEndpoint, createOzowProvider } = require('../src/services/payments/providers/ozow.provider');

const PAYNOW_HOSTS = new Set(['www.paynow.co.zw']);
function response(text, status = 200) { return { ok: status >= 200 && status < 300, status, text: async () => text }; }
function connection() { return { id: 'connection-a', companyId: 'company-a', provider: 'PAYNOW' }; }
function secrets() { return { INTEGRATION_ID: 'merchant-a', INTEGRATION_KEY: 'secret-a' }; }
function invoice() { return { id: 'invoice-a', number: 'INV-1', customer: { email: 'buyer@example.com' } }; }

test('provider URL validators reject SSRF, deceptive hosts, ports, HTTP and unexpected paths', () => {
  const validatePaynow = (url) => assertProviderUrl(url, { provider: 'Paynow', hosts: PAYNOW_HOSTS, exactPaths: ['/interface/initiatetransaction'] });
  for (const url of [
    'http://www.paynow.co.zw/interface/initiatetransaction',
    'https://localhost/interface/initiatetransaction',
    'https://127.0.0.1/interface/initiatetransaction',
    'https://169.254.169.254/latest/meta-data',
    'https://www.paynow.co.zw.attacker.test/interface/initiatetransaction',
    'https://attacker.test/interface/initiatetransaction',
    'https://www.paynow.co.zw:444/interface/initiatetransaction',
    'https://www.paynow.co.zw/attacker'
  ]) assert.throws(() => validatePaynow(url), /not allowed/);
  assert.throws(() => assertPaymentEndpoint('https://pay.ozow.com.attacker.test/'), /not allowed/);
  assert.throws(() => assertStatusEndpoint('https://api.ozow.com/private'), /not allowed/);
});

test('tenant provider config cannot replace the official Paynow initiation endpoint', async () => {
  let requestedUrl;
  const provider = createPaynowProvider({
    connection: { ...connection(), config: { endpoint: 'http://127.0.0.1/steal', traceEndpoint: 'https://attacker.test', mode: 'live' } },
    secrets: secrets(), env: { NODE_ENV: 'test' },
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      const body = { status: 'Ok', browserurl: 'https://www.paynow.co.zw/pay/a', pollurl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=a' };
      body.hash = paynowHash(body, 'secret-a');
      return response(new URLSearchParams(body).toString());
    }
  });
  await provider.createPaymentLink({ invoice: invoice(), amount: 10, currency: 'USD', reference: 'FC-A', merchantTrace: 'TRACE-A' });
  assert.equal(requestedUrl, 'https://www.paynow.co.zw/interface/initiatetransaction');
});

test('global merchant credentials never make a tenant connection usable', async () => {
  let fetched = false;
  const provider = createPaynowProvider({ connection: connection(), secrets: {}, env: { PAYNOW_INTEGRATION_ID: 'global-id', PAYNOW_INTEGRATION_KEY: 'global-key' }, fetchImpl: async () => { fetched = true; } });
  await assert.rejects(() => provider.createPaymentLink({ invoice: invoice(), amount: 10, currency: 'USD', reference: 'FC-B', merchantTrace: 'TRACE-B' }), /not set up/);
  assert.equal(fetched, false);
});

test('Ozow cannot start with a partial bundle or global fallback credentials', async () => {
  const provider = createOzowProvider({
    connection: { id: 'ozow-a', companyId: 'company-a' },
    secrets: { SITE_CODE: 'site-a', PRIVATE_KEY: 'private-a' },
    env: { OZOW_API_KEY: 'global-api-key' }
  });
  await assert.rejects(() => provider.buildPaymentForm({ invoice: invoice(), amount: 10, currency: 'ZAR', reference: 'OZ-A' }), /not set up/);
});

test('Paynow test email requires test mode, company binding and Integration ID binding', async () => {
  const attempts = [];
  const run = async (env, companyId = 'company-a') => {
    const provider = createPaynowProvider({ connection: { ...connection(), companyId }, secrets: secrets(), env, fetchImpl: async (_url, options) => {
      attempts.push(Object.fromEntries(new URLSearchParams(options.body)));
      const body = { status: 'Ok', browserurl: 'https://www.paynow.co.zw/pay/a', pollurl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=a' };
      body.hash = paynowHash(body, 'secret-a');
      return response(new URLSearchParams(body).toString());
    } });
    await provider.createPaymentLink({ invoice: invoice(), amount: 10, currency: 'USD', reference: `FC-${attempts.length}`, merchantTrace: `TRACE-${attempts.length}` });
  };
  const bound = { NODE_ENV: 'test', PAYNOW_TEST_AUTH_EMAIL: 'merchant@example.com', PAYNOW_TEST_COMPANY_ID: 'company-a', PAYNOW_TEST_INTEGRATION_ID: 'merchant-a' };
  await run(bound);
  await run({ ...bound, PAYNOW_TEST_COMPANY_ID: 'company-b' });
  await run({ ...bound, PAYNOW_TEST_INTEGRATION_ID: 'other' });
  await run({ ...bound, PAYNOW_MODE: 'live' });
  assert.equal(attempts[0].authemail, 'merchant@example.com');
  assert.equal(attempts[1].authemail, undefined);
  assert.equal(attempts[2].authemail, undefined);
  assert.equal(attempts[3].authemail, 'buyer@example.com');
});

test('redirect responses are rejected instead of being followed', async () => {
  const provider = createPaynowProvider({ connection: connection(), secrets: secrets(), env: { NODE_ENV: 'test' }, fetchImpl: async () => response('', 302) });
  await assert.rejects(() => provider.createPaymentLink({ invoice: invoice(), amount: 10, currency: 'USD', reference: 'FC-C', merchantTrace: 'TRACE-C' }), /not allowed/);
});

test('payment state mapping and transition order block stale terminal regressions', () => {
  assert.equal(normalizedProviderState('PAYNOW', 'Awaiting Delivery'), STATES.CUSTOMER_PAID_HELD);
  assert.equal(normalizedProviderState('PAYNOW', 'Delivered'), STATES.SETTLED);
  assert.equal(normalizedProviderState('OZOW', 'Complete'), STATES.SETTLED);
  assert.equal(normalizedProviderState('PAYNOW', 'surprise'), STATES.NEEDS_RECONCILIATION);
  assert.equal(decidePaymentTransition({ provider: 'OZOW', providerStatus: 'Complete', link: { provider: 'OZOW', status: 'PENDING', providerStatus: 'PENDING' }, payment: null }).allowed, true);
  assert.equal(decidePaymentTransition({ provider: 'PAYNOW', providerStatus: 'Delivered', link: { provider: 'PAYNOW', status: 'PENDING', providerStatus: 'CREATED' }, payment: null }).allowed, true);
  const link = { provider: 'PAYNOW', status: 'PAID', providerStatus: 'REFUNDED' };
  const payment = { status: 'REFUNDED', notes: 'Payment refunded by provider' };
  assert.deepEqual(decidePaymentTransition({ provider: 'PAYNOW', providerStatus: 'Paid', link, payment }), { from: STATES.REFUNDED, to: STATES.CUSTOMER_PAID, allowed: false });
  assert.equal(decidePaymentTransition({ provider: 'PAYNOW', providerStatus: 'Refunded', link: { provider: 'PAYNOW', status: 'PENDING', providerStatus: 'Created' }, payment: null }).allowed, true);
  assert.equal(decidePaymentTransition({ provider: 'PAYNOW', providerStatus: 'Paid', link: { provider: 'PAYNOW', status: 'DISPUTED', providerStatus: 'DISPUTED' }, payment: { status: 'DISPUTED' } }).allowed, false);
});

test('partial refunds and unapplied money reduce usable invoice credit without double subtraction', () => {
  const {
    activeRefundReservationTotalForPayment,
    invoiceAppliedPaymentCredit,
    usablePaymentCredit
  } = require('../src/services/payments/invoiceLedger.service');
  const payment = { id: 'payment-a', amount: '100.00', status: 'CONFIRMED' };
  const refunds = [
    { paymentId: 'payment-a', amount: '30.00', status: 'REFUNDED' },
    { paymentId: 'payment-a', amount: '10.00', status: 'REQUESTED' }
  ];
  const credits = [{ paymentId: 'payment-a', amount: '20.00', status: 'OPEN' }];
  assert.equal(usablePaymentCredit(payment, refunds).toFixed(2), '70.00');
  assert.equal(invoiceAppliedPaymentCredit(payment, refunds, credits).toFixed(2), '50.00');
  assert.equal(activeRefundReservationTotalForPayment(payment.id, refunds).toFixed(2), '40.00');
});

test('refunded and disputed payments never contribute usable invoice credit', () => {
  const { invoiceAppliedPaymentCredit } = require('../src/services/payments/invoiceLedger.service');
  assert.equal(invoiceAppliedPaymentCredit({ id: 'refund-a', amount: '100.00', status: 'REFUNDED' }, [], []).toFixed(2), '0.00');
  assert.equal(invoiceAppliedPaymentCredit({ id: 'dispute-a', amount: '100.00', status: 'DISPUTED' }, [], []).toFixed(2), '0.00');
});

test('malformed duplicate provider fields are rejected as untrusted instead of crashing', async () => {
  const paynow = createPaynowProvider({ connection: connection(), secrets: secrets(), env: { NODE_ENV: 'test' } });
  assert.equal(await paynow.verifyWebhook({ rawFormBody: 'reference=A&reference=B&hash=00' }), false);
  const ozow = createOzowProvider({ connection: { id: 'ozow-duplicate', companyId: 'company-a', provider: 'OZOW' }, secrets: { SITE_CODE: 'site', API_KEY: 'api', PRIVATE_KEY: 'private' }, env: { NODE_ENV: 'test' } });
  assert.equal(await ozow.verifyWebhook({ rawFormBody: 'TransactionReference=A&TransactionReference=B&Hash=00' }), false);
});
