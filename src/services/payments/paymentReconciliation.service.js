const crypto = require('crypto');
const { createPaymentProvider } = require('./paymentProviderRegistry');
const { applyPaymentProviderUpdate } = require('./paymentProviderUpdate.service');
const { normalizedProviderState, STATES } = require('./paymentStateMachine.service');

const ACTIVE_LINK_STATUSES = ['CREATED', 'SENT', 'OPENED', 'PENDING'];
const MAX_STATUS_ATTEMPTS = 10;
const STALE_PROCESSING_MS = 10 * 60 * 1000;

function retryAt(attempts) {
  const minutes = Math.min(24 * 60, Math.max(1, 2 ** Math.min(Number(attempts || 0), 10)));
  return new Date(Date.now() + minutes * 60 * 1000);
}

function safeErrorCode(error) {
  const explicit = String(error && error.code || '').replace(/[^A-Z0-9_:-]/gi, '').slice(0, 64);
  if (explicit) return explicit;
  const message = String(error && error.message || '').toLowerCase();
  if (message.includes('timeout')) return 'PROVIDER_TIMEOUT';
  if (message.includes('not available')) return 'STATUS_NOT_AVAILABLE';
  if (message.includes('not accept')) return 'CREDENTIALS_REJECTED';
  return 'PROVIDER_CHECK_FAILED';
}

function reconciliationEventId(link, parsed) {
  if (parsed && parsed.eventId) return String(parsed.eventId);
  const status = String(parsed && (parsed.providerStatus || parsed.status) || 'PENDING').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const identity = parsed && parsed.providerPaymentId || link.providerPaymentId || link.reference;
  return `${link.provider}:${identity}:${status}:RECONCILE`;
}

async function markPending(database, link, parsed, attempts) {
  const providerStatus = String(parsed && (parsed.providerStatus || parsed.status) || 'PENDING').toUpperCase();
  return database.paymentLink.update({
    where: { id: link.id },
    data: {
      providerPaymentId: parsed && parsed.providerPaymentId || link.providerPaymentId,
      pollUrl: parsed && parsed.pollUrl || link.pollUrl,
      providerStatus,
      providerStatusMessage: parsed && parsed.providerStatusMessage || 'We are still checking this payment',
      lastProviderVerifiedAt: parsed && parsed.verifiedAt || link.lastProviderVerifiedAt,
      lastStatusCheckAt: new Date(),
      statusCheckAttempts: attempts,
      nextStatusCheckAt: retryAt(attempts),
      lastStatusCheckErrorCode: null,
      reconciliationState: 'PENDING'
    }
  });
}

async function reconcilePaymentLink(database, paymentLinkId, options = {}) {
  const link = await database.paymentLink.findUnique({
    where: { id: paymentLinkId },
    include: { providerConnection: true }
  });
  if (!link || !link.providerConnection) return { checked: false, reason: 'not_found' };
  if (!ACTIVE_LINK_STATUSES.includes(link.status)) return { checked: false, reason: 'terminal', link };
  if (!options.force && link.nextStatusCheckAt && new Date(link.nextStatusCheckAt) > new Date()) return { checked: false, reason: 'cooldown', link };

  const attempts = Number(link.statusCheckAttempts || 0) + 1;
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const claim = await database.paymentLink.updateMany({
    where: {
      id: link.id,
      status: { in: ACTIVE_LINK_STATUSES },
      OR: [
        { reconciliationState: null },
        { reconciliationState: { not: 'PROCESSING' } },
        { reconciliationState: 'PROCESSING', updatedAt: { lte: staleBefore } }
      ]
    },
    data: { reconciliationState: 'PROCESSING', lastStatusCheckAt: new Date(), statusCheckAttempts: attempts, nextStatusCheckAt: retryAt(attempts) }
  });
  if (!claim.count) return { checked: false, reason: 'already_processing', link };

  try {
    const provider = createPaymentProvider(link.provider, { connection: link.providerConnection, credentialVersionId: link.credentialVersionId || null });
    let parsed;

    if (link.provider === 'PAYNOW' && !link.pollUrl && link.merchantTrace && typeof provider.recoverByMerchantTrace === 'function') {
      const recovered = await provider.recoverByMerchantTrace(link.merchantTrace);
      if (!recovered || recovered.found !== true) {
        await markPending(database, link, recovered || { providerStatus: 'PENDING' }, attempts);
        return { checked: true, pending: true, recovered: false };
      }
      parsed = recovered;
    } else {
      parsed = await provider.getPaymentStatus(link);
    }

    const state = normalizedProviderState(link.provider, parsed.providerStatus || parsed.status);
    if ([STATES.PENDING, STATES.NEEDS_RECONCILIATION].includes(state)) {
      await markPending(database, link, parsed, attempts);
      return { checked: true, pending: true, parsed };
    }

    const eventId = reconciliationEventId(link, parsed);
    const result = await applyPaymentProviderUpdate({
      database,
      connection: link.providerConnection,
      parsed: { ...parsed, reference: parsed.reference || link.reference, eventId },
      raw: { source: 'background-reconciliation', reference: link.reference, status: parsed.providerStatus || parsed.status },
      eventId,
      signatureValid: true
    });
    await database.paymentLink.update({ where: { id: link.id }, data: { reconciliationState: 'RESOLVED', nextStatusCheckAt: null, lastStatusCheckErrorCode: null, lastStatusCheckAt: new Date() } });
    return { checked: true, pending: false, result };
  } catch (error) {
    const code = safeErrorCode(error);
    const exhausted = attempts >= MAX_STATUS_ATTEMPTS;
    await database.paymentLink.update({
      where: { id: link.id },
      data: {
        reconciliationState: exhausted ? 'NEEDS_REVIEW' : 'PENDING',
        nextStatusCheckAt: exhausted ? null : retryAt(attempts),
        lastStatusCheckAt: new Date(),
        lastStatusCheckErrorCode: code,
        providerStatusMessage: exhausted ? 'Payment needs review' : 'We are still checking this payment'
      }
    });
    if (code === 'OZOW_UNAUTHORIZED' || code === 'CREDENTIALS_REJECTED') {
      let affectsCurrentCredentials = !link.credentialVersionId;
      if (link.credentialVersionId && database.paymentProviderCredentialVersion) {
        const active = await database.paymentProviderCredentialVersion.findFirst({ where: { companyId: link.companyId, connectionId: link.providerConnection.id, retiredAt: null }, orderBy: { version: 'desc' } });
        affectsCurrentCredentials = Boolean(active && active.id === link.credentialVersionId);
      }
      if (affectsCurrentCredentials) {
        await database.paymentProviderConnection.update({ where: { id: link.providerConnection.id }, data: { status: 'ERROR', lastTestStatus: 'FAILED', lastTestError: 'The payment provider did not accept the saved details.', lastTestedAt: new Date() } });
      }
    }
    if (options.throwOnError) throw error;
    return { checked: true, pending: !exhausted, errorCode: code };
  }
}

async function reconcileDuePaymentLinks(database, options = {}) {
  const take = Math.min(Math.max(Number(options.limit || 20), 1), 100);
  const rows = await database.paymentLink.findMany({
    where: {
      status: { in: ACTIVE_LINK_STATUSES },
      providerConnectionId: { not: null },
      AND: [
        { OR: [{ nextStatusCheckAt: null }, { nextStatusCheckAt: { lte: new Date() } }] },
        { OR: [
          { provider: 'PAYNOW', merchantTrace: { not: null } },
          { submittedAt: { not: null } },
          { providerPaymentId: { not: null } },
          { pollUrl: { not: null } }
        ] }
      ]
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take
  });
  const summary = { checked: 0, resolved: 0, pending: 0, failed: 0 };
  for (const row of rows) {
    const result = await reconcilePaymentLink(database, row.id);
    if (!result.checked) continue;
    summary.checked += 1;
    if (result.result) summary.resolved += 1;
    else if (result.errorCode) summary.failed += 1;
    else summary.pending += 1;
  }
  return summary;
}

module.exports = {
  ACTIVE_LINK_STATUSES,
  MAX_STATUS_ATTEMPTS,
  STALE_PROCESSING_MS,
  reconcileDuePaymentLinks,
  reconcilePaymentLink,
  reconciliationEventId,
  retryAt,
  safeErrorCode
};
