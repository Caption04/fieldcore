const { prisma } = require('../../db');
const { decryptSecret, encryptSecret } = require('../../utils/crypto/encryptSecret');
const { providerDefinition } = require('./integrationRegistry');

async function saveSecrets({ companyId, integrationConnectionId, provider, secrets = {}, tx = prisma }) {
  const allowed = new Set(providerDefinition(provider).secrets);
  const entries = Object.entries(secrets || {}).filter(([key, value]) => allowed.has(key) && String(value || '').trim());
  for (const [keyName, value] of entries) {
    const encrypted = encryptSecret(value);
    await tx.integrationSecret.upsert({
      where: { integrationConnectionId_keyName: { integrationConnectionId, keyName } },
      update: encrypted,
      create: { companyId, integrationConnectionId, keyName, ...encrypted }
    });
  }
}

async function loadSecrets(companyId, integrationConnectionId) {
  const rows = await prisma.integrationSecret.findMany({ where: { companyId, integrationConnectionId } });
  return Object.fromEntries(rows.map((secret) => [secret.keyName, decryptSecret(secret)]));
}

module.exports = { loadSecrets, saveSecrets };
