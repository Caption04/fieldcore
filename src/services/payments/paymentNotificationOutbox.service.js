const { notify } = require('../notification.service');

function safeOutboxPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const safe = {};
  for (const key of ['status', 'message', 'invoiceId', 'paymentId', 'paymentLinkId', 'amount', 'currency']) {
    const value = payload[key];
    if (value === undefined || value === null) continue;
    if (value && typeof value.toFixed === 'function' && key === 'amount') safe[key] = value.toFixed(2);
    else if (value && typeof value.toString === 'function' && typeof value === 'object') safe[key] = String(value).slice(0, 160);
    else safe[key] = typeof value === 'string' ? value.slice(0, 160) : value;
  }
  return safe;
}

async function queuePaymentNotification(tx, { companyId, eventKey, eventType, entityType, entityId, payload = null }) {
  if (!tx.paymentNotificationOutbox) return null;
  return tx.paymentNotificationOutbox.upsert({
    where: { companyId_eventKey: { companyId, eventKey } },
    update: {},
    create: { companyId, eventKey, eventType, entityType, entityId, payload: safeOutboxPayload(payload), status: 'PENDING', nextAttemptAt: new Date() }
  });
}

function backoff(attempts) {
  return new Date(Date.now() + Math.min(24 * 60, 2 ** Math.min(attempts, 10)) * 60 * 1000);
}

const STALE_OUTBOX_PROCESSING_MS = 10 * 60 * 1000;

async function processPaymentNotificationOutbox(database, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 25), 1), 100);
  if (!database.paymentNotificationOutbox) return { processed: 0, failed: 0 };
  const staleBefore = new Date(Date.now() - STALE_OUTBOX_PROCESSING_MS);
  const rows = await database.paymentNotificationOutbox.findMany({
    where: {
      OR: [
        { status: { in: ['PENDING', 'FAILED'] }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        { status: 'PROCESSING', updatedAt: { lte: staleBefore } }
      ]
    },
    orderBy: { createdAt: 'asc' },
    take: limit
  });
  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    const claimed = await database.paymentNotificationOutbox.updateMany({
      where: {
        id: row.id,
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'PROCESSING', updatedAt: { lte: staleBefore } }
        ]
      },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lastError: null }
    });
    if (!claimed.count) continue;
    try {
      await notify(row.eventType, { companyId: row.companyId, relatedType: row.entityType, relatedId: row.entityId, context: row.payload || {} });
      await database.paymentNotificationOutbox.update({ where: { id: row.id }, data: { status: 'PROCESSED', processedAt: new Date(), nextAttemptAt: null, lastError: null } });
      processed += 1;
    } catch (error) {
      const current = await database.paymentNotificationOutbox.findUnique({ where: { id: row.id } });
      await database.paymentNotificationOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', nextAttemptAt: backoff(Number(current && current.attempts || 1)), lastError: String(error && error.message || error).replace(/[\r\n\t]+/g, ' ').slice(0, 200) } });
      failed += 1;
    }
  }
  return { processed, failed };
}

module.exports = { STALE_OUTBOX_PROCESSING_MS, processPaymentNotificationOutbox, queuePaymentNotification, safeOutboxPayload };
