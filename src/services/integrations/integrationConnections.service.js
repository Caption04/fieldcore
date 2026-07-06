const { prisma } = require('../../db');
const { AppError, notFound } = require('../../errors');
const { safeError } = require('../../utils/crypto/redact');
const { configuredSecretKeys, providerDefinition, sanitizeConfig } = require('./integrationRegistry');
const { loadSecrets, saveSecrets } = require('./integrationSecrets.service');
const { createMessageLog, updateMessageLog } = require('./messageLog.service');
const { sendBrevoEmail, testBrevo } = require('./providers/brevoEmail.provider');
const { sendMetaWhatsApp, testMetaWhatsApp } = require('./providers/metaWhatsApp.provider');
const { sendClickatellSms, testClickatell } = require('./providers/clickatellSms.provider');
const { sendAfricasTalkingSms, testAfricasTalking } = require('./providers/africasTalkingSms.provider');
const { testCloudflareR2 } = require('./providers/cloudflareR2Storage.provider');

const providerTests = {
  BREVO: testBrevo,
  META_WHATSAPP_CLOUD: testMetaWhatsApp,
  CLICKATELL: testClickatell,
  AFRICAS_TALKING: testAfricasTalking,
  CLOUDFLARE_R2: testCloudflareR2
};

function safeConnection(connection) {
  const secretKeys = configuredSecretKeys(connection.provider, connection.secrets || []);
  return {
    id: connection.id,
    companyId: connection.companyId,
    provider: connection.provider,
    channel: connection.channel,
    displayName: connection.displayName,
    status: connection.status,
    configured: secretKeys.length > 0,
    configuredSecrets: secretKeys,
    config: connection.config || {},
    lastTestedAt: connection.lastTestedAt,
    lastTestStatus: connection.lastTestStatus,
    lastTestError: connection.lastTestError,
    lastUsedAt: connection.lastUsedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  };
}

function includeSecrets(args = {}) {
  return { ...args, include: { secrets: { select: { keyName: true } } } };
}

async function listIntegrationConnections(companyId) {
  const rows = await prisma.integrationConnection.findMany(includeSecrets({ where: { companyId }, orderBy: { createdAt: 'desc' } }));
  return rows.map(safeConnection);
}

async function getIntegrationConnection(companyId, id) {
  const record = await prisma.integrationConnection.findFirst(includeSecrets({ where: { id, companyId } }));
  if (!record) throw notFound('Integration not found');
  return record;
}

async function saveIntegrationConnection({ companyId, userId, provider, displayName, config, secrets, id }) {
  const definition = providerDefinition(provider);
  const safeConfig = sanitizeConfig(provider, config);
  const data = await prisma.$transaction(async (tx) => {
    const existing = id ? null : await tx.integrationConnection.findFirst({ where: { companyId, provider } });
    const connection = id
      ? await tx.integrationConnection.update({
        where: { id },
        data: { displayName, config: safeConfig, updatedById: userId, status: 'CONFIGURED' }
      })
      : existing
        ? await tx.integrationConnection.update({
          where: { id: existing.id },
          data: { displayName, config: safeConfig, updatedById: userId, status: existing.status === 'DISABLED' ? 'CONFIGURED' : existing.status }
        })
      : await tx.integrationConnection.create({
        data: { companyId, provider, channel: definition.channel, displayName, config: safeConfig, createdById: userId, updatedById: userId, status: 'CONFIGURED' }
      });
    if (connection.companyId !== companyId) throw notFound('Integration not found');
    await saveSecrets({ companyId, integrationConnectionId: connection.id, provider, secrets, tx });
    return connection;
  });
  return safeConnection(await getIntegrationConnection(companyId, data.id));
}

async function updateIntegrationConnection({ companyId, userId, id, displayName, config, secrets }) {
  const existing = await getIntegrationConnection(companyId, id);
  return saveIntegrationConnection({ companyId, userId, id, provider: existing.provider, displayName, config: config || existing.config || {}, secrets });
}

async function disableIntegrationConnection(companyId, id) {
  await getIntegrationConnection(companyId, id);
  const data = await prisma.integrationConnection.update({ where: { id }, data: { status: 'DISABLED' }, include: { secrets: { select: { keyName: true } } } });
  return safeConnection(data);
}

async function testIntegrationConnection(companyId, id) {
  const connection = await prisma.integrationConnection.findFirst({ where: { id, companyId }, include: { secrets: { select: { keyName: true } } } });
  if (!connection) throw notFound('Integration not found');
  const secrets = await loadSecrets(companyId, id);
  const tester = providerTests[connection.provider];
  if (!tester) throw new AppError(400, 'Provider test is not implemented');
  const result = await tester({ connection, secrets });
  const status = result.ok ? result.status || 'ACTIVE' : 'ERROR';
  const data = await prisma.integrationConnection.update({
    where: { id },
    data: { status, lastTestedAt: new Date(), lastTestStatus: status, lastTestError: result.ok ? null : safeError(result.error) },
    include: { secrets: { select: { keyName: true } } }
  });
  return { ...safeConnection(data), test: { ok: Boolean(result.ok), status, error: result.ok ? null : safeError(result.error) } };
}

async function resolveActiveConnection(companyId, channel, provider) {
  const where = { companyId, channel, status: { in: ['ACTIVE', 'CONFIGURED'] }, ...(provider ? { provider } : {}) };
  const connection = await prisma.integrationConnection.findFirst({ where, include: { secrets: { select: { keyName: true } } }, orderBy: { updatedAt: 'desc' } });
  if (!connection) return null;
  return connection;
}

async function sendViaIntegration({ companyId, channel, provider, message, relatedType, relatedId, customerId, invoiceId, jobId, bookingId, notificationLogId }) {
  const connection = await resolveActiveConnection(companyId, channel, provider);
  if (!connection) return { status: 'SKIPPED', error: `${channel} integration is not configured` };
  const secrets = await loadSecrets(companyId, connection.id);
  const log = await createMessageLog({
    companyId,
    integrationConnectionId: connection.id,
    provider: connection.provider,
    channel,
    recipient: message.to,
    sender: connection.config && (connection.config.senderEmail || connection.config.senderId || connection.config.businessPhoneDisplayNumber),
    templateName: message.templateName,
    relatedType,
    relatedId,
    customerId,
    invoiceId,
    jobId,
    bookingId,
    notificationLogId
  });
  let result;
  try {
    if (connection.provider === 'BREVO') result = await sendBrevoEmail({ connection, secrets, message });
    else if (connection.provider === 'META_WHATSAPP_CLOUD') result = await sendMetaWhatsApp({ connection, secrets, message });
    else if (connection.provider === 'CLICKATELL') result = await sendClickatellSms({ connection, secrets, message });
    else if (connection.provider === 'AFRICAS_TALKING') result = await sendAfricasTalkingSms({ connection, secrets, message });
    else result = { status: 'FAILED', error: 'Provider sending is not implemented' };
  } catch (error) {
    result = { status: 'FAILED', error: safeError(error) };
  }
  const status = result.status === 'SENT' ? 'SENT' : 'FAILED';
  await updateMessageLog(log.id, status, result);
  await prisma.integrationConnection.update({ where: { id: connection.id }, data: { lastUsedAt: new Date() } });
  return result;
}

module.exports = {
  disableIntegrationConnection,
  getIntegrationConnection,
  listIntegrationConnections,
  resolveActiveConnection,
  safeConnection,
  saveIntegrationConnection,
  sendViaIntegration,
  testIntegrationConnection,
  updateIntegrationConnection
};
