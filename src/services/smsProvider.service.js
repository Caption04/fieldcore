const { consoleDeliveryEnabled, logConsoleDelivery } = require('./consoleCommunication.service');

let overrideProvider = null;

async function sendSms(message, context = {}) {
  if (overrideProvider) return overrideProvider(message, context);
  if (consoleDeliveryEnabled('SMS')) return logConsoleDelivery('SMS', message, { ...context, source: context.source || 'sms-provider' });
  if (process.env.NODE_ENV === 'test') return { status: 'SKIPPED', error: 'SMS sending disabled in tests' };
  if (!process.env.SMS_PROVIDER || process.env.SMS_PROVIDER === 'disabled') return { status: 'SKIPPED', error: 'SMS provider is not configured' };
  return { status: 'FAILED', error: 'Configured SMS provider is not implemented' };
}

function setSmsProvider(provider) {
  overrideProvider = provider;
}

module.exports = { sendSms, setSmsProvider };
