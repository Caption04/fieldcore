const { AppError } = require('../../errors');
const { money } = require('./invoiceLedger.service');
const { STATES, normalizedProviderState } = require('./paymentStateMachine.service');

function sameMoney(left, right) {
  try { return money(left).equals(money(right)); } catch { return false; }
}

async function verifiedProviderUpdate({ database, connection, provider, parsed }) {
  const link = parsed.reference ? await database.paymentLink.findFirst({
    where: { companyId: connection.companyId, providerConnectionId: connection.id, provider: connection.provider, reference: String(parsed.reference) }
  }) : null;
  if (!link) throw new AppError(404, 'Payment reference was not found');
  if (!sameMoney(parsed.amount, link.amount)) throw new AppError(409, 'Payment amount does not match');
  if (link.providerPaymentId && parsed.providerPaymentId && link.providerPaymentId !== parsed.providerPaymentId) throw new AppError(409, 'Payment reference does not match');
  if (parsed.providerIsTest !== undefined && parsed.providerIsTest !== null && link.providerIsTest !== null && Boolean(parsed.providerIsTest) !== Boolean(link.providerIsTest)) throw new AppError(409, 'Payment mode does not match');

  const validateAuthoritative = async (checked) => {
    if (!checked || String(checked.reference || link.reference) !== String(link.reference)) throw new AppError(409, 'Payment is still being checked');
    if (checked.amount != null && !sameMoney(checked.amount, link.amount)) throw new AppError(409, 'Payment is still being checked');
    if (checked.currency && String(checked.currency).toUpperCase() !== String(link.currency).toUpperCase()) throw new AppError(409, 'Payment is still being checked');
    if (link.providerPaymentId && checked.providerPaymentId && link.providerPaymentId !== checked.providerPaymentId) throw new AppError(409, 'Payment is still being checked');
    if (checked.providerIsTest != null && link.providerIsTest != null && Boolean(checked.providerIsTest) !== Boolean(link.providerIsTest)) throw new AppError(409, 'Payment is still being checked');
    return checked;
  };

  if (connection.provider === 'PAYNOW' && parsed.important) {
    const polled = await validateAuthoritative(await provider.getPaymentStatus({ ...link, pollUrl: link.pollUrl || parsed.pollUrl || null }));
    if (String(polled.providerStatus) !== String(parsed.providerStatus)) {
      await database.auditLog.create({ data: { companyId: connection.companyId, action: 'PAYMENT_PROVIDER_STATUS_CHANGED', entity: 'PaymentLink', entityId: link.id, metadata: { provider: 'PAYNOW', callbackStatus: String(parsed.providerStatus || '').slice(0, 80), authoritativeStatus: String(polled.providerStatus || '').slice(0, 80) } } });
      const state = normalizedProviderState('PAYNOW', polled.providerStatus || polled.status);
      if ([STATES.PENDING, STATES.NEEDS_RECONCILIATION].includes(state)) throw new AppError(409, 'Payment is still being checked');
    }
    return { ...polled, pollUrl: polled.pollUrl || parsed.pollUrl || link.pollUrl || null, providerPaymentId: polled.providerPaymentId || parsed.providerPaymentId || link.providerPaymentId || null };
  }

  if (connection.provider === 'OZOW') {
    const checked = await validateAuthoritative(await provider.getPaymentStatus(link));
    if (String(checked.status || checked.providerStatus) !== String(parsed.status || parsed.providerStatus)) {
      await database.auditLog.create({ data: { companyId: connection.companyId, action: 'PAYMENT_PROVIDER_STATUS_CHANGED', entity: 'PaymentLink', entityId: link.id, metadata: { provider: 'OZOW', callbackStatus: String(parsed.status || parsed.providerStatus || '').slice(0, 80), authoritativeStatus: String(checked.status || checked.providerStatus || '').slice(0, 80) } } });
      const state = normalizedProviderState('OZOW', checked.status || checked.providerStatus);
      if ([STATES.PENDING, STATES.NEEDS_RECONCILIATION].includes(state)) throw new AppError(409, 'Payment is still being checked');
    }
    return checked;
  }
  return parsed;
}

module.exports = { sameMoney, verifiedProviderUpdate };
