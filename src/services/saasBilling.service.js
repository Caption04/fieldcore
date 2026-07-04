const { prisma } = require('../db');
const { AppError } = require('../errors');
const { createCheckoutSession, providerStatus } = require('./saasBillingProvider.service');
const { DEFAULT_PLANS, billingSummary, getSubscription, logBillingEvent, publicSubscription } = require('./subscription.service');

async function requireActivePlan(planId, { includeInactive = false } = {}) {
  if (!prisma.saaSPlan) {
    const plan = DEFAULT_PLANS.find((item) => item.id === planId);
    if (!plan || (!includeInactive && plan.isActive === false)) throw new AppError(404, 'Plan not found.');
    return plan;
  }
  const plan = await prisma.saaSPlan.findUnique({ where: { id: planId } });
  if (!plan || (!includeInactive && plan.isActive === false)) throw new AppError(404, 'Plan not found.');
  return plan;
}

async function createCheckout(companyId, planId, actorId) {
  const [subscription, plan] = await Promise.all([getSubscription(companyId), requireActivePlan(planId)]);
  const session = await createCheckoutSession({ companyId, plan, subscription });
  await logBillingEvent(companyId, {
    subscriptionId: subscription.id,
    provider: session.provider,
    eventType: 'CHECKOUT_STARTED',
    status: session.checkoutUrl ? 'PENDING' : 'MANUAL_ACTION_REQUIRED',
    amount: plan.price,
    currency: plan.currency,
    providerRef: session.providerRef,
    message: actorId ? `Checkout started by ${actorId}` : session.message
  });
  return { ...session, planId: plan.id };
}

async function changePlan(companyId, planId, actorId) {
  const status = providerStatus();
  if (!status.configured) throw new AppError(503, 'SaaS billing provider is not configured.', { code: 'SAAS_BILLING_PROVIDER_NOT_CONFIGURED' });
  const [subscription, plan] = await Promise.all([getSubscription(companyId), requireActivePlan(planId)]);
  if (!prisma.companySubscription) throw new AppError(503, 'SaaS billing storage is not available. Run migrations and regenerate Prisma Client.', { code: 'SAAS_BILLING_STORAGE_NOT_AVAILABLE' });
  const updated = await prisma.companySubscription.update({
    where: { companyId },
    data: { planId: plan.id, provider: status.provider === 'not configured' ? null : status.provider }
  });
  await logBillingEvent(companyId, {
    subscriptionId: subscription.id,
    provider: status.provider,
    eventType: 'PLAN_CHANGED',
    status: status.mode === 'manual' ? 'MANUAL_ACTION_REQUIRED' : 'PENDING',
    amount: plan.price,
    currency: plan.currency,
    providerRef: null,
    message: actorId ? `Plan change requested by ${actorId}` : 'Plan change requested'
  });
  return publicSubscription({ ...updated, effectiveStatus: updated.status });
}

async function cancelSubscription(companyId, actorId) {
  const subscription = await getSubscription(companyId);
  if (!prisma.companySubscription) throw new AppError(503, 'SaaS billing storage is not available. Run migrations and regenerate Prisma Client.', { code: 'SAAS_BILLING_STORAGE_NOT_AVAILABLE' });
  const updated = await prisma.companySubscription.update({ where: { companyId }, data: { cancelAtPeriodEnd: true } });
  await logBillingEvent(companyId, {
    subscriptionId: subscription.id,
    provider: subscription.provider || providerStatus().provider,
    eventType: 'CANCEL_REQUESTED',
    status: 'PENDING',
    message: actorId ? `Cancellation requested by ${actorId}` : 'Cancellation requested'
  });
  return publicSubscription({ ...updated, effectiveStatus: updated.status });
}

module.exports = { billingSummary, cancelSubscription, changePlan, createCheckout };
