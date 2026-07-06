const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function masterKey() {
  const encoded = process.env.INTEGRATION_SECRET_MASTER_KEY_BASE64;
  if (!encoded && process.env.NODE_ENV === 'test') return crypto.createHash('sha256').update('fieldcore-test-integration-secret-key').digest();
  if (!encoded) throw new Error('Integration secret master key is not configured');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Integration secret master key must decode to 32 bytes');
  return key;
}

function keyVersion() {
  return process.env.INTEGRATION_SECRET_KEY_VERSION || 'v1';
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: keyVersion()
  };
}

function decryptSecret(secret) {
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey(), Buffer.from(secret.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(secret.encryptedValue, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

module.exports = { decryptSecret, encryptSecret };
