function getPrisma() { return require('../../db').prisma; }
const { safeError } = require('../../utils/crypto/redact');
const { allocateFinancialNumber } = require('./financialNumber.service');
const { money, recalculateInvoiceFinancials, syncUnappliedCreditForPayment } = require('./invoiceLedger.service');

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
  return prisma.$transaction(async (tx) => {
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT "id" FROM "PaymentReconciliationItem" WHERE "companyId" = ${companyId} AND "id" = ${itemId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "companyId" = ${companyId} AND "id" = ${invoice.id} FOR UPDATE`;
    }
    const [item, currentInvoice] = await Promise.all([
      tx.paymentReconciliationItem.findFirst({ where: { id: itemId, companyId } }),
      tx.invoice.findFirst({ where: { id: invoice.id, companyId } })
    ]);
    if (!item) { const err = new Error('Reconciliation item not found'); err.status = 404; err.statusCode = 404; throw err; }
    if (!currentInvoice) { const err = new Error('Invoice not found'); err.status = 404; err.statusCode = 404; throw err; }
    if (item.status === 'MATCHED') { const err = new Error('Reconciliation item is already matched'); err.status = 409; err.statusCode = 409; throw err; }
    if (String(currentInvoice.status).toUpperCase() === 'VOID') { const err = new Error('A void invoice cannot receive this payment'); err.status = 409; err.statusCode = 409; throw err; }

    const existingPayment = item.providerPaymentId ? await tx.payment.findFirst({ where: { companyId, provider: item.provider, providerPaymentId: item.providerPaymentId } }) : null;
    const payment = existingPayment || await tx.payment.create({
      data: {
        companyId,
        branchId: currentInvoice.branchId || item.branchId || null,
        invoiceId: currentInvoice.id,
        amount: money(item.amount),
        method,
        status: 'CONFIRMED',
        reference: item.reference,
        provider: item.provider,
        providerPaymentId: item.providerPaymentId || null,
        reconciliationItemId: item.id,
        receivedAt: item.paidAt || new Date(),
        confirmedAt: new Date(),
        createdById: userId || null,
        notes: 'Matched through reconciliation'
      }
    });

    const receipt = await tx.receipt.findUnique({ where: { paymentId: payment.id } });
    if (!receipt) {
      const receiptNumber = await allocateFinancialNumber(tx, companyId, 'RECEIPT');
      await tx.receipt.create({ data: { companyId, branchId: payment.branchId || currentInvoice.branchId || null, invoiceId: currentInvoice.id, paymentId: payment.id, receiptNumber, amount: payment.amount } });
    }
    await recalculateInvoiceFinancials(tx, companyId, currentInvoice.id);
    const credit = await syncUnappliedCreditForPayment(tx, companyId, payment.id, { currency: item.currency });
    const updated = await tx.paymentReconciliationItem.update({
      where: { id: item.id },
      data: {
        status: 'MATCHED',
        matchedInvoiceId: currentInvoice.id,
        matchedPaymentId: payment.id,
        matchedById: userId || null,
        suspiciousReason: credit.excess.greaterThan(0) ? 'Extra payment received — needs review' : null
      }
    });
    return { payment, item: updated, unappliedCredit: credit.credit || null };
  });
}

function safePaymentError(error) { return safeError(error); }

module.exports = { createOrFlagReconciliationItem, matchReconciliationItem, safePaymentError, safeReconciliationItem };
