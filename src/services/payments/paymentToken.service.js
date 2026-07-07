function getPrisma() { return require('../../db').prisma; }
const { decryptSecret, encryptSecret } = require('../../utils/crypto/encryptSecret');

function normalizeKey(key) { return String(key || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'); }

async function savePaymentProviderSecrets(connection, secrets = {}) {
  const prisma = getPrisma();
  let saved = 0;
  for (const [key, value] of Object.entries(secrets || {})) {
    if (value === undefined || value === null || String(value) === '') continue;
    const keyName = normalizeKey(key);
    await prisma.paymentProviderSecret.deleteMany({ where: { connectionId: connection.id, keyName } });
    await prisma.paymentProviderSecret.create({ data: { companyId: connection.companyId, connectionId: connection.id, keyName, ...encryptSecret(String(value)) } });
    saved += 1;
  }
  return saved;
}

async function readPaymentProviderSecrets(connection) {
  const prisma = getPrisma();
  if (!connection || !connection.id) return {};
  const rows = await prisma.paymentProviderSecret.findMany({ where: { companyId: connection.companyId, connectionId: connection.id } });
  const out = {};
  for (const row of rows) {
    try { out[row.keyName] = decryptSecret(row); } catch { out[row.keyName] = null; }
  }
  return out;
}

module.exports = { readPaymentProviderSecrets, savePaymentProviderSecrets };
