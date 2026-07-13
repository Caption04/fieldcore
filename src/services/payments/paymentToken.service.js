function getPrisma() { return require('../../db').prisma; }
const { decryptSecret, encryptSecret } = require('../../utils/crypto/encryptSecret');

function normalizeKey(key) { return String(key || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'); }

const REQUIRED_PAYMENT_PROVIDER_SECRETS = Object.freeze({
  PAYNOW: ['INTEGRATIONID', 'INTEGRATIONKEY'],
  OZOW: ['SITECODE', 'APIKEY', 'PRIVATEKEY']
});

function requiredPaymentProviderSecretKeys(provider) {
  return REQUIRED_PAYMENT_PROVIDER_SECRETS[String(provider || '').toUpperCase()] || [];
}

function completePaymentProviderSecrets(provider, secrets = {}) {
  const normalized = Object.fromEntries(Object.entries(secrets || {}).map(([key, value]) => [normalizeKey(key).replace(/_/g, ''), value]));
  const missing = requiredPaymentProviderSecretKeys(provider).filter((key) => !String(normalized[key] || '').trim());
  return { complete: missing.length === 0, missing, values: normalized };
}

function maskSecretValue(value) {
  const text = String(value || '');
  if (!text) return '••••••••';
  const visibleLength = Math.min(4, text.length);
  return `••••••••${text.slice(-visibleLength)}`;
}

function paymentSecretStorageError(error) {
  const message = String(error && error.message || '');
  if (message.includes('Integration secret master key')) {
    const wrapped = new Error('Secure payment key storage is not configured');
    wrapped.code = 'PAYMENT_SECRET_STORAGE_NOT_CONFIGURED';
    return wrapped;
  }
  return error;
}

function credentialMode(provider, env = process.env) {
  const key = String(provider || '').toUpperCase() === 'OZOW' ? 'OZOW_MODE' : 'PAYNOW_MODE';
  return String(env[key] || (env.NODE_ENV === 'production' ? 'live' : 'test')).toLowerCase() === 'live' ? 'live' : 'test';
}

function encryptCredentialBundle(provider, secrets, mode) {
  const state = completePaymentProviderSecrets(provider, secrets);
  if (!state.complete) {
    const error = new Error('Complete provider credentials are required before creating a credential version');
    error.code = 'PAYMENT_CREDENTIALS_INCOMPLETE';
    throw error;
  }
  try {
    return encryptSecret(JSON.stringify({ provider: String(provider || '').toUpperCase(), mode, values: state.values }));
  } catch (error) {
    throw paymentSecretStorageError(error);
  }
}

async function activePaymentProviderCredentialVersion(connection, options = {}) {
  const tx = options.tx || getPrisma();
  if (!connection || !connection.id || !tx.paymentProviderCredentialVersion) return null;
  return tx.paymentProviderCredentialVersion.findFirst({
    where: { companyId: connection.companyId, connectionId: connection.id, retiredAt: null },
    orderBy: { version: 'desc' }
  });
}

async function createPaymentProviderCredentialVersion(tx, connection, fullSecrets, options = {}) {
  if (!tx.paymentProviderCredentialVersion) return null;
  if (typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw`SELECT "id" FROM "PaymentProviderConnection" WHERE "companyId" = ${connection.companyId} AND "id" = ${connection.id} FOR UPDATE`;
  }
  const latest = await tx.paymentProviderCredentialVersion.findFirst({
    where: { companyId: connection.companyId, connectionId: connection.id },
    orderBy: { version: 'desc' }
  });
  const mode = options.mode || credentialMode(connection.provider, options.env || process.env);
  const encrypted = encryptCredentialBundle(connection.provider, fullSecrets, mode);
  await tx.paymentProviderCredentialVersion.updateMany({
    where: { companyId: connection.companyId, connectionId: connection.id, retiredAt: null },
    data: { retiredAt: new Date() }
  });
  return tx.paymentProviderCredentialVersion.create({
    data: {
      companyId: connection.companyId,
      connectionId: connection.id,
      version: Number(latest && latest.version || 0) + 1,
      mode,
      ...encrypted
    }
  });
}

async function savePaymentProviderSecrets(connection, secrets = {}, options = {}) {
  const prisma = options.tx || getPrisma();
  const prepared = [];

  for (const [key, value] of Object.entries(secrets || {})) {
    if (value === undefined || value === null || String(value) === '') continue;
    const keyName = normalizeKey(key);
    try {
      prepared.push({ keyName, encrypted: encryptSecret(String(value)) });
    } catch (error) {
      throw paymentSecretStorageError(error);
    }
  }

  const write = async (tx) => {
    for (const { keyName, encrypted } of prepared) {
      await tx.paymentProviderSecret.upsert({
        where: { connectionId_keyName: { connectionId: connection.id, keyName } },
        update: { companyId: connection.companyId, ...encrypted },
        create: { companyId: connection.companyId, connectionId: connection.id, keyName, ...encrypted }
      });
    }
    let credentialVersion = null;
    if (options.createVersion && options.fullSecrets) {
      credentialVersion = await createPaymentProviderCredentialVersion(tx, connection, options.fullSecrets, options);
    }
    return { savedCount: prepared.length, credentialVersion };
  };

  if (options.tx) return write(options.tx);
  if (!prepared.length && !(options.createVersion && options.fullSecrets)) return { savedCount: 0, credentialVersion: null };
  return prisma.$transaction(write);
}

async function paymentProviderSecretSummaries(connection) {
  const prisma = getPrisma();
  if (!connection || !connection.id) return [];
  const rows = await prisma.paymentProviderSecret.findMany({
    where: { companyId: connection.companyId, connectionId: connection.id },
    select: { keyName: true, encryptedValue: true, iv: true, authTag: true, keyVersion: true }
  });
  return rows.map((row) => {
    try {
      return { keyName: row.keyName, maskedValue: maskSecretValue(decryptSecret(row)) };
    } catch {
      return { keyName: row.keyName, maskedValue: '••••••••' };
    }
  });
}

function decryptCredentialVersion(row, connection) {
  if (!row) return null;
  try {
    const parsed = JSON.parse(decryptSecret(row));
    if (String(parsed.provider || '').toUpperCase() !== String(connection.provider || '').toUpperCase()) return null;
    return { values: parsed.values || {}, mode: parsed.mode || row.mode, version: row };
  } catch {
    return null;
  }
}

async function readPaymentProviderCredentialVersion(connection, credentialVersionId, options = {}) {
  const prisma = options.tx || getPrisma();
  if (!connection || !connection.id || !credentialVersionId || !prisma.paymentProviderCredentialVersion) return null;
  const version = await prisma.paymentProviderCredentialVersion.findFirst({
    where: { id: credentialVersionId, companyId: connection.companyId, connectionId: connection.id }
  });
  const decrypted = decryptCredentialVersion(version, connection);
  return decrypted ? { ...decrypted, id: version.id } : null;
}

async function readPaymentProviderSecrets(connection, options = {}) {
  const prisma = options.tx || getPrisma();
  if (!connection || !connection.id) return {};
  if (options.credentialVersionId && prisma.paymentProviderCredentialVersion) {
    const version = await readPaymentProviderCredentialVersion(connection, options.credentialVersionId, { tx: prisma });
    return version ? version.values : {};
  }
  const rows = await prisma.paymentProviderSecret.findMany({ where: { companyId: connection.companyId, connectionId: connection.id } });
  const out = {};
  for (const row of rows) {
    try { out[row.keyName] = decryptSecret(row); } catch { out[row.keyName] = null; }
  }
  return out;
}

async function ensurePaymentProviderCredentialVersion(connection, options = {}) {
  const tx = options.tx || getPrisma();
  const active = await activePaymentProviderCredentialVersion(connection, { tx });
  if (active) return active;
  const secrets = await readPaymentProviderSecrets(connection, { tx });
  const state = completePaymentProviderSecrets(connection.provider, secrets);
  if (!state.complete) return null;
  if (options.tx) return createPaymentProviderCredentialVersion(tx, connection, state.values, options);
  return tx.$transaction((transaction) => createPaymentProviderCredentialVersion(transaction, connection, state.values, options));
}

module.exports = {
  activePaymentProviderCredentialVersion,
  completePaymentProviderSecrets,
  createPaymentProviderCredentialVersion,
  credentialMode,
  ensurePaymentProviderCredentialVersion,
  maskSecretValue,
  normalizeKey,
  paymentProviderSecretSummaries,
  readPaymentProviderCredentialVersion,
  readPaymentProviderSecrets,
  requiredPaymentProviderSecretKeys,
  savePaymentProviderSecrets
};
