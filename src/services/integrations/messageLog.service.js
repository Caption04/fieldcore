const { prisma } = require('../../db');
const { hashLookup, maskRecipient, safeError } = require('../../utils/crypto/redact');

function relatedIds(input = {}) {
  return {
    bookingId: input.bookingId || (input.relatedType === 'BookingRequest' ? input.relatedId : null),
    jobId: input.jobId || (input.relatedType === 'Job' ? input.relatedId : null),
    customerId: input.customerId || null,
    invoiceId: input.invoiceId || (input.relatedType === 'Invoice' ? input.relatedId : null),
    notificationLogId: input.notificationLogId || null
  };
}

async function createMessageLog(input) {
  const now = new Date();
  return prisma.messageLog.create({
    data: {
      companyId: input.companyId,
      integrationConnectionId: input.integrationConnectionId || null,
      provider: input.provider,
      channel: input.channel,
      direction: input.direction || 'OUTBOUND',
      status: input.status || 'QUEUED',
      ...relatedIds(input),
      recipientMasked: maskRecipient(input.recipient),
      recipientHash: hashLookup(input.recipient),
      senderMasked: maskRecipient(input.sender),
      templateName: input.templateName || null,
      metadata: input.metadata || undefined,
      queuedAt: input.status === 'QUEUED' || !input.status ? now : null,
      sentAt: input.status === 'SENT' ? now : null,
      failedAt: input.status === 'FAILED' ? now : null
    }
  });
}

async function updateMessageLog(id, status, result = {}) {
  const now = new Date();
  return prisma.messageLog.update({
    where: { id },
    data: {
      status,
      providerMessageId: result.providerMessageId || undefined,
      providerStatus: result.providerStatus || status,
      errorCode: result.errorCode || undefined,
      errorMessageSanitized: result.error ? safeError(result.error) : undefined,
      sentAt: status === 'SENT' ? now : undefined,
      deliveredAt: status === 'DELIVERED' ? now : undefined,
      readAt: status === 'READ' ? now : undefined,
      failedAt: status === 'FAILED' ? now : undefined
    }
  });
}

module.exports = { createMessageLog, updateMessageLog };
