const crypto = require('crypto');

function upperSha512(text) {
  return crypto.createHash('sha512').update(String(text || ''), 'utf8').digest('hex').toUpperCase();
}

function lowerSha512(text) {
  return crypto.createHash('sha512').update(String(text || ''), 'utf8').digest('hex').toLowerCase();
}

function normalizeSecretKey(key) {
  return String(key || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function configValue(connection, key, envName, fallback) {
  const config = connection && connection.config || {};
  if (config[key] !== undefined && config[key] !== null && String(config[key]).trim() !== '') return config[key];
  if (envName && process.env[envName] !== undefined && String(process.env[envName]).trim() !== '') return process.env[envName];
  return fallback;
}

function secretValue(secrets, key, envName, fallback) {
  const normalized = normalizeSecretKey(key);
  const compact = normalized.replace(/_/g, '');
  if (secrets && secrets[normalized] !== undefined && secrets[normalized] !== null && String(secrets[normalized]).trim() !== '') return secrets[normalized];
  if (secrets && secrets[key] !== undefined && secrets[key] !== null && String(secrets[key]).trim() !== '') return secrets[key];
  if (secrets) {
    const found = Object.keys(secrets).find((candidate) => normalizeSecretKey(candidate).replace(/_/g, '') === compact);
    if (found && secrets[found] !== undefined && secrets[found] !== null && String(secrets[found]).trim() !== '') return secrets[found];
  }
  if (envName && process.env[envName] !== undefined && String(process.env[envName]).trim() !== '') return process.env[envName];
  return fallback;
}

function firstValue(object, keys) {
  if (!object) return undefined;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && String(object[key]).trim() !== '') return object[key];
    const found = Object.keys(object).find((name) => name.toLowerCase() === String(key).toLowerCase());
    if (found && object[found] !== undefined && object[found] !== null && String(object[found]).trim() !== '') return object[found];
  }
  return undefined;
}

function amountString(amount) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Payment amount must be greater than zero');
  return value.toFixed(2);
}

function absoluteUrl(path, fallbackBase) {
  if (!path) return null;
  if (/^https?:\/\//i.test(String(path))) return String(path);
  const base = String(fallbackBase || process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const suffix = String(path).startsWith('/') ? String(path) : '/' + String(path);
  return base + suffix;
}

function formEncode(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values || {})) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  return params.toString();
}

function parseFormBody(text) {
  const params = new URLSearchParams(String(text || ''));
  const out = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const found = Object.keys(headers).find((key) => key.toLowerCase() === String(name).toLowerCase());
  return found ? headers[found] : null;
}

function normalizePaymentStatus(status) {
  const value = String(status || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (['PAID', 'CONFIRMED', 'SUCCESS', 'SUCCESSFUL', 'SUCCEEDED', 'COMPLETE', 'COMPLETED'].includes(value)) return 'CONFIRMED';
  if (['FAILED', 'CANCELLED', 'CANCELED', 'ERROR', 'DECLINED', 'DISPUTED', 'EXPIRED'].includes(value)) return 'FAILED';
  if (['PENDING', 'CREATED', 'SENT', 'AWAITING_DELIVERY', 'OPENED', 'PROCESSING'].includes(value)) return 'PENDING';
  return value || 'PENDING';
}

module.exports = {
  absoluteUrl,
  amountString,
  configValue,
  firstValue,
  formEncode,
  getHeader,
  lowerSha512,
  normalizePaymentStatus,
  parseFormBody,
  secretValue,
  upperSha512
};
