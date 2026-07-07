function getPrisma() {
  return require('../../db').prisma;
}
const { decryptSecret, encryptSecret } = require('../../utils/crypto/encryptSecret');

const TOKEN_KEY_MAP = {
  accessToken: 'ACCESS_TOKEN',
  refreshToken: 'REFRESH_TOKEN',
  idToken: 'ID_TOKEN',
  apiKey: 'API_KEY',
  clientSecret: 'CLIENT_SECRET'
};

function normalizeTokenType(key) {
  return TOKEN_KEY_MAP[key] || String(key || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

async function saveFinanceTokens(integration, tokens = {}) {
  const prisma = getPrisma();
  if (!integration || !integration.id || !integration.companyId) throw new Error('Finance integration is required');
  const entries = Object.entries(tokens || {}).filter(([, value]) => value !== undefined && value !== null && String(value) !== '');
  let saved = 0;

  for (const [key, value] of entries) {
    const encrypted = encryptSecret(String(value));
    const secretType = normalizeTokenType(key);

    // Use delete + create instead of upsert so the lightweight test Prisma mock
    // and real Prisma both persist exactly one encrypted row per token type.
    await prisma.financeIntegrationSecret.deleteMany({
      where: { integrationId: integration.id, secretType }
    });

    await prisma.financeIntegrationSecret.create({
      data: {
        companyId: integration.companyId,
        integrationId: integration.id,
        secretType,
        ...encrypted
      }
    });
    saved += 1;
  }

  return saved;
}

async function readFinanceTokens(integration) {
  const prisma = getPrisma();
  if (!integration || !integration.id || !integration.companyId) return {};
  const secrets = await prisma.financeIntegrationSecret.findMany({ where: { companyId: integration.companyId, integrationId: integration.id } });
  const tokens = {};
  for (const secret of secrets) {
    try {
      tokens[secret.secretType] = decryptSecret(secret);
    } catch (error) {
      tokens[secret.secretType] = null;
    }
  }
  return tokens;
}

async function clearFinanceTokens(integration) {
  const prisma = getPrisma();
  if (!integration || !integration.id || !integration.companyId) return 0;
  const result = await prisma.financeIntegrationSecret.deleteMany({ where: { companyId: integration.companyId, integrationId: integration.id } });
  return result.count || 0;
}

module.exports = { clearFinanceTokens, readFinanceTokens, saveFinanceTokens };
