const STATES = Object.freeze({
  PENDING: 'PENDING',
  CUSTOMER_PAID_HELD: 'CUSTOMER_PAID_HELD',
  CUSTOMER_PAID: 'CUSTOMER_PAID',
  SETTLED: 'SETTLED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  DISPUTED: 'DISPUTED',
  REFUNDED: 'REFUNDED',
  NEEDS_RECONCILIATION: 'NEEDS_RECONCILIATION'
});

const ALLOWED_TRANSITIONS = Object.freeze({
  PENDING: new Set(['PENDING', 'CUSTOMER_PAID_HELD', 'CUSTOMER_PAID', 'SETTLED', 'CANCELLED', 'FAILED', 'DISPUTED', 'REFUNDED', 'NEEDS_RECONCILIATION']),
  CUSTOMER_PAID_HELD: new Set(['CUSTOMER_PAID_HELD', 'SETTLED', 'DISPUTED', 'REFUNDED']),
  CUSTOMER_PAID: new Set(['CUSTOMER_PAID', 'SETTLED', 'DISPUTED', 'REFUNDED']),
  SETTLED: new Set(['SETTLED', 'DISPUTED', 'REFUNDED']),
  CANCELLED: new Set(['CANCELLED']),
  FAILED: new Set(['FAILED']),
  DISPUTED: new Set(['DISPUTED', 'REFUNDED']),
  REFUNDED: new Set(['REFUNDED']),
  NEEDS_RECONCILIATION: new Set(['NEEDS_RECONCILIATION', 'PENDING', 'CUSTOMER_PAID_HELD', 'CUSTOMER_PAID', 'SETTLED', 'CANCELLED', 'FAILED', 'DISPUTED', 'REFUNDED'])
});

function cleanStatus(status) {
  return String(status || '').trim().replace(/[\s_-]+/g, ' ').toUpperCase();
}

function normalizedProviderState(provider, status) {
  const value = cleanStatus(status);
  if (provider === 'PAYNOW') {
    if (['CREATED', 'SENT'].includes(value)) return STATES.PENDING;
    if (value === 'PAID') return STATES.CUSTOMER_PAID;
    if (value === 'AWAITING DELIVERY') return STATES.CUSTOMER_PAID_HELD;
    if (value === 'DELIVERED') return STATES.SETTLED;
    if (['CANCELLED', 'CANCELED'].includes(value)) return STATES.CANCELLED;
    if (value === 'DISPUTED') return STATES.DISPUTED;
    if (value === 'REFUNDED') return STATES.REFUNDED;
    if (['FAILED', 'FAILURE', 'ERROR', 'DECLINED', 'EXPIRED'].includes(value)) return STATES.FAILED;
    return STATES.NEEDS_RECONCILIATION;
  }
  if (provider === 'OZOW') {
    if (value === 'COMPLETE') return STATES.SETTLED;
    if (value === 'REFUNDED') return STATES.REFUNDED;
    if (value === 'DISPUTED') return STATES.DISPUTED;
    if (['CANCELLED', 'CANCELED'].includes(value)) return STATES.CANCELLED;
    if (['ERROR', 'FAILED', 'FAILURE'].includes(value)) return STATES.FAILED;
    if (['CREATED', 'PENDING'].includes(value)) return STATES.PENDING;
    return STATES.NEEDS_RECONCILIATION;
  }
  if (['CONFIRMED', 'PAID', 'SUCCESS', 'SUCCEEDED', 'SUCCESSFUL', 'COMPLETE', 'COMPLETED'].includes(value)) return STATES.CUSTOMER_PAID;
  if (value === 'REFUNDED') return STATES.REFUNDED;
  if (value === 'DISPUTED') return STATES.DISPUTED;
  if (['CANCELLED', 'CANCELED'].includes(value)) return STATES.CANCELLED;
  if (['FAILED', 'FAILURE', 'ERROR', 'DECLINED', 'EXPIRED'].includes(value)) return STATES.FAILED;
  return STATES.NEEDS_RECONCILIATION;
}

function currentPaymentState(link, payment) {
  if (payment && payment.status === 'REFUNDED') return STATES.REFUNDED;
  if (payment && payment.status === 'DISPUTED') return STATES.DISPUTED;
  if (link.status === 'REFUNDED') return STATES.REFUNDED;
  if (link.status === 'DISPUTED') return STATES.DISPUTED;
  const providerState = normalizedProviderState(link.provider, link.providerStatus || link.status);
  if (providerState !== STATES.NEEDS_RECONCILIATION) return providerState;
  if (payment && payment.status === 'CONFIRMED') return STATES.CUSTOMER_PAID;
  if (link.status === 'CANCELLED') return STATES.CANCELLED;
  if (link.status === 'FAILED') return STATES.FAILED;
  return STATES.PENDING;
}

function decidePaymentTransition({ provider, providerStatus, link, payment }) {
  const from = currentPaymentState(link, payment);
  const to = normalizedProviderState(provider, providerStatus);
  return { from, to, allowed: Boolean(ALLOWED_TRANSITIONS[from] && ALLOWED_TRANSITIONS[from].has(to)) };
}

module.exports = { ALLOWED_TRANSITIONS, STATES, currentPaymentState, decidePaymentTransition, normalizedProviderState };
