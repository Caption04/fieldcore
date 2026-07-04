const { AppError } = require('../errors');

function providerName() {
  return String(process.env.SAAS_BILLING_PROVIDER || '').trim().toLowerCase();
}

function providerStatus() {
  const provider = providerName();
  if (!provider) return { provider: 'not configured', configured: false, mode: 'disabled' };
  if (provider === 'manual' || provider === 'internal') return { provider, configured: true, mode: 'manual' };
  if (provider === 'stripe') return { provider, configured: Boolean(process.env.STRIPE_SECRET_KEY), mode: 'stripe' };
  return { provider, configured: false, mode: 'unsupported' };
}

function assertConfigured() {
  const status = providerStatus();
  if (!status.configured) throw new AppError(503, 'SaaS billing provider is not configured.', { code: 'SAAS_BILLING_PROVIDER_NOT_CONFIGURED' });
  return status;
}

async function createCheckoutSession({ companyId, plan, subscription }) {
  const status = assertConfigured();
  if (status.mode === 'manual') {
    return {
      provider: status.provider,
      mode: 'manual',
      checkoutUrl: null,
      providerRef: `manual-${companyId}-${plan.id}`,
      message: 'Manual billing mode is enabled. Contact support to activate or change this subscription.'
    };
  }

  throw new AppError(503, 'Live SaaS checkout is not implemented for this provider yet.', { code: 'SAAS_BILLING_PROVIDER_PENDING', provider: status.provider });
}

module.exports = { createCheckoutSession, providerStatus };
