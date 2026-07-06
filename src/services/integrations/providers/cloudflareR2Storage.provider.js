const crypto = require('crypto');
const { safeError } = require('../../../utils/crypto/redact');

function hashHex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function amzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function endpointFor(config) {
  if (config.endpoint) return String(config.endpoint).replace(/\/$/, '');
  if (config.accountId) return `https://${config.accountId}.r2.cloudflarestorage.com`;
  return null;
}

function publicUrlFor(config, objectKey) {
  const domain = config.publicDomain || config.publicUrl || config.publicEndpoint;
  if (!domain) return null;
  return String(domain).replace(/\/$/, '') + '/' + objectKey.split('/').map(encodeURIComponent).join('/');
}

function signedHeaders({ method, url, body, secrets, region, now = new Date(), extraHeaders = {} }) {
  const parsed = new URL(url);
  const { amzDate, dateStamp } = amzDates(now);
  const payloadHash = hashHex(body || Buffer.alloc(0));
  const headers = {
    host: parsed.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders
  };
  const signedHeaderNames = Object.keys(headers).map((key) => key.toLowerCase()).sort();
  const canonicalHeaders = signedHeaderNames.map((key) => `${key}:${String(headers[key]).trim()}\n`).join('');
  const canonicalRequest = [
    method,
    parsed.pathname.split('/').map((part) => encodeURIComponent(decodeURIComponent(part))).join('/'),
    parsed.searchParams.toString(),
    canonicalHeaders,
    signedHeaderNames.join(';'),
    payloadHash
  ].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hashHex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secrets.secretAccessKey, dateStamp), region), 's3'), 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${secrets.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`
  };
}

function objectUrl(connection, objectKey) {
  const config = connection.config || {};
  const endpoint = endpointFor(config);
  if (!endpoint || !config.bucket) throw new Error('R2 endpoint and bucket are required');
  return `${endpoint}/${encodeURIComponent(config.bucket)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
}

async function uploadR2Object({ connection, secrets, objectKey, body, mimeType }) {
  if (!secrets.accessKeyId || !secrets.secretAccessKey) throw new Error('R2 credentials are not configured');
  const config = connection.config || {};
  const region = config.region || 'auto';
  const url = objectUrl(connection, objectKey);
  if (process.env.NODE_ENV === 'test' && process.env.R2_TEST_REAL_UPLOAD !== 'true') {
    return { bucket: config.bucket, objectKey, safeUrl: publicUrlFor(config, objectKey), checksum: hashHex(body || Buffer.alloc(0)) };
  }
  if (typeof fetch !== 'function') throw new Error('Fetch API is unavailable for R2 uploads');
  const headers = signedHeaders({ method: 'PUT', url, body, secrets, region, extraHeaders: { 'content-type': mimeType || 'application/octet-stream' } });
  const response = await fetch(url, { method: 'PUT', headers, body });
  if (!response.ok) throw new Error(`R2 upload returned HTTP ${response.status}`);
  return { bucket: config.bucket, objectKey, safeUrl: publicUrlFor(config, objectKey), checksum: hashHex(body || Buffer.alloc(0)) };
}

async function deleteR2Object({ connection, secrets, objectKey }) {
  if (!secrets.accessKeyId || !secrets.secretAccessKey) throw new Error('R2 credentials are not configured');
  const config = connection.config || {};
  const region = config.region || 'auto';
  const url = objectUrl(connection, objectKey);
  if (process.env.NODE_ENV === 'test' && process.env.R2_TEST_REAL_UPLOAD !== 'true') return { deleted: true };
  if (typeof fetch !== 'function') throw new Error('Fetch API is unavailable for R2 deletes');
  const response = await fetch(url, { method: 'DELETE', headers: signedHeaders({ method: 'DELETE', url, body: Buffer.alloc(0), secrets, region }) });
  if (!response.ok && response.status !== 404) throw new Error(`R2 delete returned HTTP ${response.status}`);
  return { deleted: true };
}

async function fetchR2Object({ connection, secrets, objectKey }) {
  const config = connection.config || {};
  const region = config.region || 'auto';
  const url = objectUrl(connection, objectKey);
  if (typeof fetch !== 'function') throw new Error('Fetch API is unavailable for R2 downloads');
  const response = await fetch(url, { method: 'GET', headers: signedHeaders({ method: 'GET', url, body: Buffer.alloc(0), secrets, region }) });
  if (!response.ok) throw new Error(`R2 download returned HTTP ${response.status}`);
  return response;
}

async function testCloudflareR2({ connection, secrets }) {
  const config = connection.config || {};
  if (!config.bucket) return { ok: false, error: 'R2 bucket is required' };
  if (!secrets.accessKeyId || !secrets.secretAccessKey) return { ok: false, error: 'R2 access key ID and secret access key are required' };
  if (process.env.NODE_ENV === 'test' && process.env.R2_TEST_REAL_UPLOAD !== 'true') {
    return { ok: true, status: 'CONFIGURED', verified: false, message: 'R2 credentials are configured; real upload verification is disabled in tests.' };
  }
  try {
    const key = `fieldcore-r2-test-${Date.now()}-${crypto.randomUUID()}.txt`;
    await uploadR2Object({ connection, secrets, objectKey: key, body: Buffer.from('fieldcore'), mimeType: 'text/plain' });
    await deleteR2Object({ connection, secrets, objectKey: key });
    return { ok: true, status: 'ACTIVE' };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

module.exports = { deleteR2Object, fetchR2Object, publicUrlFor, testCloudflareR2, uploadR2Object };
