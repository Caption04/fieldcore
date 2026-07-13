const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const { AppError } = require('../../errors');
const { allocateFinancialNumber } = require('./financialNumber.service');
const {
  calculateInvoiceLedger,
  decimal,
  lockPaymentAsUnapplied,
  maxDecimal,
  minDecimal,
  money,
  recalculateInvoiceFinancials,
  syncUnappliedCreditForPayment,
  usablePaymentCredit
} = require('./invoiceLedger.service');
const { STATES, decidePaymentTransition } = require('./paymentStateMachine.service');
const { queuePaymentNotification } = require('./paymentNotificationOutbox.service');

const MAX_DATABASE_ATTEMPTS = 3;

function paymentMethodForProvider(provider) {
  if (provider === 'PAYFAST') return 'PAYFAST';
  if (provider === 'YOCO') return 'YOCO';
  if (provider === 'OZOW') return 'OZOW';
  if (provider === 'PAYNOW') return 'PAYNOW';
  return 'EXTERNAL_PAYMENT_LINK';
}

function sanitizedProviderPayload(payload, depth = 0) {
  if (depth > 2 || payload == null) return null;
  if (Array.isArray(payload)) return payload.slice(0, 20).map((value) => sanitizedProviderPayload(value, depth + 1));
  if (typeof payload !== 'object') return typeof payload === 'string' ? payload.slice(0, 500) : payload;
  const safe = {};
  const allowed = /^(reference|transactionreference|paynowreference|transactionid|providerpaymentid|amount|currency|currencycode|status|statusmessage|error|istest|eventtype|type|source)$/i;
  for (const [key, value] of Object.entries(payload)) {
    if (!allowed.test(key) || /hash|key|secret|token|pollurl|browserurl|email|instrument/i.test(key)) continue;
    safe[key] = sanitizedProviderPayload(value, depth + 1);
  }
  return safe;
}

function uniqueTargets(error) {
  const target = error && error.meta && error.meta.target;
  return (Array.isArray(target) ? target : [target]).map((item) => String(item || ''));
}

function expectedPaymentUniqueRace(error) {
  if (!error || error.code !== 'P2002') return false;
  const targets = uniqueTargets(error);
  return targets.some((item) => /eventId|paymentLinkId|providerRefundId|paymentRefundId|merchantTrace/.test(item));
}

function retryablePaymentError(error) {
  if (error && error.paymentRetryKind === 'FINANCIAL_COUNTER_CREATE') return true;
  if (expectedPaymentUniqueRace(error) || error && error.code === 'P2034') return true;
  const message = String(error && error.message || '').toLowerCase();
  return message.includes('serialization failure') || message.includes('deadlock detected');
}

function sameMoney(left, right) {
  try { return money(left).equals(money(right)); } catch { return false; }
}

async function lockPaymentLink(tx, connection, reference) {
  if (typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw`SELECT "id" FROM "PaymentLink" WHERE "companyId" = ${connection.companyId} AND "providerConnectionId" = ${connection.id} AND "provider" = ${connection.provider}::"PaymentProvider" AND "reference" = ${reference} FOR UPDATE`;
  }
  return tx.paymentLink.findFirst({ where: { companyId: connection.companyId, providerConnectionId: connection.id, provider: connection.provider, reference } });
}

async function lockInvoice(tx, companyId, invoiceId) {
  if (typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "companyId" = ${companyId} AND "id" = ${invoiceId} FOR UPDATE`;
  }
  return tx.invoice.findFirst({ where: { companyId, id: invoiceId } });
}

async function createReceiptForPayment(tx, payment, invoice) {
  const existing = await tx.receipt.findUnique({ where: { paymentId: payment.id } });
  if (existing) return existing;
  const receiptNumber = await allocateFinancialNumber(tx, payment.companyId, 'RECEIPT');
  return tx.receipt.create({ data: { companyId: payment.companyId, branchId: payment.branchId || invoice.branchId || null, invoiceId: invoice.id, paymentId: payment.id, receiptNumber, amount: payment.amount } });
}

async function createCreditNoteForRefund(tx, refund, reason) {
  const existing = await tx.creditNote.findFirst({ where: { companyId: refund.companyId, paymentRefundId: refund.id } });
  if (existing) return existing;
  const number = await allocateFinancialNumber(tx, refund.companyId, 'CREDIT_NOTE');
  return tx.creditNote.create({ data: { companyId: refund.companyId, invoiceId: refund.invoiceId, paymentRefundId: refund.id, number, amount: refund.amount, status: 'ISSUED', reason: reason || 'Payment refund' } });
}

async function reconciliationOnce(tx, { connection, link, parsed, finalEventId, raw, reason, amount = null, providerPaymentId = null }) {
  const identity = providerPaymentId || parsed.providerPaymentId || finalEventId;
  const dedupeKey = crypto.createHash('sha256')
    .update([connection.companyId, connection.provider, identity || '', reason || ''].join('|'))
    .digest('hex');
  const data = {
    companyId: connection.companyId,
    providerConnectionId: connection.id,
    provider: connection.provider,
    status: 'SUSPICIOUS',
    providerPaymentId: identity,
    dedupeKey,
    reference: link && link.reference || parsed.reference || null,
    amount: amount == null ? parsed.amount || link && link.amount || 0 : amount,
    currency: parsed.currency || link && link.currency || 'USD',
    paidAt: new Date(),
    suspiciousReason: reason,
    raw: sanitizedProviderPayload(raw)
  };
  if (tx.paymentReconciliationItem.upsert) {
    return tx.paymentReconciliationItem.upsert({ where: { dedupeKey }, update: {}, create: data });
  }
  const existing = await tx.paymentReconciliationItem.findFirst({ where: { companyId: connection.companyId, provider: connection.provider, providerPaymentId: identity, suspiciousReason: reason } });
  return existing || tx.paymentReconciliationItem.create({ data });
}

async function recordOverpayment(tx, { connection, link, payment, parsed, finalEventId, raw }) {
  const result = await syncUnappliedCreditForPayment(tx, connection.companyId, payment.id, { currency: link.currency });
  if (!result.excess.greaterThan(0)) return null;
  const item = await reconciliationOnce(tx, {
    connection,
    link,
    parsed,
    finalEventId,
    raw,
    amount: result.excess,
    providerPaymentId: `${payment.providerPaymentId || finalEventId}:OVERPAYMENT`,
    reason: 'Extra payment received — needs review'
  });
  await queuePaymentNotification(tx, { companyId: connection.companyId, eventKey: `${finalEventId}:OVERPAYMENT`, eventType: 'PAYMENT_NEEDS_REVIEW', entityType: 'Payment', entityId: payment.id, payload: { amount: result.excess.toFixed(2), currency: link.currency, paymentId: payment.id, invoiceId: payment.invoiceId } });
  return item;
}

async function applyProviderRefund(tx, { connection, link, payment, parsed, finalEventId }) {
  const existingCompleted = await tx.paymentRefund.findMany({ where: { companyId: connection.companyId, paymentId: payment.id, status: 'REFUNDED' }, orderBy: { createdAt: 'asc' } });
  const completedTotal = existingCompleted.reduce((sum, refund) => sum.plus(decimal(refund.amount)), decimal(0));
  const paymentAmount = money(payment.amount);
  const remaining = paymentAmount.minus(completedTotal);
  if (remaining.lessThan(0)) throw new AppError(409, 'Refund records need review before this payment can be updated.');

  const providerRefundId = parsed.providerRefundId || `${parsed.providerPaymentId || link.providerPaymentId || link.reference}:REFUNDED`;
  const alreadyApplied = await tx.paymentRefund.findFirst({ where: { companyId: connection.companyId, providerConnectionId: connection.id, providerRefundId } });
  const explicitRefundAmount = parsed.refundAmount == null ? null : money(parsed.refundAmount);
  let amountToApply = explicitRefundAmount == null ? remaining : minDecimal(explicitRefundAmount, remaining);
  const processedRefunds = [];

  if (!alreadyApplied && amountToApply.greaterThan(0)) {
    const pending = await tx.paymentRefund.findMany({
      where: { companyId: connection.companyId, paymentId: payment.id, providerConnectionId: connection.id, status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING'] } },
      orderBy: { createdAt: 'asc' }
    });
    let providerIdentityUsed = false;
    for (const request of pending) {
      if (!amountToApply.greaterThan(0)) break;
      const requestedAmount = money(request.amount);
      if (requestedAmount.greaterThan(amountToApply)) continue;
      const identity = providerIdentityUsed ? `${providerRefundId}:${request.id}` : providerRefundId;
      const completed = await tx.paymentRefund.update({
        where: { id: request.id },
        data: { status: 'REFUNDED', providerRefundId: identity, processedAt: new Date(), reason: request.reason || 'Refund confirmed by payment provider' }
      });
      providerIdentityUsed = true;
      amountToApply = amountToApply.minus(requestedAmount);
      processedRefunds.push(completed);
      await createCreditNoteForRefund(tx, completed, completed.reason);
    }

    if (amountToApply.greaterThan(0)) {
      const identity = providerIdentityUsed ? `${providerRefundId}:BALANCE` : providerRefundId;
      const completed = await tx.paymentRefund.create({
        data: {
          companyId: connection.companyId,
          branchId: payment.branchId || null,
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          providerConnectionId: connection.id,
          amount: amountToApply,
          status: 'REFUNDED',
          providerRefundId: identity,
          reason: 'Refund confirmed by payment provider',
          processedAt: new Date()
        }
      });
      processedRefunds.push(completed);
      await createCreditNoteForRefund(tx, completed, completed.reason);
    }
  }

  const ledger = await calculateInvoiceLedger(tx, connection.companyId, payment.invoiceId);
  const completedForPayment = ledger.refunds
    .filter((item) => item.paymentId === payment.id && String(item.status || '').toUpperCase() === 'REFUNDED')
    .reduce((sum, item) => sum.plus(decimal(item.amount)), decimal(0));
  const allRefunded = completedForPayment.greaterThanOrEqualTo(paymentAmount);
  if (allRefunded) {
    await tx.paymentRefund.updateMany({
      where: { companyId: connection.companyId, paymentId: payment.id, status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING', 'APPROVAL_REQUIRED'] } },
      data: { status: 'CANCELLED', reason: 'Superseded by the completed provider refund' }
    });
  }
  payment = await tx.payment.update({ where: { id: payment.id }, data: { status: allRefunded ? 'REFUNDED' : 'CONFIRMED', notes: allRefunded ? 'Payment refunded by provider' : 'Payment partly refunded by provider' } });
  const financials = await recalculateInvoiceFinancials(tx, connection.companyId, payment.invoiceId, { currency: link.currency });
  const credit = await syncUnappliedCreditForPayment(tx, connection.companyId, payment.id, { currency: link.currency });
  return { payment, refund: alreadyApplied || processedRefunds[0] || null, refunds: processedRefunds, financials, credit };
}

async function validateProviderIdentity(tx, { connection, link, parsed, finalEventId, raw }) {
  if (parsed.amount != null && !sameMoney(parsed.amount, link.amount)) {
    await reconciliationOnce(tx, { connection, link, parsed, finalEventId, raw, reason: 'Payment amount does not match the payment attempt' });
    return 'Payment amount does not match';
  }
  if (parsed.currency && String(parsed.currency).toUpperCase() !== String(link.currency).toUpperCase()) {
    await reconciliationOnce(tx, { connection, link, parsed, finalEventId, raw, reason: 'Payment currency does not match the payment attempt' });
    return 'Payment currency does not match';
  }
  if (parsed.providerIsTest != null && link.providerIsTest != null && Boolean(parsed.providerIsTest) !== Boolean(link.providerIsTest)) {
    await reconciliationOnce(tx, { connection, link, parsed, finalEventId, raw, reason: 'Payment mode does not match the payment attempt' });
    return 'Payment mode does not match';
  }
  if (parsed.providerPaymentId) {
    const existing = await tx.paymentLink.findFirst({ where: { providerConnectionId: connection.id, providerPaymentId: parsed.providerPaymentId } });
    if (existing && existing.id !== link.id) {
      await reconciliationOnce(tx, { connection, link, parsed, finalEventId, raw, reason: 'Provider transaction is already linked to another payment attempt' });
      return 'Provider transaction is already linked to another payment attempt';
    }
  }
  return null;
}

function latePaymentReviewReason(link, invoice) {
  if (String(invoice.status || '').toUpperCase() === 'VOID') return 'Payment arrived after the invoice was voided';
  if (link.customerIdSnapshot && link.customerIdSnapshot !== invoice.customerId) return 'Payment arrived after the invoice customer changed';
  const currentTotal = invoice.total != null ? invoice.total : invoice.amount;
  if (link.invoiceTotalSnapshot != null && !sameMoney(link.invoiceTotalSnapshot, currentTotal)) return 'Payment arrived after the invoice total changed';
  return null;
}

async function processTransaction({ connection, parsed, raw, finalEventId, signatureValid, database, hooks }) {
  const reference = parsed.reference || raw && (raw.reference || raw.Reference || raw.paymentReference || raw.TransactionReference) || null;
  const providerStatus = String(parsed.providerStatus || parsed.status || 'PENDING').toUpperCase();
  const eventWhere = { companyId: connection.companyId, provider: connection.provider, eventId: finalEventId };

  return database.$transaction(async (tx) => {
    let event = await tx.paymentProviderEvent.findFirst({ where: eventWhere });
    if (event && event.status === 'PROCESSED') {
      const duplicateLink = event.paymentLinkId ? await tx.paymentLink.findFirst({ where: { id: event.paymentLinkId, companyId: connection.companyId } }) : null;
      return { duplicate: true, event, payment: null, link: duplicateLink };
    }
    event = event
      ? await tx.paymentProviderEvent.update({ where: { id: event.id }, data: { status: 'RECEIVED', signatureValid, payload: sanitizedProviderPayload(raw), errorMessage: null, processedAt: null } })
      : await tx.paymentProviderEvent.create({ data: { companyId: connection.companyId, providerConnectionId: connection.id, provider: connection.provider, eventId: finalEventId, eventType: parsed.eventType || 'payment.provider_update', status: 'RECEIVED', signatureValid, payload: sanitizedProviderPayload(raw) } });

    const link = reference ? await lockPaymentLink(tx, connection, String(reference)) : null;
    if (!link) {
      await reconciliationOnce(tx, { connection, link: null, parsed: { ...parsed, reference }, finalEventId, raw, reason: 'Payment reference was not found' });
      const failed = await tx.paymentProviderEvent.update({ where: { id: event.id }, data: { status: 'FAILED', errorMessage: 'Payment reference was not found', processedAt: null } });
      return { duplicate: false, event: failed, payment: null, link: null };
    }

    const invoice = await lockInvoice(tx, connection.companyId, link.invoiceId);
    if (!invoice) throw new AppError(404, 'Invoice not found');
    let payment = await tx.payment.findFirst({ where: { companyId: connection.companyId, paymentLinkId: link.id } });
    const identityError = await validateProviderIdentity(tx, { connection, link, parsed, finalEventId, raw });
    if (identityError) {
      const failed = await tx.paymentProviderEvent.update({ where: { id: event.id }, data: { status: 'FAILED', paymentLinkId: link.id, invoiceId: link.invoiceId, paymentId: payment && payment.id || null, errorMessage: identityError, processedAt: null } });
      return { duplicate: false, event: failed, payment, link, needsReconciliation: true };
    }

    const transition = decidePaymentTransition({ provider: connection.provider, providerStatus, link, payment });
    const commonLinkData = { providerPaymentId: parsed.providerPaymentId || link.providerPaymentId, pollUrl: parsed.pollUrl || link.pollUrl, providerStatus, lastProviderVerifiedAt: parsed.verifiedAt || new Date() };
    let updatedLink = link;

    if (!transition.allowed) {
      await tx.auditLog.create({ data: { companyId: connection.companyId, action: 'PAYMENT_STALE_STATUS_IGNORED', entity: 'PaymentLink', entityId: link.id, metadata: { provider: connection.provider, from: transition.from, ignored: transition.to } } });
      event = await tx.paymentProviderEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', paymentLinkId: link.id, invoiceId: link.invoiceId, paymentId: payment && payment.id || null, errorMessage: null, processedAt: new Date() } });
      return { duplicate: false, ignored: true, transition, event, payment, link: updatedLink };
    }

    if ([STATES.CUSTOMER_PAID, STATES.CUSTOMER_PAID_HELD, STATES.SETTLED].includes(transition.to)) {
      if (!payment) {
        payment = await tx.payment.create({ data: { companyId: connection.companyId, branchId: invoice.branchId || link.branchId || null, invoiceId: invoice.id, amount: parsed.amount || link.amount, method: paymentMethodForProvider(link.provider), status: 'CONFIRMED', reference: link.reference, provider: link.provider, providerPaymentId: parsed.providerPaymentId || finalEventId, paymentLinkId: link.id, receivedAt: new Date(), confirmedAt: new Date(), notes: 'Confirmed by verified payment provider update' } });
        if (hooks && hooks.afterPaymentCreated) await hooks.afterPaymentCreated({ tx, payment, link, invoice });
      } else if (payment.status !== 'CONFIRMED') {
        payment = await tx.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', providerPaymentId: parsed.providerPaymentId || payment.providerPaymentId, confirmedAt: payment.confirmedAt || new Date(), notes: 'Confirmed by verified payment provider update' } });
      }
      await createReceiptForPayment(tx, payment, invoice);
      const reviewReason = latePaymentReviewReason(link, invoice);
      if (reviewReason) {
        await lockPaymentAsUnapplied(tx, connection.companyId, payment.id, reviewReason, { currency: link.currency });
        await reconciliationOnce(tx, { connection, link, parsed, finalEventId, raw, reason: reviewReason, amount: payment.amount, providerPaymentId: `${payment.providerPaymentId || finalEventId}:UNAPPLIED` });
        await tx.auditLog.create({ data: { companyId: connection.companyId, action: 'PAYMENT_RECEIVED_NEEDS_REVIEW', entity: 'Payment', entityId: payment.id, metadata: { provider: connection.provider, reason: reviewReason } } });
      }
      const financials = await recalculateInvoiceFinancials(tx, connection.companyId, invoice.id, { currency: link.currency });
      if (!reviewReason) await recordOverpayment(tx, { connection, link, payment, ledger: financials.ledger, parsed, finalEventId, raw });
      const held = transition.to === STATES.CUSTOMER_PAID_HELD;
      const linkMessage = reviewReason ? 'Payment received — needs review' : held ? 'Payment received — funds held by provider' : parsed.providerStatusMessage || null;
      updatedLink = await tx.paymentLink.update({ where: { id: link.id }, data: { ...commonLinkData, status: 'PAID', paidAt: link.paidAt || new Date(), providerStatusMessage: linkMessage } });
      await queuePaymentNotification(tx, { companyId: connection.companyId, eventKey: `${finalEventId}:${reviewReason ? 'REVIEW' : held ? 'HELD' : 'RECEIVED'}`, eventType: reviewReason ? 'PAYMENT_NEEDS_REVIEW' : held ? 'PAYMENT_HELD' : 'PAYMENT_RECEIVED', entityType: 'Payment', entityId: payment.id, payload: { amount: payment.amount, currency: link.currency, paymentId: payment.id, invoiceId: invoice.id, paymentLinkId: link.id, message: reviewReason || undefined } });
    } else if (transition.to === STATES.REFUNDED) {
      if (payment) {
        const refundResult = await applyProviderRefund(tx, { connection, link, payment, parsed, finalEventId });
        payment = refundResult.payment;
        await tx.auditLog.create({ data: { companyId: connection.companyId, action: 'PAYMENT_REFUNDED', entity: 'Payment', entityId: payment.id, metadata: { provider: connection.provider, refundId: refundResult.refund && refundResult.refund.id || null } } });
      } else {
        await reconciliationOnce(tx, { connection, link, parsed, finalEventId, raw, reason: 'Provider reported a refund before an original payment was recorded' });
        await tx.auditLog.create({ data: { companyId: connection.companyId, action: 'PAYMENT_REFUND_NEEDS_RECONCILIATION', entity: 'PaymentLink', entityId: link.id, metadata: { provider: connection.provider } } });
      }
      const fullyRefunded = !payment || payment.status === 'REFUNDED';
      updatedLink = await tx.paymentLink.update({ where: { id: link.id }, data: { ...commonLinkData, status: fullyRefunded ? 'REFUNDED' : 'PAID', providerStatusMessage: fullyRefunded ? 'Payment refunded' : 'Payment partly refunded' } });
      await queuePaymentNotification(tx, { companyId: connection.companyId, eventKey: `${finalEventId}:REFUNDED`, eventType: payment ? 'PAYMENT_REFUNDED' : 'PAYMENT_NEEDS_REVIEW', entityType: payment ? 'Payment' : 'PaymentLink', entityId: payment && payment.id || link.id, payload: { amount: parsed.refundAmount || parsed.amount || link.amount, currency: link.currency, paymentId: payment && payment.id || null, invoiceId: invoice.id, paymentLinkId: link.id } });
    } else if (transition.to === STATES.DISPUTED) {
      if (payment) {
        if (payment.status !== 'DISPUTED') payment = await tx.payment.update({ where: { id: payment.id }, data: { status: 'DISPUTED', notes: 'Payment disputed with provider' } });
        if (tx.unappliedCustomerCredit) {
          const credit = await tx.unappliedCustomerCredit.findUnique({ where: { paymentId: payment.id } });
          if (credit) await tx.unappliedCustomerCredit.update({ where: { id: credit.id }, data: { status: 'DISPUTED' } });
        }
        await recalculateInvoiceFinancials(tx, connection.companyId, payment.invoiceId);
        await tx.auditLog.create({ data: { companyId: connection.companyId, action: 'PAYMENT_DISPUTED', entity: 'Payment', entityId: payment.id, metadata: { provider: connection.provider } } });
      } else {
        await reconciliationOnce(tx, { connection, link, parsed, finalEventId, raw, reason: 'Provider reported a dispute before an original payment was recorded' });
        await tx.auditLog.create({ data: { companyId: connection.companyId, action: 'PAYMENT_DISPUTE_NEEDS_RECONCILIATION', entity: 'PaymentLink', entityId: link.id, metadata: { provider: connection.provider } } });
      }
      updatedLink = await tx.paymentLink.update({ where: { id: link.id }, data: { ...commonLinkData, status: 'DISPUTED', providerStatusMessage: 'Payment disputed' } });
      await queuePaymentNotification(tx, { companyId: connection.companyId, eventKey: `${finalEventId}:DISPUTED`, eventType: payment ? 'PAYMENT_DISPUTED' : 'PAYMENT_NEEDS_REVIEW', entityType: payment ? 'Payment' : 'PaymentLink', entityId: payment && payment.id || link.id, payload: { amount: parsed.amount || link.amount, currency: link.currency, paymentId: payment && payment.id || null, invoiceId: invoice.id, paymentLinkId: link.id } });
    } else if ([STATES.CANCELLED, STATES.FAILED].includes(transition.to)) {
      const cancelled = transition.to === STATES.CANCELLED;
      updatedLink = await tx.paymentLink.update({ where: { id: link.id }, data: { ...commonLinkData, status: cancelled ? 'CANCELLED' : 'FAILED', providerStatusMessage: parsed.providerStatusMessage || (cancelled ? 'Payment cancelled' : 'Payment could not be completed') } });
    } else if (transition.to === STATES.NEEDS_RECONCILIATION) {
      await reconciliationOnce(tx, { connection, link, parsed, finalEventId, raw, reason: 'Provider returned an unknown payment status' });
      await tx.auditLog.create({ data: { companyId: connection.companyId, action: 'PAYMENT_STATUS_NEEDS_RECONCILIATION', entity: 'PaymentLink', entityId: link.id, metadata: { provider: connection.provider, status: providerStatus.slice(0, 80) } } });
      updatedLink = await tx.paymentLink.update({ where: { id: link.id }, data: { ...commonLinkData, status: 'PENDING', providerStatusMessage: 'Payment needs review' } });
      await queuePaymentNotification(tx, { companyId: connection.companyId, eventKey: `${finalEventId}:REVIEW`, eventType: 'PAYMENT_NEEDS_REVIEW', entityType: 'PaymentLink', entityId: link.id, payload: { amount: parsed.amount || link.amount, currency: link.currency, invoiceId: invoice.id, paymentLinkId: link.id } });
    } else {
      updatedLink = await tx.paymentLink.update({ where: { id: link.id }, data: { ...commonLinkData, status: 'PENDING', providerStatusMessage: parsed.providerStatusMessage || null } });
    }

    event = await tx.paymentProviderEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', paymentLinkId: link.id, invoiceId: invoice.id, paymentId: payment && payment.id || null, errorMessage: null, processedAt: new Date() } });
    let verifiesCurrentCredentials = !link.credentialVersionId;
    if (link.credentialVersionId && tx.paymentProviderCredentialVersion) {
      const activeVersion = await tx.paymentProviderCredentialVersion.findFirst({ where: { companyId: connection.companyId, connectionId: connection.id, retiredAt: null }, orderBy: { version: 'desc' } });
      verifiesCurrentCredentials = Boolean(activeVersion && activeVersion.id === link.credentialVersionId);
    }
    if (verifiesCurrentCredentials) {
      await tx.paymentProviderConnection.update({ where: { id: connection.id }, data: { status: 'ACTIVE', signedResponseVerifiedAt: new Date(), lastTestedAt: new Date(), lastTestStatus: 'OK', lastTestError: null } });
    }
    return { duplicate: false, transition, event, payment, link: updatedLink };
  });
}

async function markFailedEvent(database, { connection, parsed, raw, finalEventId, signatureValid }) {
  const eventWhere = { companyId: connection.companyId, provider: connection.provider, eventId: finalEventId };
  const existing = await database.paymentProviderEvent.findFirst({ where: eventWhere });
  if (existing && existing.status === 'PROCESSED') return;
  if (existing) {
    await database.paymentProviderEvent.update({ where: { id: existing.id }, data: { status: 'FAILED', errorMessage: 'Payment update could not be completed', processedAt: null } });
    return;
  }
  try {
    await database.paymentProviderEvent.create({ data: { companyId: connection.companyId, providerConnectionId: connection.id, provider: connection.provider, eventId: finalEventId, eventType: parsed.eventType || 'payment.provider_update', status: 'FAILED', signatureValid, payload: sanitizedProviderPayload(raw), errorMessage: 'Payment update could not be completed' } });
  } catch (error) {
    if (!expectedPaymentUniqueRace(error)) throw error;
  }
}

async function applyPaymentProviderUpdate({ connection, parsed = {}, raw = {}, eventId = null, signatureValid = true, database, hooks = null, maxAttempts = MAX_DATABASE_ATTEMPTS }) {
  if (!database) throw new Error('A payment database client is required');
  const finalEventId = parsed.eventId || eventId || null;
  if (!finalEventId) throw new AppError(400, 'Payment update reference is missing');
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await processTransaction({ connection, parsed, raw, finalEventId, signatureValid, database, hooks });
    } catch (error) {
      lastError = error;
      if (!retryablePaymentError(error) || attempt === maxAttempts) break;
      const completed = await database.paymentProviderEvent.findFirst({ where: { companyId: connection.companyId, provider: connection.provider, eventId: finalEventId } });
      if (completed && completed.status === 'PROCESSED') {
        const link = completed.paymentLinkId ? await database.paymentLink.findFirst({ where: { id: completed.paymentLinkId, companyId: connection.companyId } }) : null;
        return { duplicate: true, event: completed, payment: null, link };
      }
    }
  }
  await markFailedEvent(database, { connection, parsed, raw, finalEventId, signatureValid });
  throw lastError;
}

module.exports = { MAX_DATABASE_ATTEMPTS, applyPaymentProviderUpdate, expectedPaymentUniqueRace, retryablePaymentError, sanitizedProviderPayload };
