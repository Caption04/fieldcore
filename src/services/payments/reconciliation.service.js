function getPrisma() { return require('../../db').prisma; }
const { safeError } = require('../../utils/crypto/redact');

function decimal(value) { return Number(value || 0); }

function safeReconciliationItem(item) {
  if (!item) return item;
  return {
    id: item.id,
    companyId: item.companyId,
    branchId: item.branchId || null,
    provider: item.provider,
    status: item.status,
    providerPaymentId: item.providerPaymentId || null,
    reference: item.reference || null,
    payerName: item.payerName || null,
    payerEmail: item.payerEmail || null,
    amount: item.amount,
    currency: item.currency,
    paidAt: item.paidAt || null,
    matchedInvoiceId: item.matchedInvoiceId || null,
    matchedPaymentId: item.matchedPaymentId || null,
    suspiciousReason: item.suspiciousReason || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

async function createOrFlagReconciliationItem(data) {
  const prisma = getPrisma();
  if (data.providerPaymentId) {
    const existing = await prisma.paymentReconciliationItem.findFirst({ where: { companyId: data.companyId, provider: data.provider, providerPaymentId: data.providerPaymentId } });
    if (existing) return prisma.paymentReconciliationItem.create({ data: { ...data, status: 'DUPLICATE', suspiciousReason: 'Duplicate provider payment id' } });
  }
  return prisma.paymentReconciliationItem.create({ data });
}

async function matchReconciliationItem({ companyId, itemId, invoice, userId, method = 'BANK_TRANSFER' }) {
  const prisma = getPrisma();
  const item = await prisma.paymentReconciliationItem.findFirst({ where: { id: itemId, companyId } });
  if (!item) { const err = new Error('Reconciliation item not found'); err.status = 404; err.statusCode = 404; throw err; }
  if (item.status === 'MATCHED') { const err = new Error('Reconciliation item is already matched'); err.status = 409; err.statusCode = 409; throw err; }
  if (decimal(item.amount) > decimal(invoice.balanceDue || invoice.total || invoice.amount)) { const err = new Error('Payment amount exceeds invoice balance'); err.status = 400; err.statusCode = 400; throw err; }

  const payment = await prisma.payment.create({ data: { companyId, branchId: invoice.branchId || item.branchId || null, invoiceId: invoice.id, amount: item.amount, method, status: 'CONFIRMED', reference: item.reference, provider: item.provider, providerPaymentId: item.providerPaymentId || null, reconciliationItemId: item.id, receivedAt: item.paidAt || new Date(), confirmedAt: new Date(), createdById: userId || null, notes: 'Matched through reconciliation' } });
  await prisma.paymentReconciliationItem.update({ where: { id: item.id }, data: { status: 'MATCHED', matchedInvoiceId: invoice.id, matchedPaymentId: payment.id, matchedById: userId || null, suspiciousReason: null } });
  return { payment, item: await prisma.paymentReconciliationItem.findFirst({ where: { id: item.id, companyId } }) };
}

function safePaymentError(error) { return safeError(error); }

module.exports = { createOrFlagReconciliationItem, matchReconciliationItem, safePaymentError, safeReconciliationItem };
