const { prisma } = require('../db');
const { AppError } = require('../errors');

const DEFAULT_DAYS = 30;
const TOP_LIMIT = 10;
const MONEY_ZERO = 0;

function number(value) {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value || 0);
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defaultRange(now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (DEFAULT_DAYS - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function parseDateOnly(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new AppError(400, `${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new AppError(400, `${label} is invalid.`);
  return date;
}

function rangeFromQuery(query = {}) {
  if (query.startDate || query.endDate) {
    if (!query.startDate || !query.endDate) throw new AppError(400, 'Both startDate and endDate are required for custom reports.');
    const start = parseDateOnly(query.startDate, 'startDate');
    const end = parseDateOnly(query.endDate, 'endDate');
    end.setUTCHours(23, 59, 59, 999);
    if (start > end) throw new AppError(400, 'startDate must be before or equal to endDate.');
    return { start, end, label: 'custom' };
  }

  const now = new Date();
  const period = String(query.period || 'last30days');
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: period };
  }
  if (period === 'thisWeek') {
    const start = new Date(now);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    start.setHours(0, 0, 0, 0);
    return { start, end: now, label: period };
  }
  if (period === 'thisMonth') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: period };
  }
  if (period === 'lastMonth') {
    return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999), label: period };
  }
  if (period === 'thisYear') {
    return { start: new Date(now.getFullYear(), 0, 1), end: now, label: period };
  }
  return { ...defaultRange(now), label: 'last30days' };
}

function inRange(value, range) {
  const date = dateOrNull(value);
  return Boolean(date && date >= range.start && date <= range.end);
}

function applyOptionalFilters(records, filters) {
  return records.filter((record) => {
    if (filters.serviceId && record.serviceId !== filters.serviceId) return false;
    if (filters.workerId && record.workerId !== filters.workerId) return false;
    if (filters.customerId && record.customerId !== filters.customerId) return false;
    return true;
  });
}

async function validateFilters(companyId, query = {}) {
  const range = rangeFromQuery(query);
  const filters = { range };
  if (query.serviceId) {
    const service = await prisma.service.findFirst({ where: { id: String(query.serviceId), companyId } });
    if (!service) throw new AppError(404, 'Service not found.');
    filters.serviceId = service.id;
  }
  if (query.workerId) {
    const worker = await prisma.workerProfile.findFirst({ where: { id: String(query.workerId), companyId } });
    if (!worker) throw new AppError(404, 'Worker not found.');
    filters.workerId = worker.id;
  }
  if (query.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: String(query.customerId), companyId } });
    if (!customer) throw new AppError(404, 'Customer not found.');
    filters.customerId = customer.id;
  }
  return filters;
}

function groupSum(records, keyFn, valueFn) {
  const groups = new Map();
  records.forEach((record) => {
    const key = keyFn(record) || 'none';
    const current = groups.get(key) || { key, total: 0, count: 0 };
    current.total += valueFn(record);
    current.count += 1;
    groups.set(key, current);
  });
  return Array.from(groups.values()).sort((a, b) => b.total - a.total || b.count - a.count).slice(0, TOP_LIMIT);
}

function groupCount(records, keyFn) {
  const groups = new Map();
  records.forEach((record) => {
    const key = keyFn(record) || 'none';
    const current = groups.get(key) || { key, count: 0 };
    current.count += 1;
    groups.set(key, current);
  });
  return Array.from(groups.values()).sort((a, b) => b.count - a.count).slice(0, TOP_LIMIT);
}

function timeline(records, dateFn, valueFn) {
  const groups = new Map();
  records.forEach((record) => {
    const key = dayKey(dateFn(record));
    if (!key) return;
    groups.set(key, (groups.get(key) || 0) + valueFn(record));
  });
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

function nameMap(records) {
  return new Map(records.map((record) => [record.id, record.name || record.title || record.email || record.id]));
}

function workerName(worker) {
  return worker && worker.user && (worker.user.name || worker.user.email) || worker && worker.title || 'Worker';
}

function paidDate(payment) {
  return payment.receivedAt || payment.confirmedAt || payment.createdAt;
}

function invoiceDate(invoice) {
  return invoice.paidAt || invoice.sentAt || invoice.createdAt;
}

function jobDate(job) {
  return job.completedAt || job.scheduledStart || job.createdAt;
}

function quoteDate(quote) {
  return quote.sentAt || quote.acceptedAt || quote.rejectedAt || quote.createdAt;
}

function isUnpaid(invoice) {
  return !['PAID', 'VOID'].includes(String(invoice.status || '').toUpperCase()) && number(invoice.balanceDue != null ? invoice.balanceDue : invoice.total) > 0;
}

function proofComplete(job) {
  const photos = job.proofPhotos || [];
  const signature = job.signature;
  const location = job.completionLocation;
  if (job.requiresProofPhotos && photos.length < Math.max(1, Number(job.minimumProofPhotos || 0))) return false;
  if (job.requiresBeforePhotos && !photos.some((photo) => photo.category === 'BEFORE')) return false;
  if (job.requiresAfterPhotos && !photos.some((photo) => photo.category === 'AFTER')) return false;
  if (job.requiresSignature && !signature) return false;
  if (job.requiresLocation && !location) return false;
  return true;
}

function enrichGroups(groups, names) {
  return groups.map((item) => ({ ...item, name: names.get(item.key) || 'Unassigned' }));
}

async function reportData(companyId, query = {}) {
  const filters = await validateFilters(companyId, query);
  const range = filters.range;
  const [customers, services, workers, jobsRaw, invoicesRaw, paymentsRaw, quotesRaw, bookingsRaw] = await Promise.all([
    prisma.customer.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
    prisma.service.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
    prisma.workerProfile.findMany({ where: { companyId }, include: { user: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.job.findMany({ where: { companyId }, include: { customer: true, service: true, worker: { include: { user: { select: { id: true, name: true, email: true, role: true } } } }, proofPhotos: true, signature: true, completionLocation: true }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.invoice.findMany({ where: { companyId }, include: { customer: true, service: true, payments: true, receipts: true }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.payment.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.quote.findMany({ where: { companyId }, include: { customer: true, service: true }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.bookingRequest.findMany({ where: { companyId }, include: { service: true, customer: true }, orderBy: { createdAt: 'desc' }, take: 1000 })
  ]);

  const customerNames = nameMap(customers);
  const serviceNames = nameMap(services);
  const workerNames = new Map(workers.map((worker) => [worker.id, workerName(worker)]));
  const jobs = applyOptionalFilters(jobsRaw, filters);
  const invoices = applyOptionalFilters(invoicesRaw, filters);
  const payments = paymentsRaw.filter((payment) => {
    const invoice = invoicesRaw.find((item) => item.id === payment.invoiceId);
    if (!invoice || !applyOptionalFilters([invoice], filters).length) return false;
    return true;
  });
  const quotes = applyOptionalFilters(quotesRaw, filters);
  const bookings = applyOptionalFilters(bookingsRaw, filters);
  const paidPayments = payments.filter((payment) => payment.status === 'CONFIRMED' && inRange(paidDate(payment), range));
  const periodInvoices = invoices.filter((invoice) => inRange(invoiceDate(invoice), range));
  const unpaidInvoices = invoices.filter(isUnpaid);
  const overdueInvoices = unpaidInvoices.filter((invoice) => invoice.dueDate && new Date(invoice.dueDate) < new Date());
  const periodJobs = jobs.filter((job) => inRange(jobDate(job), range));
  const completedJobs = jobs.filter((job) => job.status === 'COMPLETED' && inRange(job.completedAt || job.updatedAt || job.createdAt, range));
  const scheduledJobs = jobs.filter((job) => job.scheduledStart && inRange(job.scheduledStart, range));
  const periodQuotes = quotes.filter((quote) => inRange(quoteDate(quote), range));
  const periodBookings = bookings.filter((booking) => inRange(booking.createdAt, range));
  const paidRevenue = paidPayments.reduce((sum, payment) => sum + number(payment.amount), MONEY_ZERO);
  const paidInvoiceTotal = periodInvoices.filter((invoice) => invoice.status === 'PAID').reduce((sum, invoice) => sum + number(invoice.total || invoice.amount), MONEY_ZERO);
  const unpaidTotal = unpaidInvoices.reduce((sum, invoice) => sum + number(invoice.balanceDue != null ? invoice.balanceDue : invoice.total), MONEY_ZERO);
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + number(invoice.balanceDue != null ? invoice.balanceDue : invoice.total), MONEY_ZERO);
  const sentQuotes = periodQuotes.filter((quote) => ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(quote.status));
  const acceptedQuotes = periodQuotes.filter((quote) => quote.status === 'ACCEPTED');
  const rejectedQuotes = periodQuotes.filter((quote) => quote.status === 'REJECTED');
  const completedOrCancelled = periodJobs.filter((job) => ['COMPLETED', 'CANCELLED'].includes(job.status));
  const completedDurations = completedJobs.map((job) => {
    const start = dateOrNull(job.startedAt || job.arrivedAt || job.scheduledStart);
    const end = dateOrNull(job.completedAt);
    return start && end && end >= start ? (end - start) / (60 * 1000) : null;
  }).filter((value) => value != null);

  const revenueByService = enrichGroups(groupSum(paidPayments, (payment) => {
    const invoice = invoicesRaw.find((item) => item.id === payment.invoiceId);
    return invoice && invoice.serviceId;
  }, (payment) => number(payment.amount)), serviceNames);

  const revenueByCustomer = enrichGroups(groupSum(paidPayments, (payment) => {
    const invoice = invoicesRaw.find((item) => item.id === payment.invoiceId);
    return invoice && invoice.customerId;
  }, (payment) => number(payment.amount)), customerNames);

  const workersReport = workers.map((worker) => {
    const assigned = jobs.filter((job) => job.workerId === worker.id && inRange(job.createdAt, range));
    const completed = jobs.filter((job) => job.workerId === worker.id && job.status === 'COMPLETED' && inRange(job.completedAt || job.updatedAt || job.createdAt, range));
    const inProgress = jobs.filter((job) => job.workerId === worker.id && ['ARRIVED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD'].includes(job.status));
    const durations = completed.map((job) => {
      const start = dateOrNull(job.startedAt || job.arrivedAt || job.scheduledStart);
      const end = dateOrNull(job.completedAt);
      return start && end && end >= start ? (end - start) / (60 * 1000) : null;
    }).filter((value) => value != null);
    const proofRequired = completed.filter((job) => job.requiresProofPhotos || job.requiresBeforePhotos || job.requiresAfterPhotos || job.requiresSignature || job.requiresLocation);
    return {
      id: worker.id,
      name: workerName(worker),
      title: worker.title || null,
      active: Boolean(worker.active),
      assigned: assigned.length,
      completed: completed.length,
      inProgress: inProgress.length,
      completionRate: pct(completed.length, assigned.length),
      averageDurationMinutes: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      proofComplianceRate: proofRequired.length ? pct(proofRequired.filter(proofComplete).length, proofRequired.length) : null
    };
  }).sort((a, b) => b.completed - a.completed || b.assigned - a.assigned).slice(0, TOP_LIMIT);

  const serviceReport = services.map((service) => {
    const serviceJobs = periodJobs.filter((job) => job.serviceId === service.id);
    const serviceQuotes = periodQuotes.filter((quote) => quote.serviceId === service.id);
    const servicePayments = paidPayments.filter((payment) => {
      const invoice = invoicesRaw.find((item) => item.id === payment.invoiceId);
      return invoice && invoice.serviceId === service.id;
    });
    const serviceInvoices = periodInvoices.filter((invoice) => invoice.serviceId === service.id);
    const serviceBookings = periodBookings.filter((booking) => booking.serviceId === service.id);
    return {
      id: service.id,
      name: service.name,
      bookingRequests: serviceBookings.length,
      jobs: serviceJobs.length,
      completedJobs: serviceJobs.filter((job) => job.status === 'COMPLETED').length,
      revenue: servicePayments.reduce((sum, payment) => sum + number(payment.amount), 0),
      quotes: serviceQuotes.length,
      acceptedQuotes: serviceQuotes.filter((quote) => quote.status === 'ACCEPTED').length,
      quoteAcceptanceRate: pct(serviceQuotes.filter((quote) => quote.status === 'ACCEPTED').length, serviceQuotes.filter((quote) => quote.status !== 'DRAFT').length),
      averageInvoiceValue: serviceInvoices.length ? serviceInvoices.reduce((sum, invoice) => sum + number(invoice.total || invoice.amount), 0) / serviceInvoices.length : 0
    };
  }).sort((a, b) => b.revenue - a.revenue || b.jobs - a.jobs || b.bookingRequests - a.bookingRequests).slice(0, TOP_LIMIT);

  const customerReport = customers.map((customer) => {
    const customerInvoices = invoices.filter((invoice) => invoice.customerId === customer.id);
    const customerPayments = paidPayments.filter((payment) => customerInvoices.some((invoice) => invoice.id === payment.invoiceId));
    const customerJobs = jobs.filter((job) => job.customerId === customer.id);
    const customerQuotes = quotes.filter((quote) => quote.customerId === customer.id);
    const customerBookings = bookings.filter((booking) => booking.customerId === customer.id);
    return {
      id: customer.id,
      name: customer.name,
      revenue: customerPayments.reduce((sum, payment) => sum + number(payment.amount), 0),
      unpaidTotal: customerInvoices.filter(isUnpaid).reduce((sum, invoice) => sum + number(invoice.balanceDue != null ? invoice.balanceDue : invoice.total), 0),
      invoices: customerInvoices.length,
      jobs: customerJobs.length,
      completedJobs: customerJobs.filter((job) => job.status === 'COMPLETED').length,
      quotes: customerQuotes.length,
      bookingRequests: customerBookings.length,
      lastJobDate: customerJobs.map((job) => dateOrNull(jobDate(job))).filter(Boolean).sort((a, b) => b - a)[0] || null,
      lastPaymentDate: customerPayments.map((payment) => dateOrNull(paidDate(payment))).filter(Boolean).sort((a, b) => b - a)[0] || null
    };
  }).sort((a, b) => b.revenue - a.revenue || b.unpaidTotal - a.unpaidTotal).slice(0, TOP_LIMIT);

  return {
    filters: { period: range.label, startDate: range.start, endDate: range.end, serviceId: filters.serviceId || null, workerId: filters.workerId || null, customerId: filters.customerId || null },
    options: {
      services: services.map((service) => ({ id: service.id, name: service.name })),
      workers: workers.map((worker) => ({ id: worker.id, name: workerName(worker) })),
      customers: customers.map((customer) => ({ id: customer.id, name: customer.name }))
    },
    overview: {
      totalRevenue: paidRevenue,
      unpaidInvoiceTotal: unpaidTotal,
      completedJobs: completedJobs.length,
      quoteAcceptanceRate: pct(acceptedQuotes.length, sentQuotes.length),
      topService: serviceReport[0] || null
    },
    revenue: {
      totalRevenue: paidRevenue,
      paidInvoiceTotal,
      paymentsReceivedTotal: paidRevenue,
      unpaidInvoiceTotal: unpaidTotal,
      overdueInvoiceTotal: overdueTotal,
      averageInvoiceValue: periodInvoices.length ? periodInvoices.reduce((sum, invoice) => sum + number(invoice.total || invoice.amount), 0) / periodInvoices.length : 0,
      byPeriod: timeline(paidPayments, paidDate, (payment) => number(payment.amount)),
      byService: revenueByService,
      byCustomer: revenueByCustomer
    },
    invoices: {
      unpaidCount: unpaidInvoices.length,
      unpaidTotal,
      overdueCount: overdueInvoices.length,
      overdueTotal,
      partiallyPaidCount: unpaidInvoices.filter((invoice) => invoice.status === 'PARTIALLY_PAID').length,
      oldestUnpaidInvoice: unpaidInvoices.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null,
      topUnpaidCustomers: enrichGroups(groupSum(unpaidInvoices, (invoice) => invoice.customerId, (invoice) => number(invoice.balanceDue != null ? invoice.balanceDue : invoice.total)), customerNames)
    },
    jobs: {
      completedCount: completedJobs.length,
      scheduledCount: scheduledJobs.length,
      cancelledCount: periodJobs.filter((job) => job.status === 'CANCELLED').length,
      inProgressCount: jobs.filter((job) => ['ARRIVED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD'].includes(job.status)).length,
      completionRate: pct(completedJobs.length, completedOrCancelled.length),
      averageCompletionMinutes: completedDurations.length ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length) : null,
      byPeriod: timeline(completedJobs, (job) => job.completedAt || job.updatedAt || job.createdAt, () => 1),
      byService: enrichGroups(groupCount(periodJobs, (job) => job.serviceId), serviceNames),
      byWorker: enrichGroups(groupCount(periodJobs, (job) => job.workerId), workerNames)
    },
    workers: workersReport,
    services: serviceReport,
    quotes: {
      createdCount: periodQuotes.length,
      draftCount: periodQuotes.filter((quote) => quote.status === 'DRAFT').length,
      sentCount: periodQuotes.filter((quote) => quote.status === 'SENT').length,
      acceptedCount: acceptedQuotes.length,
      rejectedCount: rejectedQuotes.length,
      acceptanceRate: pct(acceptedQuotes.length, sentQuotes.length),
      rejectionRate: pct(rejectedQuotes.length, sentQuotes.length),
      averageQuoteValue: periodQuotes.length ? periodQuotes.reduce((sum, quote) => sum + number(quote.total || quote.amount), 0) / periodQuotes.length : 0,
      acceptedQuoteValue: acceptedQuotes.reduce((sum, quote) => sum + number(quote.total || quote.amount), 0),
      byService: services.map((service) => {
        const serviceQuotes = periodQuotes.filter((quote) => quote.serviceId === service.id);
        const eligible = serviceQuotes.filter((quote) => quote.status !== 'DRAFT');
        return { id: service.id, name: service.name, quotes: serviceQuotes.length, sent: serviceQuotes.filter((quote) => quote.status === 'SENT').length, accepted: serviceQuotes.filter((quote) => quote.status === 'ACCEPTED').length, rejected: serviceQuotes.filter((quote) => quote.status === 'REJECTED').length, acceptanceRate: pct(serviceQuotes.filter((quote) => quote.status === 'ACCEPTED').length, eligible.length) };
      }).filter((item) => item.quotes > 0),
      byPeriod: timeline(periodQuotes, quoteDate, () => 1)
    },
    customers: {
      totalCustomers: customers.length,
      newCustomers: customers.filter((customer) => inRange(customer.createdAt, range)).length,
      repeatCustomers: customers.filter((customer) => jobs.filter((job) => job.customerId === customer.id).length > 1).length,
      topCustomers: customerReport,
      customersWithUnpaidInvoices: customerReport.filter((customer) => customer.unpaidTotal > 0)
    }
  };
}

function csvCell(value) {
  if (value == null) return '';
  let text = String(value instanceof Date ? value.toISOString() : value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRows(headers, rows) {
  return [headers.map(csvCell).join(',')].concat(rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))).join('\n') + '\n';
}

function reportCsv(section, data) {
  if (section === 'invoices') {
    const rows = (data.invoices.topUnpaidCustomers || []).map((item) => ({ customer: item.name, unpaidTotal: item.total, unpaidCount: item.count }));
    return csvRows(['customer', 'unpaidTotal', 'unpaidCount'], rows);
  }
  if (section === 'jobs') {
    const rows = (data.jobs.byWorker || []).map((item) => ({ worker: item.name, jobs: item.count }));
    return csvRows(['worker', 'jobs'], rows);
  }
  const rows = (data.revenue.byPeriod || []).map((item) => ({ date: item.date, revenue: item.value }));
  return csvRows(['date', 'revenue'], rows);
}

module.exports = { reportCsv, reportData, validateFilters };
