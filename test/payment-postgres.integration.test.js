const assert = require('node:assert/strict');
const test = require('node:test');

const configured = Boolean(process.env.PAYMENT_TEST_DATABASE_URL);

if (!configured) {
  test('real PostgreSQL payment service flow requires PAYMENT_TEST_DATABASE_URL', { skip: true }, () => {});
} else {
  const testUrl = new URL(process.env.PAYMENT_TEST_DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(testUrl.hostname));
  assert.ok(testUrl.pathname.replace(/^\//, '').endsWith('_test'));
  assert.ok(!['fieldcore_zw', 'fieldcore_sa'].includes(testUrl.pathname.replace(/^\//, '')));
  process.env.DATABASE_URL = testUrl.toString();

  const { PrismaClient } = require('@prisma/client');
  const { applyPaymentProviderUpdate } = require('../src/services/payments/paymentProviderUpdate.service');
  const prisma = new PrismaClient();
  let sequence = 0;

  test.after(async () => {
    await prisma.company.deleteMany({ where: { name: { startsWith: 'Payment Flow Test ' } } });
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    await prisma.company.deleteMany({ where: { name: { startsWith: 'Payment Flow Test ' } } });
  });

  async function seedFlow(provider = 'PAYNOW', suffix = String(++sequence)) {
    const company = await prisma.company.create({ data: { name: `Payment Flow Test ${suffix}` } });
    const customer = await prisma.customer.create({ data: { companyId: company.id, name: `Customer ${suffix}` } });
    const invoice = await prisma.invoice.create({ data: { companyId: company.id, customerId: customer.id, number: `INV-${suffix}`, status: 'SENT', amount: 100, subtotal: 100, total: 100, balanceDue: 100 } });
    await prisma.invoiceLineItem.create({ data: { companyId: company.id, invoiceId: invoice.id, description: 'Payment test', quantity: 1, unitPrice: 100, lineTotal: 100 } });
    const connection = await prisma.paymentProviderConnection.create({ data: { companyId: company.id, provider, status: 'CONFIGURED' } });
    const link = await prisma.paymentLink.create({ data: { companyId: company.id, invoiceId: invoice.id, providerConnectionId: connection.id, provider, status: 'PENDING', amount: 100, currency: provider === 'OZOW' ? 'ZAR' : 'USD', reference: `LINK-${suffix}`, providerStatus: provider === 'OZOW' ? 'PENDING' : 'CREATED' } });
    return { company, customer, invoice, connection, link };
  }

  function update(flow, status, eventId, extra = {}) {
    return applyPaymentProviderUpdate({
      database: prisma,
      connection: flow.connection,
      eventId,
      parsed: { eventId, reference: flow.link.reference, providerPaymentId: `PROVIDER-${flow.link.id}`, amount: flow.link.amount, currency: flow.link.currency, providerStatus: status, ...extra }
    });
  }

  async function financialState(flow) {
    const [link, payments, receipts, invoice, refunds, reconciliations] = await Promise.all([
      prisma.paymentLink.findUnique({ where: { id: flow.link.id } }),
      prisma.payment.findMany({ where: { companyId: flow.company.id, paymentLinkId: flow.link.id } }),
      prisma.receipt.findMany({ where: { companyId: flow.company.id, invoiceId: flow.invoice.id } }),
      prisma.invoice.findUnique({ where: { id: flow.invoice.id } }),
      prisma.paymentRefund.findMany({ where: { companyId: flow.company.id } }),
      prisma.paymentReconciliationItem.findMany({ where: { companyId: flow.company.id } })
    ]);
    return { link, payments, receipts, invoice, refunds, reconciliations };
  }

  test('Ozow Complete settles directly from pending', async () => {
    const flow = await seedFlow('OZOW');
    const result = await update(flow, 'COMPLETE', 'OZOW-DIRECT');
    const state = await financialState(flow);
    assert.equal(result.link.status, 'PAID');
    assert.equal(state.payments.length, 1);
    assert.equal(state.payments[0].status, 'CONFIRMED');
    assert.equal(state.receipts.length, 1);
    assert.equal(state.link.status, 'PAID');
    assert.equal(Number(state.invoice.balanceDue), 0);
  });

  test('Paynow Delivered settles directly from pending', async () => {
    const flow = await seedFlow('PAYNOW');
    const result = await update(flow, 'DELIVERED', 'PAYNOW-DIRECT');
    const state = await financialState(flow);
    assert.equal(result.link.status, 'PAID');
    assert.equal(state.payments.length, 1);
    assert.equal(state.payments[0].status, 'CONFIRMED');
    assert.equal(state.receipts.length, 1);
    assert.equal(state.link.status, 'PAID');
    assert.equal(Number(state.invoice.balanceDue), 0);
  });

  test('two exact callbacks concurrently create one payment receipt and credit', async () => {
    const flow = await seedFlow('PAYNOW');
    const results = await Promise.all([update(flow, 'PAID', 'SAME-PAID'), update(flow, 'PAID', 'SAME-PAID')]);
    const state = await financialState(flow);
    assert.equal(results.filter((result) => result.duplicate).length, 1);
    assert.equal(state.payments.length, 1);
    assert.equal(state.receipts.length, 1);
    assert.equal(Number(state.invoice.balanceDue), 0);
  });

  test('Paid and Refunded concurrently finish refunded and consistent', async () => {
    const flow = await seedFlow('PAYNOW');
    await Promise.all([update(flow, 'PAID', 'PAID-RACE'), update(flow, 'REFUNDED', 'REFUND-RACE')]);
    const state = await financialState(flow);
    assert.equal(state.link.status, 'REFUNDED');
    assert.ok(state.payments.length <= 1);
    if (state.payments.length) assert.equal(state.payments[0].status, 'REFUNDED');
    assert.ok(state.refunds.length <= 1);
    assert.ok(state.receipts.length <= 1);
    assert.equal(Number(state.invoice.balanceDue), 100);
  });

  test('Paid and Disputed concurrently finish disputed and consistent', async () => {
    const flow = await seedFlow('PAYNOW');
    await Promise.all([update(flow, 'PAID', 'PAID-DISPUTE-RACE'), update(flow, 'DISPUTED', 'DISPUTE-RACE')]);
    const state = await financialState(flow);
    assert.equal(state.link.status, 'DISPUTED');
    if (state.payments.length) assert.equal(state.payments[0].status, 'DISPUTED');
    assert.ok(state.payments.length <= 1);
    assert.ok(state.receipts.length <= 1);
    assert.equal(Number(state.invoice.balanceDue), 100);
  });

  test('Awaiting Delivery and Delivered concurrently credit once and settle', async () => {
    const flow = await seedFlow('PAYNOW');
    await Promise.all([update(flow, 'AWAITING DELIVERY', 'HELD-RACE'), update(flow, 'DELIVERED', 'DELIVERED-RACE')]);
    const state = await financialState(flow);
    assert.equal(state.link.status, 'PAID');
    assert.equal(state.link.providerStatus, 'DELIVERED');
    assert.equal(state.payments.length, 1);
    assert.equal(state.receipts.length, 1);
    assert.equal(Number(state.invoice.balanceDue), 0);
  });

  for (const terminal of ['REFUNDED', 'DISPUTED']) {
    test(`${terminal} before Paid is retained and stale Paid is ignored`, async () => {
      const flow = await seedFlow('PAYNOW');
      await update(flow, terminal, `${terminal}-FIRST`);
      const stale = await update(flow, 'PAID', `${terminal}-STALE-PAID`);
      const state = await financialState(flow);
      assert.equal(stale.ignored, true);
      assert.equal(state.link.status, terminal);
      assert.equal(state.link.providerStatus, terminal);
      assert.equal(state.payments.length, 0);
      assert.equal(state.receipts.length, 0);
      assert.equal(state.reconciliations.length, 1);
      assert.equal(Number(state.invoice.balanceDue), 100);
    });
  }

  test('failure after payment creation rolls back fully and retries cleanly', async () => {
    const flow = await seedFlow('PAYNOW');
    await assert.rejects(applyPaymentProviderUpdate({
      database: prisma,
      connection: flow.connection,
      eventId: 'FORCED-ROLLBACK',
      parsed: { eventId: 'FORCED-ROLLBACK', reference: flow.link.reference, providerPaymentId: 'ROLLBACK-PAYMENT', amount: 100, currency: 'USD', providerStatus: 'PAID' },
      hooks: { afterPaymentCreated: async () => { throw new Error('forced halfway failure'); } }
    }), /forced halfway failure/);
    let state = await financialState(flow);
    assert.equal(state.payments.length, 0);
    assert.equal(state.receipts.length, 0);
    assert.equal(state.link.status, 'PENDING');
    assert.equal(Number(state.invoice.balanceDue), 100);
    await update(flow, 'PAID', 'FORCED-ROLLBACK');
    state = await financialState(flow);
    assert.equal(state.payments.length, 1);
    assert.equal(state.receipts.length, 1);
    assert.equal(state.link.status, 'PAID');
  });

  test('company event cannot update another company payment records', async () => {
    const companyA = await seedFlow('PAYNOW', 'COMPANY-A');
    const companyB = await seedFlow('PAYNOW', 'COMPANY-B');
    const result = await applyPaymentProviderUpdate({ database: prisma, connection: companyA.connection, eventId: 'CROSS-COMPANY', parsed: { eventId: 'CROSS-COMPANY', reference: companyB.link.reference, providerPaymentId: 'CROSS', amount: 100, currency: 'USD', providerStatus: 'PAID' } });
    assert.equal(result.link, null);
    const stateB = await financialState(companyB);
    assert.equal(stateB.link.status, 'PENDING');
    assert.equal(stateB.payments.length, 0);
    assert.equal(Number(stateB.invoice.balanceDue), 100);
  });

  test('concurrent refund copies create one provider refund', async () => {
    const flow = await seedFlow('PAYNOW');
    await update(flow, 'PAID', 'REFUND-BASE');
    await Promise.all([
      update(flow, 'REFUNDED', 'REFUND-COPY-A', { providerRefundId: 'ONE-REFUND' }),
      update(flow, 'REFUNDED', 'REFUND-COPY-B', { providerRefundId: 'ONE-REFUND' })
    ]);
    const state = await financialState(flow);
    assert.equal(state.refunds.length, 1);
    assert.equal(state.link.status, 'REFUNDED');
    assert.equal(state.payments[0].status, 'REFUNDED');
  });

  test('database constraints and final link consistency hold', async () => {
    const indexes = await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('Payment_companyId_paymentLinkId_key', 'PaymentRefund_companyId_providerConnectionId_providerRefundId_key')`;
    assert.deepEqual(new Set(indexes.map((row) => row.indexname)), new Set(['Payment_companyId_paymentLinkId_key', 'PaymentRefund_companyId_providerConnectionId_providerRefundId_key']));
    const inconsistent = await prisma.$queryRaw`SELECT p.id FROM "Payment" p JOIN "PaymentLink" l ON l.id = p."paymentLinkId" WHERE (p.status::text = 'REFUNDED' AND l.status::text = 'PAID') OR (p.status::text = 'DISPUTED' AND l.status::text = 'PAID')`;
    assert.equal(inconsistent.length, 0);
  });
}
