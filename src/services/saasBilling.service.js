const { prisma } = require('../db');
const { AppError } = require('../errors');
const { createCheckoutSession, providerStatus } = require('./saasBillingProvider.service');
const { DEFAULT_PLANS, billingSummary, commercialPlanPricing, companyBillingMarket, getSubscription, logBillingEvent, publicSubscription } = require('./subscription.service');

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
  const [subscription, plan, market] = await Promise.all([getSubscription(companyId), requireActivePlan(planId), companyBillingMarket(companyId)]);
  const commercial = commercialPlanPricing(plan, market);
  const session = await createCheckoutSession({ companyId, plan, subscription, commercial });
  await logBillingEvent(companyId, {
    subscriptionId: subscription.id,
    provider: session.provider,
    eventType: 'CHECKOUT_STARTED',
    status: session.checkoutUrl ? 'PENDING' : 'MANUAL_ACTION_REQUIRED',
    amount: commercial.monthlyPrice == null ? plan.price : commercial.monthlyPrice,
    currency: commercial.currency || plan.currency,
    providerRef: session.providerRef,
    message: actorId ? `Checkout started by ${actorId}` : session.message
  });
  return { ...session, planId: plan.id };
}

async function changePlan(companyId, planId, actorId) {
  const status = providerStatus();
  if (!status.configured) throw new AppError(503, 'SaaS billing provider is not configured.', { code: 'SAAS_BILLING_PROVIDER_NOT_CONFIGURED' });
  const [subscription, plan, market] = await Promise.all([getSubscription(companyId), requireActivePlan(planId), companyBillingMarket(companyId)]);
  const commercial = commercialPlanPricing(plan, market);
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
    amount: commercial.monthlyPrice == null ? plan.price : commercial.monthlyPrice,
    currency: commercial.currency || plan.currency,
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

async function selectMockPlan(companyId, planId, billingInterval, actorId) {
  const interval = billingInterval === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  const [subscription, plan, market] = await Promise.all([getSubscription(companyId), requireActivePlan(planId), companyBillingMarket(companyId)]);
  const commercial = commercialPlanPricing(plan, market);
  const custom = Boolean(commercial.custom);
  const amount = interval === 'ANNUAL' ? commercial.annualTotal : commercial.monthlyPrice;
  const now = new Date();
  const hasActiveTrial = subscription.status === 'TRIALING' && subscription.trialEndsAt && new Date(subscription.trialEndsAt) > now;

  const updated = await prisma.$transaction(async (tx) => {
    if (custom) {
      // Contacting sales is not the same as activating Enterprise. Preserve the
      // existing usable plan/trial and record the request separately.
      const next = await tx.companySubscription.update({
        where: { companyId },
        data: { billingInterval: interval, provider: 'MOCK_INTERNAL' }
      });
      await tx.company.update({ where: { id: companyId }, data: { onboardingState: 'COMPLETED' } });
      await tx.saaSBillingEvent.create({ data: { companyId, subscriptionId: subscription.id, provider: 'MOCK_INTERNAL', eventType: 'ENTERPRISE_CONTACT_REQUESTED', status: 'CONTACT_REQUESTED', amount: null, currency: commercial.currency, message: `${interval} ${plan.name} contact request created by ${actorId || 'owner'}; Enterprise was not activated and no external payment was processed.` } });
      return next;
    }

    const periodEnd = new Date(now);
    if (interval === 'ANNUAL') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);
    const next = await tx.companySubscription.update({
      where: { companyId },
      data: {
        planId: plan.id,
        billingInterval: interval,
        status: hasActiveTrial ? 'TRIALING' : 'ACTIVE',
        provider: 'MOCK_INTERNAL',
        currentPeriodStart: hasActiveTrial ? subscription.currentPeriodStart || subscription.trialStartedAt || now : now,
        currentPeriodEnd: hasActiveTrial ? subscription.trialEndsAt : periodEnd,
        cancelAtPeriodEnd: false
      }
    });
    await tx.company.update({ where: { id: companyId }, data: { onboardingState: 'COMPLETED' } });
    await tx.saaSBillingEvent.create({ data: { companyId, subscriptionId: subscription.id, provider: 'MOCK_INTERNAL', eventType: 'MOCK_PLAN_SELECTED', status: 'CONFIRMED', amount: amount == null ? null : amount, currency: commercial.currency, message: `${interval} ${plan.name} selected by ${actorId || 'owner'}; no external payment processed.${hasActiveTrial ? ' Existing free trial preserved.' : ''}` } });
    return next;
  });
  return { subscription: publicSubscription({ ...updated, effectiveStatus: updated.status }), plan: { id: plan.id, name: plan.name, requested: custom }, pricing: commercial, mock: true, externalPaymentProcessed: false, enterpriseActivated: !custom };
}

module.exports = { billingSummary, cancelSubscription, changePlan, createCheckout, selectMockPlan };
