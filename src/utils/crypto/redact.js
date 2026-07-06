const crypto = require('crypto');

const SECRET_PATTERN = /(api[-_ ]?key|token|secret|password|authorization|access[-_ ]?key|signature)=?["']?[^"',\s}]+/gi;

function redactText(value) {
  return String(value == null ? '' : value).replace(SECRET_PATTERN, '$1=[redacted]').slice(0, 500);
}

function safeError(error) {
  const message = error && error.message ? error.message : error;
  return redactText(message || 'Provider request failed');
}

function maskRecipient(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.includes('@')) {
    const [name, domain] = text.split('@');
    return `${name.slice(0, 2)}***@${domain || 'unknown'}`;
  }
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 4) return '***';
  return `${text.startsWith('+') ? '+' : ''}***${digits.slice(-4)}`;
}

function hashLookup(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex');
}

function redactObject(input) {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(redactObject);
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (/key|token|secret|password|authorization/i.test(key)) output[key] = '[redacted]';
    else if (value && typeof value === 'object') output[key] = redactObject(value);
    else output[key] = value;
  }
  return output;
}

module.exports = { hashLookup, maskRecipient, redactObject, redactText, safeError };
