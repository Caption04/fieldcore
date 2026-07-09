const { redactObject, redactText } = require('../utils/crypto/redact');

function boolEnv(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function consoleDeliveryEnabled(channel) {
  const name = String(channel || '').trim().toUpperCase();
  if (!['EMAIL', 'WHATSAPP', 'SMS'].includes(name)) return false;

  if (process.env.NODE_ENV === 'test' && !boolEnv('ALLOW_CONSOLE_DELIVERY_IN_TESTS')) {
    return false;
  }

  const globalMode = normalized(process.env.COMMUNICATION_DELIVERY_MODE);
  if (['console', 'mock', 'dry-run', 'dryrun'].includes(globalMode)) return true;
  if (boolEnv('CONSOLE_COMMUNICATIONS') || boolEnv('MOCK_COMMUNICATIONS') || boolEnv('DRY_RUN_COMMUNICATIONS')) return true;
  if (name && normalized(process.env[`${name}_PROVIDER`]) === 'console') return true;
  return false;
}

function channelProvider(channel) {
  const name = String(channel || '').trim().toUpperCase();
  if (name === 'EMAIL') return 'BREVO';
  if (name === 'WHATSAPP') return 'META_WHATSAPP_CLOUD';
  if (name === 'SMS') return 'SMS_CONSOLE';
  return 'CONSOLE';
}

function compact(value, max = 1200) {
  const text = redactText(value || '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function consolePayload(channel, message = {}, context = {}) {
  const payload = {
    mode: 'console',
    channel: String(channel || '').toUpperCase(),
    source: context.source || 'notification',
    provider: context.provider || channelProvider(channel),
    companyId: context.companyId || null,
    relatedType: context.relatedType || null,
    relatedId: context.relatedId || null,
    notificationLogId: context.notificationLogId || null,
    eventType: message.eventType || context.eventType || null,
    to: message.to || null,
    from: message.from || context.from || null,
    subject: message.subject || null,
    templateName: message.templateName || null,
    text: message.text ? compact(message.text) : null,
    htmlPreview: message.html ? compact(message.html) : null
  };

  return redactObject(payload);
}

function logConsoleDelivery(channel, message = {}, context = {}) {
  const payload = consolePayload(channel, message, context);
  console.info(`[fieldcore:${String(channel || '').toLowerCase()}:console]`, JSON.stringify(payload, null, 2));
  return {
    status: 'SENT',
    providerStatus: 'CONSOLE',
    providerMessageId: `console-${String(channel || '').toLowerCase()}-${Date.now()}`,
    console: true
  };
}

function consoleTestResult(channel) {
  return {
    ok: true,
    status: 'ACTIVE',
    verified: false,
    message: `${String(channel || '').toUpperCase()} is in console delivery mode. No live provider request was made.`
  };
}

module.exports = { consoleDeliveryEnabled, consolePayload, consoleTestResult, logConsoleDelivery };
