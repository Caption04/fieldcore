const { consoleDeliveryEnabled, logConsoleDelivery } = require('./consoleCommunication.service');

let overrideProvider = null;

function cleanError(error) {
  const message = error && error.message ? error.message : String(error || 'Email delivery failed');
  return message.replace(/(api[-_ ]?key|token|secret|password)=?[^,\s]+/gi, '$1=[redacted]').slice(0, 500);
}

async function sendEmail(message) {
  if (overrideProvider) return overrideProvider(message);
  if (consoleDeliveryEnabled('EMAIL')) return logConsoleDelivery('EMAIL', message, { source: 'email-provider', from: process.env.EMAIL_FROM });
  if (process.env.NODE_ENV === 'test') return { status: 'SKIPPED', error: 'Email sending disabled in tests' };
  if (!process.env.EMAIL_PROVIDER || !process.env.EMAIL_FROM) return { status: 'SKIPPED', error: 'Email provider is not configured' };
  if (process.env.EMAIL_PROVIDER === 'console') return logConsoleDelivery('EMAIL', message, { source: 'email-provider', from: process.env.EMAIL_FROM });
  if (process.env.EMAIL_PROVIDER === 'webhook') {
    if (!process.env.EMAIL_API_URL) return { status: 'SKIPPED', error: 'Email API URL is not configured' };
    if (typeof fetch !== 'function') return { status: 'FAILED', error: 'Fetch API is unavailable for email delivery' };
    try {
      const response = await fetch(process.env.EMAIL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.EMAIL_API_KEY ? { Authorization: 'Bearer ' + process.env.EMAIL_API_KEY } : {})
        },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: message.to, subject: message.subject, text: message.text, html: message.html })
      });
      if (!response.ok) return { status: 'FAILED', error: cleanError('Email provider returned HTTP ' + response.status) };
      return { status: 'SENT' };
    } catch (error) {
      return { status: 'FAILED', error: cleanError(error) };
    }
  }
  return { status: 'FAILED', error: 'Configured email provider is not implemented' };
}

function setEmailProvider(provider) {
  overrideProvider = provider;
}

module.exports = { cleanError, sendEmail, setEmailProvider };
