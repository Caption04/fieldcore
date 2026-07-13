const crypto = require('crypto');
const net = require('node:net');
const { Prisma } = require('@prisma/client');

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
  let value;
  try {
    value = amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount == null || amount === '' ? 0 : amount);
  } catch {
    throw new Error('Payment amount is invalid');
  }
  if (!value.isFinite() || !value.greaterThan(0)) throw new Error('Payment amount must be greater than zero');
  return value.toDecimalPlaces(2).toFixed(2);
}

function privateOrLocalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const family = net.isIP(host);
  if (!family) return false;
  if (family === 6) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  const parts = host.split('.').map(Number);
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function providerBaseUrl(base, options = {}) {
  let value = String(base || '').trim();
  if (!value && options.allowTestFallback) value = 'https://fieldcore.test';
  if (!value) throw new Error('Public payment address is not configured');
  let url;
  try { url = new URL(value); } catch { throw new Error('Public payment address is invalid'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || privateOrLocalHost(url.hostname)) {
    throw new Error('Public payment address must use a safe HTTPS address');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  url.search = '';
  return url;
}

function absoluteUrl(path, fallbackBase, options = {}) {
  if (!path) return null;
  if (/^https?:\/\//i.test(String(path))) return String(path);
  const baseInput = fallbackBase === undefined ? process.env.APP_BASE_URL : fallbackBase;
  const base = providerBaseUrl(baseInput, options);
  const suffix = String(path).startsWith('/') ? String(path) : '/' + String(path);
  return base.toString().replace(/\/+$/, '') + suffix;
}

function formEncode(values) {
  const params = new URLSearchParams();
  const entries = Array.isArray(values) ? values : Object.entries(values || {});
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  return params.toString();
}

function parseFormPairs(text) {
  const params = new URLSearchParams(String(text || ''));
  const pairs = [];
  const seen = new Set();
  for (const [key, value] of params.entries()) {
    const normalized = String(key).toLowerCase();
    if (seen.has(normalized)) throw new Error('Payment response contains duplicate fields');
    seen.add(normalized);
    pairs.push([key, value]);
  }
  return pairs;
}

function pairsToObject(pairs) {
  return Object.fromEntries(pairs || []);
}

function parseFormBody(text) {
  return pairsToObject(parseFormPairs(text));
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
  if (value === 'DISPUTED') return 'DISPUTED';
  if (value === 'REFUNDED') return 'REFUNDED';
  if (['FAILED', 'CANCELLED', 'CANCELED', 'ERROR', 'DECLINED', 'EXPIRED'].includes(value)) return 'FAILED';
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
  pairsToObject,
  parseFormBody,
  parseFormPairs,
  privateOrLocalHost,
  providerBaseUrl,
  secretValue,
  upperSha512
};
