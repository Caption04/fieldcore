function getPrisma() {
  return require('../db').prisma;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONEY_ZERO = 0;

function number(value) {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value || 0);
}

function date(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function iso(value) {
  const parsed = date(value);
  return parsed ? parsed.toISOString() : null;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function daysBetween(start, end) {
  const first = date(start);
  const second = date(end);
  if (!first || !second || second < first) return null;
  return Math.round(((second - first) / DAY_MS) * 10) / 10;
}

function parseDateOnly(value, label, fallback) {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw Object.assign(new Error(`${label} must use YYYY-MM-DD.`), { status: 400 });
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw Object.assign(new Error(`${label} is invalid.`), { status: 400 });
  return parsed;
}

function rangeFromQuery(query = {}) {
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - 29);
  defaultStart.setHours(0, 0, 0, 0);
  const defaultEnd = new Date(now);
  defaultEnd.setHours(23, 59, 59, 999);

  const start = parseDateOnly(query.startDate, 'startDate', defaultStart);
  const end = parseDateOnly(query.endDate, 'endDate', defaultEnd);
  end.setHours(23, 59, 59, 999);
  if (start > end) throw Object.assign(new Error('startDate must be before or equal to endDate.'), { status: 400 });
  return { start, end };
}

function inRange(value, range) {
  const parsed = date(value);
  return Boolean(parsed && parsed >= range.start && parsed <= range.end);
}

function withinBranch(record, branchIds) {
  if (!branchIds || !branchIds.length) return true;
  return branchIds.includes(record.branchId || null);
}

function invoiceBalance(invoice) {
  return number(invoice.balanceDue != null ? invoice.balanceDue : invoice.total || invoice.amount);
}

function invoiceTotal(invoice) {
  return number(invoice.total || invoice.amount);
}

function paymentDate(payment) {
  return payment.receivedAt || payment.confirmedAt || payment.createdAt;
}

function jobCompletedDate(job) {
  return job.completedAt || job.updatedAt || job.createdAt;
}

function isConfirmedPayment(payment) {
  return String(payment.status || '').toUpperCase() === 'CONFIRMED';
}

function isPaidInvoice(invoice) {
  return String(invoice.status || '').toUpperCase() === 'PAID';
}

function isVoidInvoice(invoice) {
  return String(invoice.status || '').toUpperCase() === 'VOID';
}

function isOutstandingInvoice(invoice) {
  return !isPaidInvoice(invoice) && !isVoidInvoice(invoice) && invoiceBalance(invoice) > 0;
}

function isOverdueInvoice(invoice, now = new Date()) {
  const due = date(invoice.dueDate);
  return isOutstandingInvoice(invoice) && due && due < now;
}

function proofComplete(job) {
  const photos = job.proofPhotos || [];
  if (job.requiresProofPhotos && photos.length < Math.max(1, Number(job.minimumProofPhotos || 0))) return false;
  if (job.requiresBeforePhotos && !photos.some((photo) => photo.category === 'BEFORE')) return false;
  if (job.requiresAfterPhotos && !photos.some((photo) => photo.category === 'AFTER')) return false;
  if (job.requiresSignature && !job.signature) return false;
  if (job.requiresLocation && !job.completionLocation) return false;
  return true;
}

function workerName(worker) {
  return worker && worker.user && (worker.user.name || worker.user.email) || worker && worker.title || worker && worker.id || 'Worker';
}

function branchName(branch) {
  return branch && (branch.name || branch.code || branch.id) || 'Unassigned';
}

function agingBucket(invoice, now = new Date()) {
  const due = date(invoice.dueDate);
  if (!due || due >= now) return 'current';
  const age = Math.floor((now - due) / DAY_MS);
  if (age <= 30) return 'days1To30';
  if (age <= 60) return 'days31To60';
  if (age <= 90) return 'days61To90';
  return 'over90';
}

function emptyAgingBuckets() {
  return { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, over90: 0 };
}

function average(values) {
  const usable = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return usable.length ? Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 10) / 10 : null;
}

function sum(values) {
  return values.reduce((total, value) => total + number(value), MONEY_ZERO);
}

function stageAverage(fromRecords, toRecords, fromDateFn, toDateFn, matchFn) {
  return average(fromRecords.map((from) => {
    const to = toRecords.find((candidate) => matchFn(from, candidate));
    return to ? daysBetween(fromDateFn(from), toDateFn(to)) : null;
  }));
}

function csvEscape(value) {
  const output = value == null ? '' : String(value);
  return /[",\n]/.test(output) ? `"${output.replace(/"/g, '""')}"` : output;
}

function rowsToCsv(columns, rows) {
  return [columns.join(','), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))].join('\n');
}

function analyticsCsv(section, data) {
  if (section === 'branches') {
    return rowsToCsv(['branchId', 'branchName', 'revenue', 'completedJobs', 'overdueJobs', 'slaBreaches', 'pendingApprovals', 'stockValue'], data.branchPerformance.map((row) => ({
      branchId: row.branchId || 'unassigned',
      branchName: row.branchName,
      revenue: row.revenue,
      completedJobs: row.completedJobs,
      overdueJobs: row.overdueJobs,
      slaBreaches: row.slaBreaches,
      pendingApprovals: row.pendingApprovals,
      stockValue: row.stockValue
    })));
  }

  if (section === 'technicians') {
    return rowsToCsv(['workerId', 'workerName', 'jobsCompleted', 'averageJobDurationMinutes', 'onTimeArrivalRate', 'proofCompletionRate', 'signatureCaptureRate', 'partsUsed'], data.technicianProductivity.map((row) => ({
      workerId: row.workerId,
      workerName: row.workerName,
      jobsCompleted: row.jobsCompleted,
      averageJobDurationMinutes: row.averageJobDurationMinutes == null ? '' : row.averageJobDurationMinutes,
      onTimeArrivalRate: row.onTimeArrivalRate,
      proofCompletionRate: row.proofCompletionRate,
      signatureCaptureRate: row.signatureCaptureRate,
      partsUsed: row.partsUsed
    })));
  }

  if (section === 'quote-to-cash') {
    return rowsToCsv(['stage', 'count', 'conversionRate', 'averageDaysFromPreviousStage'], data.quoteToCash.stages.map((row) => ({
      stage: row.stage,
      count: row.count,
      conversionRate: row.conversionRate,
      averageDaysFromPreviousStage: row.averageDaysFromPreviousStage == null ? '' : row.averageDaysFromPreviousStage
    })));
  }

  if (section === 'inventory') {
    return rowsToCsv(['metric', 'value'], Object.entries(data.inventoryProcurement).filter(([, value]) => typeof value !== 'object').map(([metric, value]) => ({ metric, value })));
  }

  return rowsToCsv(['metric', 'value'], Object.entries(data.overview).filter(([, value]) => typeof value !== 'object').map(([metric, value]) => ({ metric, value })));
}

async function buildExecutiveAnalytics(companyId, query = {}, options = {}) {
  const prisma = getPrisma();
  const range = rangeFromQuery(query);
  const branchIds = options.branchIds || null;
  const branchIdSet = branchIds && branchIds.length ? new Set(branchIds) : null;
  const where = { companyId };
  const now = new Date();

  const [branches, jobsRaw, invoicesRaw, paymentsRaw, quotesRaw, bookingsRaw, workers, approvals, items, stocks, purchaseRequests, purchaseOrders, contracts, jobParts, proofPhotos, signatures, completionLocations] = await Promise.all([
    prisma.branch.findMany({ where, orderBy: { createdAt: 'desc' } }),
    prisma.job.findMany({ where, include: { customer: true, service: true, worker: { include: { user: { select: { id: true, name: true, email: true, role: true } } } }, proofPhotos: true, signature: true, completionLocation: true }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.invoice.findMany({ where, include: { customer: true, service: true, payments: true }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.quote.findMany({ where: { companyId, deletedAt: null }, include: { customer: true, service: true }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.bookingRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.workerProfile.findMany({ where, include: { user: { select: { id: true, name: true, email: true, role: true } }, branch: true }, orderBy: { createdAt: 'desc' } }),
    prisma.approvalRequest.findMany({ where, include: { policy: true }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.inventoryItem.findMany({ where: { companyId, active: true }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.inventoryStock.findMany({ where, include: { item: true, location: true }, orderBy: { createdAt: 'desc' }, take: 3000 }),
    prisma.purchaseRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.purchaseOrder.findMany({ where, include: { supplier: true, lines: { include: { item: true } } }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.serviceContract.findMany({ where, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.jobPartUsage.findMany({ where, include: { item: true }, orderBy: { createdAt: 'desc' }, take: 3000 }),
    prisma.jobProofPhoto.findMany({ where, orderBy: { createdAt: 'desc' }, take: 3000 }),
    prisma.jobSignature.findMany({ where, orderBy: { createdAt: 'desc' }, take: 3000 }),
    prisma.jobCompletionLocation.findMany({ where, orderBy: { createdAt: 'desc' }, take: 3000 })
  ]);

  const permittedBranches = branchIdSet ? branches.filter((branch) => branchIdSet.has(branch.id)) : branches;
  const permittedBranchIds = new Set(permittedBranches.map((branch) => branch.id));
  const branchAllowed = (record) => !branchIdSet || permittedBranchIds.has(record.branchId || null);
  const jobs = jobsRaw.filter(branchAllowed).map((job) => ({
    ...job,
    proofPhotos: job.proofPhotos || proofPhotos.filter((photo) => photo.jobId === job.id),
    signature: job.signature || signatures.find((signature) => signature.jobId === job.id) || null,
    completionLocation: job.completionLocation || completionLocations.find((location) => location.jobId === job.id) || null
  }));
  const invoices = invoicesRaw.filter(branchAllowed);
  const payments = paymentsRaw.filter(branchAllowed).filter((payment) => invoices.some((invoice) => invoice.id === payment.invoiceId));
  const quotes = quotesRaw.filter(branchAllowed);
  const bookings = bookingsRaw.filter(branchAllowed);
  const branchScopedApprovals = approvals.filter(branchAllowed);
  const branchScopedStocks = stocks.filter((stock) => {
    const branchId = stock.location && stock.location.branchId || stock.branchId || null;
    return !branchIdSet || permittedBranchIds.has(branchId);
  });
  const branchScopedPurchaseRequests = purchaseRequests.filter(branchAllowed);
  const branchScopedPurchaseOrders = purchaseOrders.filter(branchAllowed);
  const branchScopedContracts = contracts.filter(branchAllowed);
  const branchScopedJobParts = jobParts.filter((part) => jobs.some((job) => job.id === part.jobId));

  const confirmedPayments = payments.filter(isConfirmedPayment);
  const rangePayments = confirmedPayments.filter((payment) => inRange(paymentDate(payment), range));
  const periodJobs = jobs.filter((job) => inRange(jobCompletedDate(job), range) || inRange(job.scheduledStart, range));
  const completedJobs = jobs.filter((job) => String(job.status || '').toUpperCase() === 'COMPLETED' && inRange(job.completedAt || job.updatedAt || job.createdAt, range));
  const outstandingInvoices = invoices.filter(isOutstandingInvoice);
  const overdueInvoices = invoices.filter((invoice) => isOverdueInvoice(invoice, now));
  const sentQuotes = quotes.filter((quote) => ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(String(quote.status || '').toUpperCase()) && inRange(quote.sentAt || quote.createdAt, range));
  const acceptedQuotes = quotes.filter((quote) => String(quote.status || '').toUpperCase() === 'ACCEPTED' && inRange(quote.acceptedAt || quote.createdAt, range));
  const proofRequiredCompleted = completedJobs.filter((job) => job.requiresProofPhotos || job.requiresBeforePhotos || job.requiresAfterPhotos || job.requiresSignature || job.requiresLocation);
  const proofMissingJobs = proofRequiredCompleted.filter((job) => !proofComplete(job));
  const pendingApprovals = branchScopedApprovals.filter((approval) => String(approval.status || '').toUpperCase() === 'PENDING');
  const atRiskJobs = jobs.filter((job) => ['AT_RISK', 'BREACHED'].includes(String(job.slaStatus || '').toUpperCase()) || (['SCHEDULED', 'DISPATCHED'].includes(String(job.status || '').toUpperCase()) && job.scheduledEnd && date(job.scheduledEnd) < now));
  const slaBreachedJobs = jobs.filter((job) => String(job.slaStatus || '').toUpperCase() === 'BREACHED');

  const activeWorkers = workers.filter((worker) => worker.active !== false && (!branchIdSet || !worker.branchId || permittedBranchIds.has(worker.branchId)));
  const workerCapacity = Math.max(activeWorkers.length, 1) * Math.max(Math.ceil((range.end - range.start) / DAY_MS) + 1, 1);
  const technicianUtilization = Math.min(100, Math.round((completedJobs.length / workerCapacity) * 1000) / 10);

  const quoteCashDurations = acceptedQuotes.map((quote) => {
    const invoice = invoices.find((item) => item.quoteId === quote.id || item.jobId === quote.jobId || item.customerId === quote.customerId);
    if (!invoice) return null;
    const paidPayment = confirmedPayments.find((payment) => payment.invoiceId === invoice.id);
    return daysBetween(quote.acceptedAt || quote.createdAt, paidPayment ? paymentDate(paidPayment) : invoice.paidAt);
  });

  const stockByItem = new Map();
  for (const stock of branchScopedStocks) {
    const current = stockByItem.get(stock.itemId) || { onHand: 0, value: 0 };
    const unitCost = number(stock.item && stock.item.unitCost || stock.unitCost || 0);
    current.onHand += number(stock.quantityOnHand);
    current.value += number(stock.quantityOnHand) * unitCost;
    stockByItem.set(stock.itemId, current);
  }
  const lowStockItems = items.map((item) => {
    const stock = stockByItem.get(item.id) || { onHand: 0, value: 0 };
    const threshold = number(item.minStockLevel || item.reorderPoint || 0);
    return { id: item.id, sku: item.sku, name: item.name, quantityOnHand: stock.onHand, threshold, critical: threshold > 0 && stock.onHand <= threshold };
  }).filter((item) => item.critical);

  const branchMap = new Map(permittedBranches.map((branch) => [branch.id, branch]));
  const branchBuckets = [...permittedBranches.map((branch) => branch.id), null].filter((value, index, list) => list.indexOf(value) === index);
  const branchPerformance = branchBuckets.map((branchId) => {
    const branchJobs = jobs.filter((job) => (job.branchId || null) === branchId);
    const branchInvoices = invoices.filter((invoice) => (invoice.branchId || null) === branchId);
    const branchPayments = confirmedPayments.filter((payment) => (payment.branchId || null) === branchId || branchInvoices.some((invoice) => invoice.id === payment.invoiceId));
    const branchStocks = branchScopedStocks.filter((stock) => (stock.location && stock.location.branchId || stock.branchId || null) === branchId);
    const branchApprovals = pendingApprovals.filter((approval) => (approval.branchId || null) === branchId);
    const aging = emptyAgingBuckets();
    branchInvoices.filter(isOutstandingInvoice).forEach((invoice) => { aging[agingBucket(invoice, now)] += invoiceBalance(invoice); });
    return {
      branchId,
      branchName: branchName(branchMap.get(branchId)),
      revenue: sum(branchPayments.filter((payment) => inRange(paymentDate(payment), range)).map((payment) => payment.amount)),
      completedJobs: branchJobs.filter((job) => String(job.status || '').toUpperCase() === 'COMPLETED' && inRange(job.completedAt || job.updatedAt || job.createdAt, range)).length,
      overdueJobs: branchJobs.filter((job) => !['COMPLETED', 'CANCELLED'].includes(String(job.status || '').toUpperCase()) && job.scheduledEnd && date(job.scheduledEnd) < now).length,
      slaBreaches: branchJobs.filter((job) => String(job.slaStatus || '').toUpperCase() === 'BREACHED').length,
      invoiceAging: aging,
      workerProductivity: activeWorkers.filter((worker) => (worker.branchId || null) === branchId).map((worker) => ({ workerId: worker.id, workerName: workerName(worker), completedJobs: branchJobs.filter((job) => job.workerId === worker.id && String(job.status || '').toUpperCase() === 'COMPLETED').length })),
      stockValue: branchStocks.reduce((total, stock) => total + number(stock.quantityOnHand) * number(stock.item && stock.item.unitCost || stock.unitCost), 0),
      pendingApprovals: branchApprovals.length
    };
  }).filter((row) => row.branchId || row.revenue || row.completedJobs || row.overdueJobs || row.slaBreaches || row.stockValue || row.pendingApprovals);

  const technicianProductivity = activeWorkers.map((worker) => {
    const workerJobs = jobs.filter((job) => job.workerId === worker.id);
    const completed = workerJobs.filter((job) => String(job.status || '').toUpperCase() === 'COMPLETED' && inRange(job.completedAt || job.updatedAt || job.createdAt, range));
    const durations = completed.map((job) => {
      const start = date(job.startedAt || job.arrivedAt || job.scheduledStart);
      const end = date(job.completedAt);
      return start && end && end >= start ? Math.round((end - start) / (60 * 1000)) : null;
    });
    const onTimeJobs = workerJobs.filter((job) => job.arrivedAt && job.scheduledStart && inRange(job.arrivedAt, range));
    const proofRequired = completed.filter((job) => job.requiresProofPhotos || job.requiresBeforePhotos || job.requiresAfterPhotos || job.requiresSignature || job.requiresLocation);
    const signatureRequired = completed.filter((job) => job.requiresSignature);
    const partsUsed = branchScopedJobParts.filter((part) => part.workerId === worker.id || workerJobs.some((job) => job.id === part.jobId)).reduce((total, part) => total + number(part.quantityUsed || part.quantity), 0);
    return {
      workerId: worker.id,
      workerName: workerName(worker),
      title: worker.title || null,
      jobsCompleted: completed.length,
      averageJobDurationMinutes: average(durations),
      onTimeArrivalRate: onTimeJobs.length ? pct(onTimeJobs.filter((job) => date(job.arrivedAt) <= date(job.scheduledStart)).length, onTimeJobs.length) : null,
      proofCompletionRate: proofRequired.length ? pct(proofRequired.filter(proofComplete).length, proofRequired.length) : null,
      reworkCount: 0,
      signatureCaptureRate: signatureRequired.length ? pct(signatureRequired.filter((job) => Boolean(job.signature)).length, signatureRequired.length) : null,
      partsUsed,
      idleAvailableTimePlaceholder: 'Requires shift clock data'
    };
  }).sort((a, b) => b.jobsCompleted - a.jobsCompleted);

  const invoiceIssued = invoices.filter((invoice) => inRange(invoice.createdAt, range));
  const paidInvoices = invoices.filter((invoice) => isPaidInvoice(invoice) || confirmedPayments.some((payment) => payment.invoiceId === invoice.id));
  const quoteToCash = {
    stages: [
      { stage: 'bookingRequest', count: bookings.filter((booking) => inRange(booking.createdAt, range)).length, conversionRate: 100, averageDaysFromPreviousStage: null },
      { stage: 'quoteSent', count: sentQuotes.length, conversionRate: pct(sentQuotes.length, bookings.length || sentQuotes.length), averageDaysFromPreviousStage: stageAverage(bookings, sentQuotes, (item) => item.createdAt, (item) => item.sentAt || item.createdAt, (booking, quote) => !booking.customerId || booking.customerId === quote.customerId) },
      { stage: 'quoteAccepted', count: acceptedQuotes.length, conversionRate: pct(acceptedQuotes.length, sentQuotes.length), averageDaysFromPreviousStage: stageAverage(sentQuotes, acceptedQuotes, (item) => item.sentAt || item.createdAt, (item) => item.acceptedAt || item.createdAt, (sent, accepted) => sent.id === accepted.id) },
      { stage: 'jobScheduled', count: jobs.filter((job) => job.scheduledStart && inRange(job.scheduledStart, range)).length, conversionRate: pct(jobs.filter((job) => job.scheduledStart).length, acceptedQuotes.length || jobs.length), averageDaysFromPreviousStage: stageAverage(acceptedQuotes, jobs, (item) => item.acceptedAt || item.createdAt, (item) => item.scheduledStart, (quote, job) => quote.jobId === job.id || quote.customerId === job.customerId) },
      { stage: 'jobCompleted', count: completedJobs.length, conversionRate: pct(completedJobs.length, jobs.filter((job) => job.scheduledStart).length), averageDaysFromPreviousStage: stageAverage(jobs, completedJobs, (item) => item.scheduledStart, (item) => item.completedAt || item.updatedAt, (job, completed) => job.id === completed.id) },
      { stage: 'invoiceIssued', count: invoiceIssued.length, conversionRate: pct(invoiceIssued.length, completedJobs.length || invoiceIssued.length), averageDaysFromPreviousStage: stageAverage(completedJobs, invoiceIssued, (item) => item.completedAt || item.updatedAt, (item) => item.createdAt, (job, invoice) => invoice.jobId === job.id || invoice.customerId === job.customerId) },
      { stage: 'paymentCollected', count: rangePayments.length, conversionRate: pct(paidInvoices.length, invoiceIssued.length || paidInvoices.length), averageDaysFromPreviousStage: stageAverage(invoiceIssued, confirmedPayments, (item) => item.createdAt, paymentDate, (invoice, payment) => payment.invoiceId === invoice.id) }
    ],
    conversionRate: pct(acceptedQuotes.length, sentQuotes.length),
    averageQuoteToCashDays: average(quoteCashDurations),
    stuckRecords: {
      quotesAwaitingDecision: sentQuotes.filter((quote) => String(quote.status || '').toUpperCase() === 'SENT').length,
      unscheduledAcceptedQuotes: acceptedQuotes.filter((quote) => !jobs.some((job) => quote.jobId === job.id || quote.customerId === job.customerId)).length,
      completedJobsNotInvoiced: completedJobs.filter((job) => !invoices.some((invoice) => invoice.jobId === job.id)).length,
      unpaidInvoices: outstandingInvoices.length
    },
    lostRevenueEstimate: sum(quotes.filter((quote) => String(quote.status || '').toUpperCase() === 'REJECTED').map((quote) => quote.total || quote.amount))
  };

  const expiringContracts = branchScopedContracts.filter((contract) => contract.endDate && date(contract.endDate) <= new Date(now.getTime() + 30 * DAY_MS) && date(contract.endDate) >= now);
  const contractProfitability = branchScopedContracts.map((contract) => {
    const contractJobs = jobs.filter((job) => job.contractId === contract.id);
    const contractPayments = confirmedPayments.filter((payment) => {
      const invoice = invoices.find((item) => item.id === payment.invoiceId);
      return invoice && contractJobs.some((job) => job.id === invoice.jobId);
    });
    const partsCost = branchScopedJobParts.filter((part) => contractJobs.some((job) => job.id === part.jobId)).reduce((total, part) => total + number(part.unitCost || part.item && part.item.unitCost) * number(part.quantityUsed || part.quantity || 0), 0);
    const revenue = sum(contractPayments.map((payment) => payment.amount));
    return { contractId: contract.id, contractNumber: contract.contractNumber || contract.name, revenue, partsCost, grossMarginEstimate: revenue - partsCost };
  });

  const contractsSla = {
    activeContracts: branchScopedContracts.filter((contract) => String(contract.status || '').toUpperCase() === 'ACTIVE').length,
    expiringContracts: expiringContracts.length,
    overduePlannedMaintenance: branchScopedContracts.filter((contract) => contract.nextDueDate && date(contract.nextDueDate) < now).length,
    slaAtRisk: jobs.filter((job) => String(job.slaStatus || '').toUpperCase() === 'AT_RISK').length,
    slaBreached: slaBreachedJobs.length,
    renewalValue: sum(expiringContracts.map((contract) => contract.contractValue || contract.contractMonthlyValue)),
    contractProfitability
  };

  const inventoryProcurement = {
    lowStock: lowStockItems.length,
    lowStockItems,
    stockValue: branchScopedStocks.reduce((total, stock) => total + number(stock.quantityOnHand) * number(stock.item && stock.item.unitCost || stock.unitCost), 0),
    pendingPurchaseRequests: branchScopedPurchaseRequests.filter((request) => ['DRAFT', 'REQUESTED'].includes(String(request.status || '').toUpperCase())).length,
    openPurchaseOrders: branchScopedPurchaseOrders.filter((order) => !['RECEIVED', 'CANCELLED'].includes(String(order.status || '').toUpperCase())).length,
    supplierDelays: branchScopedPurchaseOrders.filter((order) => order.expectedAt && date(order.expectedAt) < now && !['RECEIVED', 'CANCELLED'].includes(String(order.status || '').toUpperCase())).length,
    partsCostByJob: branchScopedJobParts.reduce((map, part) => {
      const jobId = part.jobId || 'unassigned';
      map[jobId] = (map[jobId] || 0) + number(part.unitCost || part.item && part.item.unitCost) * number(part.quantityUsed || part.quantity || 0);
      return map;
    }, {})
  };

  const overview = {
    mtdRevenue: sum(confirmedPayments.filter((payment) => {
      const paid = date(paymentDate(payment));
      return paid && paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear();
    }).map((payment) => payment.amount)),
    periodRevenue: sum(rangePayments.map((payment) => payment.amount)),
    outstandingInvoices: outstandingInvoices.length,
    outstandingInvoiceTotal: sum(outstandingInvoices.map(invoiceBalance)),
    overdueInvoices: overdueInvoices.length,
    overdueInvoiceTotal: sum(overdueInvoices.map(invoiceBalance)),
    completedJobs: completedJobs.length,
    jobsAtRisk: atRiskJobs.length,
    slaBreaches: slaBreachedJobs.length,
    technicianUtilization,
    quoteAcceptanceRate: pct(acceptedQuotes.length, sentQuotes.length),
    averageQuoteToCashDays: average(quoteCashDurations),
    proofMissingCount: proofMissingJobs.length,
    pendingApprovals: pendingApprovals.length,
    lowStockCriticalItems: lowStockItems.length
  };

  const agingBuckets = emptyAgingBuckets();
  outstandingInvoices.forEach((invoice) => { agingBuckets[agingBucket(invoice, now)] += invoiceBalance(invoice); });

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      branchId: query.branchId || null,
      workerId: query.workerId || null,
      customerId: query.customerId || null,
      contractId: query.contractId || null
    },
    definitions: {
      technicianUtilization: 'Completed jobs divided by active technician capacity days for the selected range.',
      averageQuoteToCashDays: 'Average days from accepted quote to confirmed payment where records can be linked.',
      jobsAtRisk: 'SLA at-risk/breached jobs plus scheduled/dispatch jobs past scheduled end.',
      lowStockCriticalItems: 'Active items at or below min stock/reorder threshold.'
    },
    overview,
    branchPerformance,
    technicianProductivity,
    quoteToCash,
    contractsSla,
    inventoryProcurement,
    accountsReceivable: {
      agingBuckets,
      rows: outstandingInvoices.map((invoice) => ({ id: invoice.id, number: invoice.number, customerName: invoice.customer && invoice.customer.name, balanceDue: invoiceBalance(invoice), dueDate: iso(invoice.dueDate), bucket: agingBucket(invoice, now) }))
    }
  };
}

module.exports = { analyticsCsv, buildExecutiveAnalytics, rangeFromQuery };
