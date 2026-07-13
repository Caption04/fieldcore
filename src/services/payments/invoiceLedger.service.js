const { Prisma } = require('@prisma/client');
const { AppError } = require('../../errors');

const COMPLETED_REFUND_STATUSES = new Set(['REFUNDED']);
const USABLE_PAYMENT_STATUSES = new Set(['CONFIRMED']);
const ACTIVE_UNAPPLIED_CREDIT_STATUSES = new Set(['OPEN', 'LOCKED']);

function decimal(value) {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value == null || value === '' ? 0 : value);
}

function money(value) {
  return decimal(value).toDecimalPlaces(2);
}

function maxDecimal(left, right) {
  return decimal(left).greaterThan(decimal(right)) ? decimal(left) : decimal(right);
}

function minDecimal(left, right) {
  return decimal(left).lessThan(decimal(right)) ? decimal(left) : decimal(right);
}

function sumDecimals(values) {
  return (values || []).reduce((sum, value) => sum.plus(decimal(value)), decimal(0));
}

function completedRefundTotalForPayment(paymentId, refunds) {
  return sumDecimals((refunds || [])
    .filter((refund) => refund.paymentId === paymentId && COMPLETED_REFUND_STATUSES.has(String(refund.status || '').toUpperCase()))
    .map((refund) => refund.amount));
}

function activeRefundReservationTotalForPayment(paymentId, refunds) {
  const reservedStatuses = new Set(['REQUESTED', 'APPROVAL_REQUIRED', 'APPROVED', 'PROCESSING', 'REFUNDED']);
  return sumDecimals((refunds || [])
    .filter((refund) => refund.paymentId === paymentId && reservedStatuses.has(String(refund.status || '').toUpperCase()))
    .map((refund) => refund.amount));
}

function usablePaymentCredit(payment, refunds) {
  if (!payment || !USABLE_PAYMENT_STATUSES.has(String(payment.status || '').toUpperCase())) return decimal(0);
  const paymentAmount = money(payment.amount);
  const refunded = money(completedRefundTotalForPayment(payment.id, refunds));
  if (refunded.greaterThan(paymentAmount)) {
    throw new AppError(409, 'Payment records need review before this invoice can be updated.');
  }
  return paymentAmount.minus(refunded);
}

function activeUnappliedCreditForPayment(paymentId, credits) {
  return sumDecimals((credits || [])
    .filter((credit) => credit.paymentId === paymentId && ACTIVE_UNAPPLIED_CREDIT_STATUSES.has(String(credit.status || '').toUpperCase()))
    .map((credit) => credit.amount));
}

function invoiceAppliedPaymentCredit(payment, refunds, credits) {
  const usable = usablePaymentCredit(payment, refunds);
  const unapplied = money(activeUnappliedCreditForPayment(payment.id, credits));
  if (unapplied.greaterThan(usable)) {
    throw new AppError(409, 'Payment credit records need review before this invoice can be updated.');
  }
  return usable.minus(unapplied);
}

function invoiceTotals(lines, current) {
  if (Array.isArray(lines) && lines.length) {
    return lines.reduce((result, line) => {
      result.subtotal = result.subtotal.plus(decimal(line.quantity || 1).times(decimal(line.unitPrice || 0)));
      result.discountTotal = result.discountTotal.plus(decimal(line.discountAmount || 0));
      result.taxTotal = result.taxTotal.plus(decimal(line.taxAmount || 0));
      result.total = result.total.plus(decimal(line.lineTotal || 0));
      return result;
    }, { subtotal: decimal(0), discountTotal: decimal(0), taxTotal: decimal(0), total: decimal(0) });
  }
  const total = decimal(current && (current.total != null ? current.total : current.amount));
  return {
    subtotal: decimal(current && (current.subtotal != null ? current.subtotal : total)),
    discountTotal: decimal(current && current.discountTotal),
    taxTotal: decimal(current && current.taxTotal),
    total
  };
}

async function loadInvoiceLedgerInputs(tx, companyId, invoiceId) {
  const queries = [
    tx.invoice.findFirst({ where: { id: invoiceId, companyId } }),
    tx.invoiceLineItem.findMany({ where: { companyId, invoiceId } }),
    tx.payment.findMany({ where: { companyId, invoiceId } }),
    tx.paymentRefund.findMany({ where: { companyId, invoiceId } })
  ];
  if (tx.unappliedCustomerCredit) queries.push(tx.unappliedCustomerCredit.findMany({ where: { companyId, invoiceId } }));
  const [current, lines, payments, refunds, credits = []] = await Promise.all(queries);
  if (!current) throw new AppError(404, 'Invoice not found');
  return { current, lines, payments, refunds, credits };
}

function paymentOrder(payment) {
  const date = payment.confirmedAt || payment.receivedAt || payment.createdAt || 0;
  return `${new Date(date).toISOString()}|${payment.id}`;
}

async function synchronizeInvoiceUnappliedCredits(tx, companyId, invoiceId, options = {}) {
  if (!tx.unappliedCustomerCredit) return [];
  const inputs = await loadInvoiceLedgerInputs(tx, companyId, invoiceId);
  const totals = invoiceTotals(inputs.lines, inputs.current);
  let remainingInvoiceCapacity = String(inputs.current.status || '').toUpperCase() === 'VOID' ? decimal(0) : money(totals.total);
  const existingByPayment = new Map(inputs.credits.map((credit) => [credit.paymentId, credit]));
  const results = [];
  const payments = [...inputs.payments].sort((left, right) => paymentOrder(left).localeCompare(paymentOrder(right)));

  for (const payment of payments) {
    const usable = money(usablePaymentCredit(payment, inputs.refunds));
    const existing = existingByPayment.get(payment.id) || null;
    const locked = Boolean(existing && String(existing.status || '').toUpperCase() === 'LOCKED');
    let unapplied;

    if (locked && usable.greaterThan(0)) {
      unapplied = usable;
    } else {
      const applied = minDecimal(usable, remainingInvoiceCapacity);
      unapplied = usable.minus(applied);
      remainingInvoiceCapacity = maxDecimal(remainingInvoiceCapacity.minus(applied), 0);
    }

    if (unapplied.greaterThan(0)) {
      const status = locked ? 'LOCKED' : 'OPEN';
      const reason = locked
        ? existing.reason || options.lockedReason || 'Payment needs review before it can be applied'
        : options.reason || 'Extra payment received — needs review';
      const credit = await tx.unappliedCustomerCredit.upsert({
        where: { paymentId: payment.id },
        update: { amount: money(unapplied), currency: existing && existing.currency || options.currency || 'USD', status, reason },
        create: {
          companyId,
          customerId: inputs.current.customerId,
          invoiceId: inputs.current.id,
          paymentId: payment.id,
          paymentLinkId: payment.paymentLinkId || null,
          amount: money(unapplied),
          currency: options.currency || 'USD',
          status,
          reason
        }
      });
      results.push(credit);
    } else if (existing && ACTIVE_UNAPPLIED_CREDIT_STATUSES.has(String(existing.status || '').toUpperCase())) {
      const credit = await tx.unappliedCustomerCredit.update({ where: { id: existing.id }, data: { amount: money(0), status: 'CLOSED', reason: 'No extra payment remains' } });
      results.push(credit);
    }
  }
  return results;
}

async function calculateInvoiceLedger(tx, companyId, invoiceId) {
  const { current, lines, payments, refunds, credits } = await loadInvoiceLedgerInputs(tx, companyId, invoiceId);
  const totals = invoiceTotals(lines, current);
  const grossConfirmed = sumDecimals(payments
    .filter((payment) => USABLE_PAYMENT_STATUSES.has(String(payment.status || '').toUpperCase()))
    .map((payment) => payment.amount));
  const completedRefunds = sumDecimals(refunds
    .filter((refund) => COMPLETED_REFUND_STATUSES.has(String(refund.status || '').toUpperCase()))
    .map((refund) => refund.amount));
  const unapplied = sumDecimals(credits
    .filter((credit) => ACTIVE_UNAPPLIED_CREDIT_STATUSES.has(String(credit.status || '').toUpperCase()))
    .map((credit) => credit.amount));
  const usablePaid = payments.reduce((sum, payment) => sum.plus(invoiceAppliedPaymentCredit(payment, refunds, credits)), decimal(0));
  const totalProviderCredit = payments.reduce((sum, payment) => sum.plus(usablePaymentCredit(payment, refunds)), decimal(0));
  const balanceDue = current.status === 'VOID' ? decimal(0) : maxDecimal(totals.total.minus(usablePaid), 0);
  const overpayment = maxDecimal(totalProviderCredit.minus(totals.total), 0);

  return { current, lines, payments, refunds, credits, totals, grossConfirmed, completedRefunds, unapplied, totalProviderCredit, usablePaid, balanceDue, overpayment };
}

async function recomputeQuoteDepositCoverage(tx, companyId, quoteId) {
  if (!quoteId) return null;
  const quote = await tx.quote.findFirst({ where: { id: quoteId, companyId } });
  if (!quote) return null;
  const required = money(quote.depositRequiredAmount || 0);
  if (!required.greaterThan(0)) {
    if (quote.depositPaidAt) return tx.quote.update({ where: { id: quote.id }, data: { depositPaidAt: null } });
    return quote;
  }

  const invoices = await tx.invoice.findMany({ where: { companyId, quoteId: quote.id } });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  if (!invoiceIds.length) {
    if (quote.depositPaidAt) return tx.quote.update({ where: { id: quote.id }, data: { depositPaidAt: null } });
    return quote;
  }

  const [payments, refunds, credits] = await Promise.all([
    tx.payment.findMany({ where: { companyId, invoiceId: { in: invoiceIds } } }),
    tx.paymentRefund.findMany({ where: { companyId, invoiceId: { in: invoiceIds } } }),
    tx.unappliedCustomerCredit ? tx.unappliedCustomerCredit.findMany({ where: { companyId, invoiceId: { in: invoiceIds } } }) : Promise.resolve([])
  ]);
  const usable = payments.reduce((sum, payment) => sum.plus(invoiceAppliedPaymentCredit(payment, refunds, credits)), decimal(0));
  const covered = usable.greaterThanOrEqualTo(required);
  if (covered && !quote.depositPaidAt) return tx.quote.update({ where: { id: quote.id }, data: { depositPaidAt: new Date() } });
  if (!covered && quote.depositPaidAt) return tx.quote.update({ where: { id: quote.id }, data: { depositPaidAt: null } });
  return quote;
}

async function recalculateInvoiceFinancials(tx, companyId, invoiceId, options = {}) {
  if (options.syncCredits !== false) await synchronizeInvoiceUnappliedCredits(tx, companyId, invoiceId, options);
  const ledger = await calculateInvoiceLedger(tx, companyId, invoiceId);
  const { current, totals, usablePaid, balanceDue } = ledger;
  const data = {
    amount: money(totals.total),
    subtotal: money(totals.subtotal),
    discountTotal: money(totals.discountTotal),
    taxTotal: money(totals.taxTotal),
    total: money(totals.total),
    balanceDue: money(balanceDue)
  };

  if (current.status === 'VOID') {
    data.status = 'VOID';
    data.paidAt = null;
  } else if (usablePaid.greaterThanOrEqualTo(totals.total) && totals.total.greaterThan(0)) {
    data.status = 'PAID';
    data.paidAt = current.paidAt || new Date();
  } else if (usablePaid.greaterThan(0)) {
    data.status = 'PARTIALLY_PAID';
    data.paidAt = null;
  } else {
    data.status = current.dueDate && new Date(current.dueDate) < new Date() ? 'OVERDUE' : (current.sentAt ? 'SENT' : current.status === 'DRAFT' ? 'DRAFT' : 'SENT');
    data.paidAt = null;
  }

  const invoice = await tx.invoice.update({ where: { id: invoiceId }, data, ...(options.include ? { include: options.include } : {}) });
  if (current.quoteId) await recomputeQuoteDepositCoverage(tx, companyId, current.quoteId);
  return { invoice, ledger };
}

async function recalculateInvoice(tx, companyId, invoiceId, options = {}) {
  return (await recalculateInvoiceFinancials(tx, companyId, invoiceId, options)).invoice;
}

async function lockPaymentAsUnapplied(tx, companyId, paymentId, reason, options = {}) {
  if (!tx.unappliedCustomerCredit) return null;
  const payment = await tx.payment.findFirst({ where: { id: paymentId, companyId } });
  if (!payment) throw new AppError(404, 'Payment not found');
  const invoice = await tx.invoice.findFirst({ where: { id: payment.invoiceId, companyId } });
  if (!invoice) throw new AppError(404, 'Invoice not found');
  const refunds = await tx.paymentRefund.findMany({ where: { companyId, paymentId } });
  const amount = money(usablePaymentCredit(payment, refunds));
  return tx.unappliedCustomerCredit.upsert({
    where: { paymentId },
    update: { amount, currency: options.currency || 'USD', status: amount.greaterThan(0) ? 'LOCKED' : 'CLOSED', reason: reason || 'Payment needs review before it can be applied' },
    create: {
      companyId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      paymentId,
      paymentLinkId: payment.paymentLinkId || null,
      amount,
      currency: options.currency || 'USD',
      status: amount.greaterThan(0) ? 'LOCKED' : 'CLOSED',
      reason: reason || 'Payment needs review before it can be applied'
    }
  });
}

async function syncUnappliedCreditForPayment(tx, companyId, paymentId, options = {}) {
  if (!tx.unappliedCustomerCredit) return { credit: null, excess: decimal(0) };
  const payment = await tx.payment.findFirst({ where: { id: paymentId, companyId } });
  if (!payment) throw new AppError(404, 'Payment not found');
  await synchronizeInvoiceUnappliedCredits(tx, companyId, payment.invoiceId, options);
  const credit = await tx.unappliedCustomerCredit.findUnique({ where: { paymentId } });
  const excess = credit && ACTIVE_UNAPPLIED_CREDIT_STATUSES.has(String(credit.status || '').toUpperCase()) ? money(credit.amount) : decimal(0);
  const ledger = await calculateInvoiceLedger(tx, companyId, payment.invoiceId);
  return { credit, excess, ledger };
}

async function refundableRemaining(tx, companyId, paymentId, options = {}) {
  const payment = await tx.payment.findFirst({ where: { id: paymentId, companyId } });
  if (!payment) throw new AppError(404, 'Payment not found');
  const refunds = await tx.paymentRefund.findMany({ where: { companyId, paymentId } });
  const reserved = options.completedOnly
    ? completedRefundTotalForPayment(payment.id, refunds)
    : activeRefundReservationTotalForPayment(payment.id, refunds);
  if (reserved.greaterThan(money(payment.amount))) throw new AppError(409, 'Refund records need review before another refund can be added.');
  return { payment, refunds, reserved, remaining: money(payment.amount).minus(reserved) };
}

module.exports = {
  ACTIVE_UNAPPLIED_CREDIT_STATUSES,
  COMPLETED_REFUND_STATUSES,
  activeRefundReservationTotalForPayment,
  activeUnappliedCreditForPayment,
  calculateInvoiceLedger,
  completedRefundTotalForPayment,
  decimal,
  invoiceAppliedPaymentCredit,
  lockPaymentAsUnapplied,
  maxDecimal,
  minDecimal,
  money,
  recalculateInvoice,
  recalculateInvoiceFinancials,
  recomputeQuoteDepositCoverage,
  refundableRemaining,
  sumDecimals,
  syncUnappliedCreditForPayment,
  synchronizeInvoiceUnappliedCredits,
  usablePaymentCredit
};
