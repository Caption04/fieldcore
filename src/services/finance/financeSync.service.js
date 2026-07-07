function getPrisma() {
  return require('../../db').prisma;
}
const { redactObject, safeError } = require('../../utils/crypto/redact');
const { getFinanceMapping } = require('./financeMapping.service');
const { readFinanceTokens } = require('./financeToken.service');
const { createFinanceProvider } = require('./providers');

function safeFinanceSyncLog(log) {
  if (!log) return log;
  return {
    id: log.id,
    companyId: log.companyId,
    integrationId: log.integrationId || null,
    provider: log.provider,
    localType: log.localType,
    localId: log.localId,
    status: log.status,
    operation: log.operation,
    externalId: log.externalId || null,
    attempt: log.attempt || 1,
    errorCode: log.errorCode || null,
    errorMessage: log.errorMessage || null,
    metadata: redactObject(log.metadata || {}),
    createdById: log.createdById || null,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt
  };
}

async function testFinanceIntegration(integration) {
  const mapping = await getFinanceMapping(integration.companyId, integration.provider);
  const tokens = await readFinanceTokens(integration);
  const provider = createFinanceProvider(integration.provider, { integration, tokens, mapping });
  const result = await provider.testConnection();
  const prisma = getPrisma();
  await prisma.financeIntegration.update({ where: { id: integration.id }, data: { lastTestAt: new Date(), lastError: null, status: result.ok ? integration.status : 'ERROR' } });
  return result;
}

async function createSyncLog({ integration, localType, localId, status, operation, externalId, errorCode, errorMessage, metadata, req }) {
  const prisma = getPrisma();
  return prisma.financeSyncLog.create({
    data: {
      companyId: integration.companyId,
      integrationId: integration.id,
      provider: integration.provider,
      localType,
      localId,
      status,
      operation,
      externalId: externalId || null,
      errorCode: errorCode || null,
      errorMessage: errorMessage ? safeError(errorMessage) : null,
      metadata: redactObject(metadata || {}),
      createdById: req && req.user && req.user.id || null
    }
  });
}

async function syncFinanceRecord({ integration, localType, record, req }) {
  if (!integration || integration.status !== 'ACTIVE') {
    const error = new Error('Finance integration is not connected');
    error.code = 'NOT_CONNECTED';
    throw error;
  }

  const prisma = getPrisma();
  const existing = await prisma.externalRecordLink.findUnique({
    where: { companyId_provider_localType_localId: { companyId: integration.companyId, provider: integration.provider, localType, localId: record.id } }
  });
  if (existing) {
    const log = await createSyncLog({ integration, localType, localId: record.id, status: 'SKIPPED', operation: 'SYNC', externalId: existing.externalId, metadata: { reason: 'already_synced' }, req });
    return { skipped: true, link: existing, log: safeFinanceSyncLog(log) };
  }

  const mapping = await getFinanceMapping(integration.companyId, integration.provider);
  const tokens = await readFinanceTokens(integration);
  const provider = createFinanceProvider(integration.provider, { integration, tokens, mapping });

  try {
    const result = localType === 'PAYMENT' ? await provider.syncPayment(record) : await provider.syncInvoice(record);
    const link = await prisma.externalRecordLink.upsert({
      where: { companyId_provider_localType_localId: { companyId: integration.companyId, provider: integration.provider, localType, localId: record.id } },
      update: { externalId: result.externalId, lastSyncedAt: new Date() },
      create: { companyId: integration.companyId, provider: integration.provider, localType, localId: record.id, externalId: result.externalId, lastSyncedAt: new Date() }
    });
    const log = await createSyncLog({ integration, localType, localId: record.id, status: 'COMPLETED', operation: 'SYNC', externalId: result.externalId, metadata: result.providerResponse || {}, req });
    await prisma.financeIntegration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), lastError: null } });
    return { skipped: false, link, log: safeFinanceSyncLog(log), providerResponse: redactObject(result.providerResponse || {}) };
  } catch (error) {
    const log = await createSyncLog({ integration, localType, localId: record.id, status: 'FAILED', operation: 'SYNC', errorCode: error.code || 'SYNC_FAILED', errorMessage: error.message, metadata: { provider: integration.provider }, req });
    try {
      await prisma.financeIntegration.update({ where: { id: integration.id }, data: { lastError: safeError(error), status: integration.status } });
    } catch (updateError) {
      // Do not let a status-update failure hide the provider failure or the sync log.
    }
    error.syncLog = safeFinanceSyncLog(log);
    throw error;
  }
}

module.exports = { safeFinanceSyncLog, syncFinanceRecord, testFinanceIntegration };
