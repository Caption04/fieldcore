const WEAK_SECRET_VALUES = new Set(['dev-only-change-me', 'change-me', 'replace-me', 'secret', 'password']);

function boolEnv(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').toLowerCase());
}

function configured(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function providerConfigured(providerName, requiredVars) {
  const provider = String(process.env[providerName] || '').trim();
  if (!provider || provider === 'console') return true;
  return requiredVars.every(configured);
}

function validateEnv(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const errors = [];
  const has = (name) => Boolean(String(env[name] || '').trim());
  const weak = (name) => !has(name) || WEAK_SECRET_VALUES.has(String(env[name]).trim()) || String(env[name]).trim().length < 32;

  if (nodeEnv === 'production') {
    if (!has('DATABASE_URL')) errors.push('DATABASE_URL is required in production.');
    if (weak('JWT_SECRET')) errors.push('JWT_SECRET must be set to a strong non-default value in production.');
    if (!has('APP_BASE_URL')) errors.push('APP_BASE_URL is required in production.');
    if (!has('EMAIL_PROVIDER')) errors.push('EMAIL_PROVIDER should be explicitly set in production.');
    if (has('EMAIL_PROVIDER') && env.EMAIL_PROVIDER !== 'console' && !has('EMAIL_FROM')) errors.push('EMAIL_FROM is required when EMAIL_PROVIDER is enabled.');
    if (has('WHATSAPP_PROVIDER') && !providerConfiguredWithEnv(env, 'WHATSAPP_PROVIDER', ['WHATSAPP_PHONE_NUMBER_ID'])) errors.push('WhatsApp provider is enabled but required WhatsApp configuration is missing.');
    if (env.SAAS_BILLING_PROVIDER === 'stripe' && !has('STRIPE_SECRET_KEY')) errors.push('STRIPE_SECRET_KEY is required when Stripe SaaS billing is enabled.');
  }

  return { ok: errors.length === 0, errors, nodeEnv };
}

function providerConfiguredWithEnv(env, providerName, requiredVars) {
  const provider = String(env[providerName] || '').trim();
  if (!provider || provider === 'console') return true;
  return requiredVars.every((name) => Boolean(String(env[name] || '').trim()));
}

function assertValidEnv() {
  const result = validateEnv();
  if (!result.ok) {
    const error = new Error('Invalid production configuration: ' + result.errors.join(' '));
    error.code = 'ENV_VALIDATION_FAILED';
    throw error;
  }
  return result;
}

function configStatus() {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    database: configured('DATABASE_URL') ? 'configured' : 'missing',
    appBaseUrl: configured('APP_BASE_URL') ? 'configured' : 'missing',
    email: configured('EMAIL_PROVIDER') && providerConfigured('EMAIL_PROVIDER', ['EMAIL_FROM']) ? 'configured' : 'not configured',
    whatsapp: configured('WHATSAPP_PROVIDER') && providerConfigured('WHATSAPP_PROVIDER', ['WHATSAPP_PHONE_NUMBER_ID']) ? 'configured' : 'not configured',
    saasBilling: configured('SAAS_BILLING_PROVIDER') && (process.env.SAAS_BILLING_PROVIDER !== 'stripe' || configured('STRIPE_SECRET_KEY')) ? 'configured' : 'not configured',
    storage: boolEnv('USE_REMOTE_STORAGE') ? 'configured' : 'local uploads',
    rateLimiting: 'enabled'
  };
}

module.exports = { assertValidEnv, configStatus, validateEnv };
