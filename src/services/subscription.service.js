const { prisma } = require('../db');
const { AppError } = require('../errors');

const ACTIVE_STATUSES = new Set(['TRIALING', 'ACTIVE', 'FREE_INTERNAL', 'PAST_DUE']);
const RESTRICTED_STATUSES = new Set(['CANCELLED', 'EXPIRED', 'SUSPENDED']);

const DEFAULT_PLANS = [
  {
    id: 'starter',
    name: 'Basic',
    description: '10–15 field workers, one office team, and recurring commercial jobs.',
    price: 500,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    limits: { maxUsers: 6, maxWorkers: 15, maxClients: 500, maxJobsPerMonth: 750, maxPublicBookingsPerMonth: 250, maxStorageMb: 10240, maxWhatsAppNotificationsPerMonth: 500, maxEmailNotificationsPerMonth: 2500 },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: false, customBranding: false, multiLocation: false, apiAccess: false, annualFirst: false, implementationFee: false, customPricing: false }
  },
  {
    id: 'growth',
    name: 'Standard',
    description: '15–40 field workers, multi-site work, stronger reporting, and client portal usage.',
    price: 1500,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    limits: { maxUsers: 20, maxWorkers: 40, maxClients: 2500, maxJobsPerMonth: 5000, maxPublicBookingsPerMonth: 1500, maxStorageMb: 51200, maxWhatsAppNotificationsPerMonth: 5000, maxEmailNotificationsPerMonth: 25000 },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: false, annualFirst: true, implementationFee: true, customPricing: false }
  },
  {
    id: 'business',
    name: 'Enterprise',
    description: 'Multi-branch, high-volume operations with contracts, SLA controls, integrations, and onboarding.',
    price: 3500,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    limits: { maxUsers: null, maxWorkers: null, maxClients: null, maxJobsPerMonth: null, maxPublicBookingsPerMonth: null, maxStorageMb: null, maxWhatsAppNotificationsPerMonth: null, maxEmailNotificationsPerMonth: null },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: true, annualFirst: true, implementationFee: true, customPricing: true, advertisedPrice: 'Contact us' }
  }
];

const FREE_INTERNAL_PLAN = {
  id: 'free-internal',
  name: 'Free Internal',
  description: 'Internal, demo, and test companies.',
  price: 0,
  currency: 'USD',
  interval: 'month',
  isActive: false,
  limits: { maxUsers: null, maxWorkers: null, maxClients: null, maxJobsPerMonth: null, maxPublicBookingsPerMonth: null, maxStorageMb: null, maxWhatsAppNotificationsPerMonth: null, maxEmailNotificationsPerMonth: null },
  features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: true }
};

function monthWindow(now = new Date()) {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  };
}

function daysRemaining(date, now = new Date()) {
  if (!date) return null;
  return Math.max(0, Math.ceil((new Date(date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

function decimalToNumber(value) {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value || 0);
}

function planToResponse(plan, { includeInactive = false } = {}) {
  if (!plan || (!includeInactive && plan.isActive === false)) return null;
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description || null,
    price: decimalToNumber(plan.price),
    currency: plan.currency,
    interval: plan.interval,
    isActive: Boolean(plan.isActive),
    limits: plan.limits || {},
    features: plan.features || {}
  };
}

async function ensureDefaultPlans() {
  if (!prisma.saaSPlan) return;
  const plans = DEFAULT_PLANS.concat(FREE_INTERNAL_PLAN);
  await Promise.all(plans.map((plan) => prisma.saaSPlan.upsert({ where: { id: plan.id }, update: plan, create: plan })));
}

async function listPlans({ includeInactive = false } = {}) {
  if (!prisma.saaSPlan) return DEFAULT_PLANS.concat(includeInactive ? [FREE_INTERNAL_PLAN] : []).map((plan) => planToResponse(plan, { includeInactive })).filter(Boolean);
  const plans = await prisma.saaSPlan.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { price: 'asc' } });
  return plans.map((plan) => planToResponse(plan, { includeInactive })).filter(Boolean);
}

function fallbackPlan(id) {
  return DEFAULT_PLANS.concat(FREE_INTERNAL_PLAN).find((plan) => plan.id === id) || DEFAULT_PLANS[0];
}

async function defaultTrialSubscription(companyId, planId = 'starter', days = 14) {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  if (!prisma.companySubscription) {
    const plan = fallbackPlan(planId || 'starter');
    return {
      id: `fallback-subscription-${companyId}`,
      companyId,
      planId: plan.id,
      status: companyId === 'demo-company' ? 'FREE_INTERNAL' : 'TRIALING',
      trialStartedAt: now,
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      cancelAtPeriodEnd: false,
      provider: process.env.SAAS_BILLING_PROVIDER || null,
      plan
    };
  }
  return prisma.companySubscription.create({
    data: {
      companyId,
      planId,
      status: 'TRIALING',
      trialStartedAt: now,
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      provider: process.env.SAAS_BILLING_PROVIDER || null
    }
  });
}

async function getSubscription(companyId) {
  if (!prisma.companySubscription) return defaultTrialSubscription(companyId, companyId === 'demo-company' ? 'free-internal' : 'starter');
  let subscription = await prisma.companySubscription.findUnique({ where: { companyId }, include: { plan: true } });
  if (!subscription) {
    const plan = prisma.saaSPlan ? await prisma.saaSPlan.findUnique({ where: { id: 'starter' } }).catch(() => null) : null;
    subscription = await defaultTrialSubscription(companyId, plan ? plan.id : null);
    subscription.plan = plan || fallbackPlan('starter');
  }
  const effectiveStatus = subscription.status === 'TRIALING' && subscription.trialEndsAt && new Date(subscription.trialEndsAt) < new Date() ? 'EXPIRED' : subscription.status;
  const plan = subscription.plan || fallbackPlan(subscription.planId || 'starter');
  return { ...subscription, effectiveStatus, plan };
}

function canAccess(subscription) {
  return ACTIVE_STATUSES.has(subscription.effectiveStatus) && !RESTRICTED_STATUSES.has(subscription.effectiveStatus);
}

async function getUsage(companyId) {
  const { start, end } = monthWindow();
  const [users, workers, clients, jobs, publicBookings, emailNotifications, whatsappNotifications] = await Promise.all([
    prisma.user.count({ where: { companyId } }),
    prisma.workerProfile.count({ where: { companyId, active: true } }),
    prisma.clientAccount.count({ where: { companyId, status: { in: ['ACTIVE', 'INVITED'] } } }),
    prisma.job.count({ where: { companyId, createdAt: { gte: start, lt: end } } }),
    prisma.bookingRequest.count({ where: { companyId, source: 'public_booking', createdAt: { gte: start, lt: end } } }),
    prisma.notificationLog.count({ where: { companyId, channel: 'EMAIL', status: 'SENT', createdAt: { gte: start, lt: end } } }),
    prisma.notificationLog.count({ where: { companyId, channel: 'WHATSAPP', status: 'SENT', createdAt: { gte: start, lt: end } } })
  ]);
  return { users, workers, clients, jobsThisMonth: jobs, publicBookingsThisMonth: publicBookings, emailNotificationsThisMonth: emailNotifications, whatsappNotificationsThisMonth: whatsappNotifications, storageMb: null, periodStart: start, periodEnd: end };
}

function usageKey(limitKey) {
  return {
    maxUsers: 'users',
    maxWorkers: 'workers',
    maxClients: 'clients',
    maxJobsPerMonth: 'jobsThisMonth',
    maxPublicBookingsPerMonth: 'publicBookingsThisMonth',
    maxEmailNotificationsPerMonth: 'emailNotificationsThisMonth',
    maxWhatsAppNotificationsPerMonth: 'whatsappNotificationsThisMonth',
    maxStorageMb: 'storageMb'
  }[limitKey];
}

async function billingSummary(companyId) {
  const [subscription, usage, plans, events] = await Promise.all([
    getSubscription(companyId),
    getUsage(companyId),
    listPlans(),
    prisma.saaSBillingEvent ? prisma.saaSBillingEvent.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 20 }) : []
  ]);
  const plan = planToResponse(subscription.plan, { includeInactive: true });
  const limits = plan && plan.limits || {};
  const usageRows = Object.entries(limits).map(([limitKey, limit]) => {
    const key = usageKey(limitKey);
    return { key: limitKey, used: key ? usage[key] : null, limit, unlimited: limit == null };
  });
  return {
    subscription: publicSubscription(subscription),
    plan,
    plans,
    usage,
    usageRows,
    provider: providerStatus(),
    events: events.map(publicBillingEvent)
  };
}

function providerStatus() {
  const provider = String(process.env.SAAS_BILLING_PROVIDER || '').trim() || 'not configured';
  const configured = ['manual', 'internal'].includes(provider) || Boolean(process.env.STRIPE_SECRET_KEY);
  return { provider, configured, mode: provider === 'manual' || provider === 'internal' ? 'manual' : provider === 'stripe' ? 'stripe' : 'disabled' };
}

function publicSubscription(subscription) {
  return {
    id: subscription.id,
    planId: subscription.planId,
    status: subscription.effectiveStatus || subscription.status,
    storedStatus: subscription.status,
    trialStartedAt: subscription.trialStartedAt,
    trialEndsAt: subscription.trialEndsAt,
    trialDaysRemaining: daysRemaining(subscription.trialEndsAt),
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    provider: subscription.provider || null,
    providerConfigured: providerStatus().configured
  };
}

function publicBillingEvent(event) {
  return {
    id: event.id,
    provider: event.provider || null,
    eventType: event.eventType,
    status: event.status,
    amount: event.amount == null ? null : decimalToNumber(event.amount),
    currency: event.currency || null,
    providerRef: event.providerRef || null,
    message: event.message || null,
    createdAt: event.createdAt
  };
}

async function canUseFeature(companyId, featureKey) {
  const subscription = await getSubscription(companyId);
  if (!canAccess(subscription)) return { allowed: false, reason: `Subscription status ${subscription.effectiveStatus} restricts this feature.` };
  const features = subscription.plan && subscription.plan.features || {};
  if (features[featureKey] === false) return { allowed: false, reason: `${featureKey} is not included in the current plan.` };
  return { allowed: true, subscription };
}

async function requireFeature(companyId, featureKey) {
  const result = await canUseFeature(companyId, featureKey);
  if (!result.allowed) throw new AppError(403, result.reason, { code: 'FEATURE_NOT_AVAILABLE', feature: featureKey });
  return result;
}

async function checkPlanLimit(companyId, limitKey, increment = 1) {
  const subscription = await getSubscription(companyId);
  if (!canAccess(subscription)) return { allowed: false, reason: `Subscription status ${subscription.effectiveStatus} restricts this action.`, status: subscription.effectiveStatus };
  const limit = subscription.plan && subscription.plan.limits ? subscription.plan.limits[limitKey] : null;
  if (limit == null) return { allowed: true, limit: null, used: null, unlimited: true };
  const usage = await getUsage(companyId);
  const key = usageKey(limitKey);
  const used = key ? Number(usage[key] || 0) : 0;
  if (used + increment > Number(limit)) return { allowed: false, reason: `${limitKey} limit reached for the current plan.`, limit, used, projected: used + increment };
  return { allowed: true, limit, used, projected: used + increment };
}

async function requirePlanLimit(companyId, limitKey, increment = 1) {
  const result = await checkPlanLimit(companyId, limitKey, increment);
  if (!result.allowed) throw new AppError(403, result.reason, { code: 'PLAN_LIMIT_REACHED', limitKey, used: result.used, limit: result.limit });
  return result;
}

async function logBillingEvent(companyId, data) {
  if (!prisma.saaSBillingEvent) return { id: `fallback-billing-event-${Date.now()}`, companyId, ...data, createdAt: new Date() };
  return prisma.saaSBillingEvent.create({ data: { companyId, ...data } });
}

module.exports = {
  ACTIVE_STATUSES,
  DEFAULT_PLANS,
  FREE_INTERNAL_PLAN,
  billingSummary,
  canUseFeature,
  checkPlanLimit,
  defaultTrialSubscription,
  ensureDefaultPlans,
  getSubscription,
  getUsage,
  listPlans,
  logBillingEvent,
  publicBillingEvent,
  publicSubscription,
  requireFeature,
  requirePlanLimit
};
