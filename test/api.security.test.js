const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-that-is-not-the-dev-fallback';
process.env.NODE_ENV = 'test';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function applySelect(record, select) {
  if (!record || !select) return clone(record);
  const output = {};
  for (const [key, value] of Object.entries(select)) {
    if (!value) continue;
    if (value === true) output[key] = clone(record[key]);
    else if (value.select) output[key] = applySelect(record[key], value.select);
  }
  return output;
}

function stripUndefined(input) {
  return Object.fromEntries(Object.entries(input || {}).filter(([, value]) => value !== undefined));
}

function matchesWhere(record, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    const actual = record[key];
    if (expected instanceof Date) return new Date(actual).getTime() === expected.getTime();
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('in' in expected) return expected.in.includes(actual);
      if ('gte' in expected && !(new Date(actual) >= new Date(expected.gte))) return false;
      if ('lt' in expected && !(new Date(actual) < new Date(expected.lt))) return false;
      return true;
    }
    return actual === expected;
  });
}

function byCreatedDesc(a, b) {
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

function createMockPrisma(seed) {
  const db = seed;
  let next = 1;
  const id = (prefix) => {
    let value;
    do {
      value = `${prefix}-${next++}`;
    } while (Object.values(db).some((records) => Array.isArray(records) && records.some((record) => record.id === value)));
    return value;
  };

  function companyById(companyId) { return db.companies.find((item) => item.id === companyId); }
  function brandingByCompanyId(companyId) { return db.companyBrandings.find((item) => item.companyId === companyId); }
  function userById(userId) { return db.users.find((item) => item.id === userId); }
  function customerById(customerId) { return db.customers.find((item) => item.id === customerId); }
  function serviceById(serviceId) { return db.services.find((item) => item.id === serviceId); }
  function workerById(workerId) { return db.workerProfiles.find((item) => item.id === workerId); }
  function roleById(roleId) { return db.workerRoles.find((item) => item.id === roleId); }
  function jobById(jobId) { return db.jobs.find((item) => item.id === jobId); }
  function invoiceById(invoiceId) { return db.invoices.find((item) => item.id === invoiceId); }
  function quoteLineItems(quoteId) { return db.quoteLineItems.filter((item) => item.quoteId === quoteId); }
  function invoiceLineItems(invoiceId) { return db.invoiceLineItems.filter((item) => item.invoiceId === invoiceId); }
  function receiptByPaymentId(paymentId) { return db.receipts.find((item) => item.paymentId === paymentId); }

  function enrichCompany(company, include) {
    if (!company) return null;
    const result = { ...company };
    if (include && include.branding) result.branding = clone(brandingByCompanyId(company.id)) || null;
    return result;
  }

  function enrichUser(user) {
    if (!user) return null;
    return { ...user, company: companyById(user.companyId), worker: enrichWorker(db.workerProfiles.find((worker) => worker.userId === user.id) || null, { role: true }) };
  }

  function enrichWorker(worker, include) {
    if (!worker) return null;
    const result = { ...worker };
    if (include && include.user) result.user = include.user.select ? applySelect(userById(worker.userId), include.user.select) : clone(userById(worker.userId));
    return result;
  }

  function enrichJob(job, include) {
    if (!job) return null;
    const result = { ...job };
    if (include && include.customer) result.customer = clone(customerById(job.customerId));
    if (include && include.service) result.service = clone(serviceById(job.serviceId));
    if (include && include.worker) result.worker = enrichWorker(workerById(job.workerId), include.worker.include);
    if (include && include.proofPhotos) result.proofPhotos = db.jobProofPhotos.filter((photo) => photo.jobId === job.id);
    if (include && include.signature) result.signature = db.jobSignatures.find((signature) => signature.jobId === job.id) || null;
    return result;
  }

  function enrichQuote(quote, include) {
    const result = { ...quote };
    if (include && include.customer) result.customer = clone(customerById(quote.customerId));
    if (include && include.service) result.service = clone(serviceById(quote.serviceId));
    if (include && include.job) result.job = clone(jobById(quote.jobId));
    if (include && include.lineItems) result.lineItems = clone(quoteLineItems(quote.id));
    if (include && include.statusHistory) result.statusHistory = db.quoteStatusHistories.filter((item) => item.quoteId === quote.id);
    return result;
  }

  function enrichInvoice(invoice, include) {
    const result = { ...invoice };
    if (include && include.customer) result.customer = clone(customerById(invoice.customerId));
    if (include && include.service) result.service = clone(serviceById(invoice.serviceId));
    if (include && include.job) result.job = clone(jobById(invoice.jobId));
    if (include && include.payments) result.payments = db.payments.filter((payment) => payment.invoiceId === invoice.id);
    if (include && include.receipts) result.receipts = db.receipts.filter((receipt) => receipt.invoiceId === invoice.id);
    if (include && include.lineItems) result.lineItems = clone(invoiceLineItems(invoice.id));
    if (include && include.statusHistory) result.statusHistory = db.invoiceStatusHistories.filter((item) => item.invoiceId === invoice.id);
    return result;
  }

  function enrichBookingRequest(request, include) {
    if (!request) return null;
    const result = { ...request };
    if (include && include.customer) result.customer = clone(customerById(request.customerId)) || null;
    if (include && include.service) result.service = clone(serviceById(request.serviceId)) || null;
    if (include && include.convertedJob) result.convertedJob = clone(jobById(request.convertedJobId)) || null;
    return result;
  }

  function enrichPayment(payment, include) {
    if (!payment) return null;
    const result = { ...payment };
    if (include && include.receipt) result.receipt = clone(receiptByPaymentId(payment.id)) || null;
    return result;
  }

  function list(name, args = {}, enrich = (x) => x) {
    let records = db[name].filter((record) => matchesWhere(record, args.where));
    if (args.orderBy && args.orderBy.createdAt === 'desc') records = records.sort(byCreatedDesc);
    if (args.skip) records = records.slice(args.skip);
    if (args.take) records = records.slice(0, args.take);
    return clone(records.map((record) => enrich(record, args.include)));
  }

  function first(name, args = {}, enrich = (x) => x) {
    const record = db[name].find((item) => matchesWhere(item, args.where));
    return Promise.resolve(record ? clone(enrich(record, args.include)) : null);
  }

  function makeModel(name, enrich = (x) => x) {
    return {
      findMany: (args) => Promise.resolve(list(name, args, enrich)),
      count: (args = {}) => Promise.resolve(db[name].filter((record) => matchesWhere(record, args.where)).length),
      findFirst: (args) => first(name, args, enrich),
      findUnique: (args = {}) => {
        const record = db[name].find((item) => matchesWhere(item, args.where));
        const enriched = record ? enrich(record, args.include) : null;
        return Promise.resolve(args.select ? applySelect(enriched, args.select) : clone(enriched));
      },
      create: (args) => {
        const record = { id: args.data.id || id(name), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...stripUndefined(args.data) };
        db[name].push(record);
        return Promise.resolve(args.select ? applySelect(enrich(record, args.include), args.select) : clone(enrich(record, args.include)));
      },
      update: (args) => {
        const index = db[name].findIndex((item) => matchesWhere(item, args.where));
        if (index === -1) throw new Error(`${name} not found`);
        db[name][index] = { ...db[name][index], ...stripUndefined(args.data), updatedAt: new Date().toISOString() };
        return Promise.resolve(args.select ? applySelect(enrich(db[name][index], args.include), args.select) : clone(enrich(db[name][index], args.include)));
      },
      delete: (args) => {
        const index = db[name].findIndex((item) => matchesWhere(item, args.where));
        const [record] = db[name].splice(index, 1);
        return Promise.resolve(clone(record));
      },
      deleteMany: (args) => {
        const before = db[name].length;
        db[name] = db[name].filter((item) => !matchesWhere(item, args.where));
        return Promise.resolve({ count: before - db[name].length });
      },
      upsert: (args) => {
        const index = db[name].findIndex((item) => matchesWhere(item, args.where));
        if (index === -1) {
          const record = { id: args.create.id || id(name), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...stripUndefined(args.create) };
          db[name].push(record);
          return Promise.resolve(clone(enrich(record, args.include)));
        }
        db[name][index] = { ...db[name][index], ...stripUndefined(args.update), updatedAt: new Date().toISOString() };
        return Promise.resolve(clone(enrich(db[name][index], args.include)));
      }
    };
  }

  return {
    user: {
      findUnique: (args = {}) => {
        const record = db.users.find((item) => matchesWhere(item, args.where));
        const enriched = record ? enrichUser(record) : null;
        return Promise.resolve(args.select ? applySelect(enriched, args.select) : clone(enriched));
      },
      create: async (args) => {
        const workerCreate = args.data.worker && args.data.worker.create;
        const record = { id: id('user'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...stripUndefined({ ...args.data, worker: undefined }) };
        db.users.push(record);
        if (workerCreate) db.workerProfiles.push({ id: id('worker'), userId: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt, ...workerCreate });
        const enriched = enrichUser(record);
        return args.select ? applySelect(enriched, args.select) : clone(enriched);
      }
    },
    company: makeModel('companies', enrichCompany),
    companyBranding: {
      ...makeModel('companyBrandings'),
      upsert: async (args) => {
        const index = db.companyBrandings.findIndex((item) => item.companyId === args.where.companyId);
        if (index === -1) {
          const record = { id: id('branding'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...stripUndefined(args.create) };
          db.companyBrandings.push(record);
          return clone(record);
        }
        db.companyBrandings[index] = { ...db.companyBrandings[index], ...stripUndefined(args.update), updatedAt: new Date().toISOString() };
        return clone(db.companyBrandings[index]);
      }
    },
    customer: makeModel('customers'),
    workerProfile: makeModel('workerProfiles', enrichWorker),
    service: makeModel('services'),
    job: makeModel('jobs', enrichJob),
    quote: {
      ...makeModel('quotes', enrichQuote),
      groupBy: (args) => {
        const groups = new Map();
        db.quotes.filter((item) => matchesWhere(item, args.where)).forEach((item) => groups.set(item.status, (groups.get(item.status) || 0) + 1));
        return Promise.resolve(Array.from(groups.entries()).map(([status, count]) => ({ status, _count: count })));
      }
    },
    invoice: makeModel('invoices', enrichInvoice),
    quoteLineItem: makeModel('quoteLineItems'),
    quoteStatusHistory: makeModel('quoteStatusHistories'),
    companyInvoiceCounter: makeModel('companyInvoiceCounters'),
    companySchedulingSettings: makeModel('companySchedulingSettings'),
    workerRole: makeModel('workerRoles'),
    roleAvailability: makeModel('roleAvailabilities'),
    workerAvailability: makeModel('workerAvailabilities'),
    workerTimeOff: makeModel('workerTimeOff'),
    scheduleConflict: makeModel('scheduleConflicts'),
    recurringJobRule: makeModel('recurringJobRules'),
    invoiceLineItem: makeModel('invoiceLineItems'),
    invoiceStatusHistory: makeModel('invoiceStatusHistories'),
    receipt: makeModel('receipts'),
    scheduleItem: makeModel('scheduleItems'),
    payment: makeModel('payments', enrichPayment),
    workerLocation: makeModel('workerLocations'),
    jobProofPhoto: makeModel('jobProofPhotos'),
    jobSignature: makeModel('jobSignatures'),
    bookingRequest: makeModel('bookingRequests', enrichBookingRequest),
    jobActivity: makeModel('jobActivities', (activity, include) => {
      const result = { ...activity };
      if (include && include.worker) result.worker = enrichWorker(workerById(activity.workerId), include.worker.include);
      if (include && include.user) result.user = include.user.select ? applySelect(userById(activity.userId), include.user.select) : clone(userById(activity.userId));
      if (include && include.job) result.job = enrichJob(jobById(activity.jobId), include.job.include);
      return result;
    }),
    auditLog: makeModel('auditLogs'),
    $transaction: (fn) => fn(createMockPrisma(db)),
    $disconnect: () => Promise.resolve()
  };
}

async function buildApp() {
  const hash = await bcrypt.hash('Password123!', 4);
  const todayStart = new Date();
  todayStart.setHours(9, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(10, 0, 0, 0);
  const otherWorkerStart = new Date(todayStart);
  otherWorkerStart.setHours(11, 0, 0, 0);
  const upcomingStart = new Date(todayStart);
  upcomingStart.setDate(upcomingStart.getDate() + 1);
  const seed = {
    companies: [{ id: 'company-a', name: 'Company A', email: 'hello@a.test', phone: '+1 A' }, { id: 'company-b', name: 'Company B', email: 'hello@b.test', phone: '+1 B' }],
    companyBrandings: [
      { id: 'branding-a', companyId: 'company-a', brandName: 'Brand A', primaryColor: '#111111', secondaryColor: '#222222', accentColor: '#333333', supportEmail: 'support@a.test', supportPhone: '+1 A', invoiceFooter: 'Footer A', invoiceTerms: 'Terms A' },
      { id: 'branding-b', companyId: 'company-b', brandName: 'Brand B', primaryColor: '#444444', secondaryColor: '#555555', accentColor: '#666666', supportEmail: 'support@b.test', supportPhone: '+1 B', invoiceFooter: 'Footer B', invoiceTerms: 'Terms B' }
    ],
    users: [
      { id: 'owner-a', companyId: 'company-a', email: 'owner-a@test.local', name: 'Owner A', role: 'OWNER', passwordHash: hash },
      { id: 'admin-a', companyId: 'company-a', email: 'admin-a@test.local', name: 'Admin A', role: 'ADMIN', passwordHash: hash },
      { id: 'worker-a', companyId: 'company-a', email: 'worker-a@test.local', name: 'Worker A', role: 'WORKER', passwordHash: hash },
      { id: 'worker-b', companyId: 'company-a', email: 'worker-b@test.local', name: 'Worker B', role: 'WORKER', passwordHash: hash },
      { id: 'admin-b', companyId: 'company-b', email: 'admin-b@test.local', name: 'Admin B', role: 'ADMIN', passwordHash: hash },
      { id: 'worker-c', companyId: 'company-b', email: 'worker-c@test.local', name: 'Worker C', role: 'WORKER', passwordHash: hash }
    ],
    workerProfiles: [
      { id: 'wp-a', companyId: 'company-a', userId: 'worker-a', roleId: 'role-tech-a', title: 'Tech', active: true },
      { id: 'wp-b', companyId: 'company-a', userId: 'worker-b', roleId: 'role-tech-a', title: 'Tech', active: true },
      { id: 'wp-c', companyId: 'company-b', userId: 'worker-c', roleId: 'role-tech-b', title: 'Tech', active: true }
    ],
    customers: [
      { id: 'customer-a', companyId: 'company-a', name: 'Customer A', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'customer-b', companyId: 'company-b', name: 'Customer B', createdAt: '2026-01-01T00:00:00.000Z' }
    ],
    services: [
      { id: 'service-a', companyId: 'company-a', name: 'Service A', active: true, price: 100, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'service-b', companyId: 'company-b', name: 'Service B', active: true, price: 200, createdAt: '2026-01-01T00:00:00.000Z' }
    ],
    jobs: [
      { id: 'job-a', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', workerId: 'wp-a', title: 'Assigned A', status: 'SCHEDULED', scheduledStart: todayStart.toISOString(), scheduledEnd: todayEnd.toISOString(), total: 100, createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'job-other-worker', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', workerId: 'wp-b', title: 'Assigned B', status: 'SCHEDULED', scheduledStart: otherWorkerStart.toISOString(), total: 100, createdAt: '2026-01-03T00:00:00.000Z' },
      { id: 'job-b', companyId: 'company-b', customerId: 'customer-b', serviceId: 'service-b', workerId: 'wp-c', title: 'Company B Job', status: 'SCHEDULED', scheduledStart: upcomingStart.toISOString(), total: 200, createdAt: '2026-01-04T00:00:00.000Z' }
    ],
    quotes: [{ id: 'quote-a', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', jobId: 'job-a', title: 'Quote A', status: 'SENT', amount: 100, subtotal: 100, total: 100, createdAt: '2026-01-01T00:00:00.000Z' }],
    quoteLineItems: [{ id: 'qli-a', companyId: 'company-a', quoteId: 'quote-a', serviceId: 'service-a', description: 'Service A', quantity: 1, unitPrice: 100, discountAmount: 0, taxAmount: 0, lineTotal: 100, sortOrder: 0 }],
    quoteStatusHistories: [],
    companyInvoiceCounters: [{ id: 'counter-a', companyId: 'company-a', prefix: 'INV', nextNumber: 7, padding: 4 }, { id: 'counter-b', companyId: 'company-b', prefix: 'INV', nextNumber: 1, padding: 4 }],
    invoices: [{ id: 'invoice-a', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', jobId: 'job-a', number: 'INV-A', status: 'SENT', amount: 100, subtotal: 100, total: 100, balanceDue: 100, createdAt: '2026-01-01T00:00:00.000Z' }],
    invoiceLineItems: [{ id: 'ili-a', companyId: 'company-a', invoiceId: 'invoice-a', serviceId: 'service-a', description: 'Service A', quantity: 1, unitPrice: 100, discountAmount: 0, taxAmount: 0, lineTotal: 100, sortOrder: 0 }],
    invoiceStatusHistories: [],
    receipts: [],
    workerRoles: [
      { id: 'role-tech-a', companyId: 'company-a', name: 'Tech', active: true },
      { id: 'role-tech-b', companyId: 'company-b', name: 'Tech', active: true }
    ],
    roleAvailabilities: [],
    companySchedulingSettings: [
      { id: 'settings-a', companyId: 'company-a', defaultJobDurationMinutes: 60, defaultTravelBufferMinutes: 0, allowOverbooking: false, timezone: 'UTC', workingDayStart: '08:00', workingDayEnd: '17:00' },
      { id: 'settings-b', companyId: 'company-b', defaultJobDurationMinutes: 60, defaultTravelBufferMinutes: 0, allowOverbooking: false, timezone: 'UTC', workingDayStart: '08:00', workingDayEnd: '17:00' }
    ],
    workerAvailabilities: [],
    workerTimeOff: [],
    scheduleConflicts: [],
    recurringJobRules: [],
    scheduleItems: [],
    payments: [],
    workerLocations: [],
    jobProofPhotos: [],
    jobSignatures: [],
    bookingRequests: [],
    jobActivities: [],
    auditLogs: []
  };

  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: createMockPrisma(seed) } };
  for (const mod of ['../src/auth', '../src/routes/api', '../src/app']) {
    const resolved = require.resolve(mod);
    delete require.cache[resolved];
  }
  const app = require('../src/app').app;
  app.locals.testDb = seed;
  return app;
}

async function login(app, email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password: 'Password123!' });
  assert.equal(response.status, 200);
  assertNoPasswordHash(response.body);
  return agent;
}

function assertNoPasswordHash(value) {
  assert.equal(JSON.stringify(value).includes('passwordHash'), false, 'response leaked passwordHash');
}

test('owner can log in without passwordHash leak', async () => {
  const app = await buildApp();
  const response = await request(app).post('/api/auth/login').send({ email: 'owner-a@test.local', password: 'Password123!' });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.role, 'OWNER');
  assertNoPasswordHash(response.body);
});

test('admin can access company records', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const response = await admin.get('/api/customers');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.map((item) => item.id), ['customer-a']);
  assertNoPasswordHash(response.body);
});

test('worker cannot access admin-only records', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');
  for (const path of ['/api/customers', '/api/quotes', '/api/invoices', '/api/workers', '/api/services']) {
    const response = await worker.get(path);
    assert.equal(response.status, 403, path);
    assertNoPasswordHash(response.body);
  }
});

test('worker can only see assigned jobs', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');
  const response = await worker.get('/api/jobs');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.map((item) => item.id), ['job-a']);
  assertNoPasswordHash(response.body);
});

test('company A cannot access company B records', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const customer = await admin.get('/api/customers/customer-b');
  assert.equal(customer.status, 404);
  const job = await admin.get('/api/jobs/job-b');
  assert.equal(job.status, 404);
  assertNoPasswordHash(customer.body);
  assertNoPasswordHash(job.body);
});

test('creating a job with another company customer, service, or worker fails', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const base = { title: 'Bad job', customerId: 'customer-a', serviceId: 'service-a', workerId: 'wp-a' };
  const badCustomer = await admin.post('/api/jobs').send({ ...base, customerId: 'customer-b' });
  const badService = await admin.post('/api/jobs').send({ ...base, serviceId: 'service-b' });
  const badWorker = await admin.post('/api/jobs').send({ ...base, workerId: 'wp-c' });
  assert.equal(badCustomer.status, 404);
  assert.equal(badService.status, 404);
  assert.equal(badWorker.status, 404);
  assertNoPasswordHash(badCustomer.body);
  assertNoPasswordHash(badService.body);
  assertNoPasswordHash(badWorker.body);
});

test('creating quote and invoice with another company job, customer, or service fails', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const quoteBase = { title: 'Bad quote', customerId: 'customer-a', serviceId: 'service-a', jobId: 'job-a', amount: 100 };
  const invoiceBase = { customerId: 'customer-a', serviceId: 'service-a', jobId: 'job-a', amount: 100 };
  for (const body of [
    { ...quoteBase, customerId: 'customer-b' },
    { ...quoteBase, serviceId: 'service-b' },
    { ...quoteBase, jobId: 'job-b' }
  ]) {
    const response = await admin.post('/api/quotes').send(body);
    assert.equal(response.status, 404);
    assertNoPasswordHash(response.body);
  }
  for (const body of [
    { ...invoiceBase, customerId: 'customer-b' },
    { ...invoiceBase, serviceId: 'service-b' },
    { ...invoiceBase, jobId: 'job-b' }
  ]) {
    const response = await admin.post('/api/invoices').send(body);
    assert.equal(response.status, 404);
    assertNoPasswordHash(response.body);
  }
});


test('worker dashboard is worker-specific and assigned-only', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');
  const admin = await login(app, 'admin-a@test.local');

  await worker.post('/api/jobs/job-a/arrive').send({});
  await worker.post('/api/jobs/job-a/start').send({});
  await admin.post('/api/jobs/job-other-worker/arrive').send({});
  await admin.post('/api/jobs/job-other-worker/start').send({});

  const response = await worker.get('/api/dashboard');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.role, 'WORKER');
  assert.equal(Object.prototype.hasOwnProperty.call(response.body.data, 'totals'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body.data, 'revenueMonthToDate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body.data, 'unpaidInvoices'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body.data, 'pipeline'), false);
  assert.deepEqual(response.body.data.jobsToday.map((item) => item.id), ['job-a']);
  assert.equal(response.body.data.jobsToday[0].total, undefined);
  assert.equal(response.body.data.today.activeJob.id, 'job-a');
  assert.equal(response.body.data.today.activeJob.total, undefined);
  assert.equal(response.body.data.recentActivity.every((item) => item.jobId === 'job-a'), true);
  assert.equal(response.body.data.recentActivity.every((item) => !item.job || item.job.total === undefined), true);
  assert.equal(JSON.stringify(response.body).includes('job-other-worker'), false);
  assertNoPasswordHash(response.body);
});

test('admin dashboard still includes admin aggregates', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const response = await admin.get('/api/dashboard');
  assert.equal(response.status, 200);
  assert.ok(response.body.data.totals);
  assert.equal(response.body.data.totals.unpaidInvoices, 100);
  assert.deepEqual(response.body.data.pipeline, { leads: 0, quoted: 1, won: 0 });
  assert.equal(Array.isArray(response.body.data.workers), true);
  assertNoPasswordHash(response.body);
});

test('owner can update branding', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const response = await owner.patch('/api/company/branding').send({ brandName: 'Owner Brand', primaryColor: '#123abc', supportEmail: 'owner-brand@test.local' });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.brandName, 'Owner Brand');
  assert.equal(response.body.data.primaryColor, '#123abc');
  assertNoPasswordHash(response.body);
});

test('admin can update branding', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const response = await admin.patch('/api/company/branding').send({ brandName: 'Admin Brand', secondaryColor: '#abcdef', supportPhone: '+263 123' });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.brandName, 'Admin Brand');
  assert.equal(response.body.data.secondaryColor, '#abcdef');
  assertNoPasswordHash(response.body);
});

test('worker cannot update branding', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');
  const response = await worker.patch('/api/company/branding').send({ brandName: 'Worker Brand', primaryColor: '#123456' });
  assert.equal(response.status, 403);
  assertNoPasswordHash(response.body);
});

test('company A cannot access company B branding', async () => {
  const app = await buildApp();
  const adminA = await login(app, 'admin-a@test.local');
  const adminB = await login(app, 'admin-b@test.local');
  const aBranding = await adminA.get('/api/company/branding');
  const bBranding = await adminB.get('/api/company/branding');
  assert.equal(aBranding.status, 200);
  assert.equal(bBranding.status, 200);
  assert.equal(aBranding.body.data.brandName, 'Brand A');
  assert.equal(bBranding.body.data.brandName, 'Brand B');
  assert.notEqual(aBranding.body.data.companyId, bBranding.body.data.companyId);
  assertNoPasswordHash(aBranding.body);
  assertNoPasswordHash(bBranding.body);
});

test('invalid branding color fails', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const response = await admin.patch('/api/company/branding').send({ primaryColor: 'blue' });
  assert.equal(response.status, 400);
  assertNoPasswordHash(response.body);
});

test('invalid branding email fails', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const response = await admin.patch('/api/company/branding').send({ supportEmail: 'not-an-email' });
  assert.equal(response.status, 400);
  assertNoPasswordHash(response.body);
});

test('branding responses do not leak sensitive user data', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');
  const response = await worker.get('/api/company/branding');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.brandName, 'Brand A');
  assert.equal(JSON.stringify(response.body).includes('user'), false);
  assertNoPasswordHash(response.body);
});
test('all sampled API responses omit passwordHash', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const paths = ['/api/auth/me', '/api/dashboard', '/api/customers', '/api/workers', '/api/jobs', '/api/quotes', '/api/invoices'];
  for (const path of paths) {
    const response = await admin.get(path);
    assert.ok(response.status < 500, path);
    assertNoPasswordHash(response.body);
  }
});


test('quote engine calculates totals and accept is idempotent', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const created = await admin.post('/api/quotes').send({
    customerId: 'customer-a',
    serviceId: 'service-a',
    title: 'Calculated Quote',
    lineItems: [{ description: 'Labor', quantity: 2, unitPrice: 100, discountAmount: 10, taxAmount: 5 }]
  });
  assert.equal(created.status, 201);
  assert.equal(Number(created.body.data.subtotal), 200);
  assert.equal(Number(created.body.data.discountTotal), 10);
  assert.equal(Number(created.body.data.taxTotal), 5);
  assert.equal(Number(created.body.data.total), 195);

  const sent = await admin.post('/api/quotes/' + created.body.data.id + '/send').send({});
  assert.equal(sent.status, 200);
  assert.equal(sent.body.data.status, 'SENT');
  assert.equal(sent.body.data.statusHistory.length, 2);

  const accepted = await admin.post('/api/quotes/' + created.body.data.id + '/accept').send({});
  const acceptedAgain = await admin.post('/api/quotes/' + created.body.data.id + '/accept').send({});
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.status, 'ACCEPTED');
  assert.equal(accepted.body.data.jobId, acceptedAgain.body.data.jobId);
  assertNoPasswordHash(accepted.body);
});

test('completed job creates one invoice and payments create one receipt', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const complete = await admin.post('/api/jobs/job-other-worker/complete').send({ completionNotes: 'Done', adminOverride: true });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.data.status, 'COMPLETED');

  const invoice = await admin.post('/api/jobs/job-other-worker/create-invoice').send({});
  const invoiceAgain = await admin.post('/api/jobs/job-other-worker/create-invoice').send({});
  assert.equal(invoice.status, 201);
  assert.equal(invoice.body.data.id, invoiceAgain.body.data.id);
  assert.equal(invoice.body.data.number, 'INV-0007');

  const partial = await admin.post('/api/invoices/' + invoice.body.data.id + '/payments').send({ amount: 40, method: 'CASH', status: 'CONFIRMED' });
  assert.equal(partial.status, 201);
  assert.equal(partial.body.data.status, 'PARTIALLY_PAID');
  assert.equal(Number(partial.body.data.balanceDue), 60);

  const payments = await admin.get('/api/invoices/' + invoice.body.data.id + '/payments');
  const confirmAgain = await admin.post('/api/payments/' + payments.body.data[0].id + '/confirm').send({});
  const receipts = await admin.get('/api/invoices/' + invoice.body.data.id + '/receipts');
  assert.equal(confirmAgain.status, 200);
  assert.equal(receipts.body.data.length, 1);
  assertNoPasswordHash(receipts.body);
});

test('job invoice creation skips stale invoice counter numbers', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');

  const conflicting = await admin.post('/api/invoices').send({
    number: 'INV-0007',
    customerId: 'customer-a',
    serviceId: 'service-a',
    amount: 25
  });
  assert.equal(conflicting.status, 201);
  assert.equal(conflicting.body.data.number, 'INV-0007');

  const complete = await admin.post('/api/jobs/job-other-worker/complete').send({ completionNotes: 'Done', adminOverride: true });
  assert.equal(complete.status, 200);

  const invoice = await admin.post('/api/jobs/job-other-worker/create-invoice').send({});
  assert.equal(invoice.status, 201);
  assert.equal(invoice.body.data.number, 'INV-0008');

  const invoiceAgain = await admin.post('/api/jobs/job-other-worker/create-invoice').send({});
  assert.equal(invoiceAgain.status, 200);
  assert.equal(invoiceAgain.body.data.id, invoice.body.data.id);
});
test('admin can save job defaults in scheduling settings', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const saved = await admin.patch('/api/company/scheduling-settings').send({
    defaultJobDurationMinutes: 120,
    defaultTravelBufferMinutes: 15,
    defaultJobStatus: 'SCHEDULED',
    requireCompletionNotes: false,
    requireProofPhotos: false,
    autoCreateScheduleOnAssign: true,
    workingDayStart: '07:00',
    workingDayEnd: '18:00'
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.defaultJobDurationMinutes, 120);
  assert.equal(saved.body.data.defaultJobStatus, 'SCHEDULED');
  assert.equal(saved.body.data.requireCompletionNotes, false);
  assert.equal(saved.body.data.requireProofPhotos, false);
  assert.equal(saved.body.data.autoCreateScheduleOnAssign, true);

  const loaded = await admin.get('/api/company/scheduling-settings');
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.data.defaultJobDurationMinutes, 120);
  assert.equal(loaded.body.data.defaultJobStatus, 'SCHEDULED');
  assert.equal(loaded.body.data.workingDayStart, '07:00');
});
test('admin can schedule and worker sees only own schedule', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-b@test.local');

  const scheduled = await admin.post('/api/jobs/job-other-worker/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-02T10:00:00.000Z', durationMinutes: 60 });
  assert.equal(scheduled.status, 201);
  assert.equal(scheduled.body.data.workerId, 'wp-b');
  assert.equal(scheduled.body.data.conflictStatus, 'CLEAR');

  const workerSchedule = await worker.get('/api/schedule');
  assert.equal(workerSchedule.status, 200);
  assert.equal(workerSchedule.body.data.length, 1);
  assert.equal(workerSchedule.body.data[0].jobId, 'job-other-worker');
});

test('schedule company and worker scoping is enforced', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');

  const workerSchedule = await worker.post('/api/jobs/job-other-worker/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-02T10:00:00.000Z', durationMinutes: 60, adminOverride: true });
  assert.equal(workerSchedule.status, 403);

  const otherCompanyJob = await admin.post('/api/jobs/job-b/schedule').send({ workerId: 'wp-a', startsAt: '2026-02-02T10:00:00.000Z', durationMinutes: 60 });
  assert.equal(otherCompanyJob.status, 404);

  const otherCompanyWorker = await admin.post('/api/jobs/job-other-worker/schedule').send({ workerId: 'wp-c', startsAt: '2026-02-02T10:00:00.000Z', durationMinutes: 60 });
  assert.equal(otherCompanyWorker.status, 404);
});

test('overlaps travel buffer time off availability and working hours block scheduling', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');

  const first = await admin.post('/api/jobs/job-other-worker/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-02T10:00:00.000Z', durationMinutes: 60, travelBufferMinutes: 30 });
  assert.equal(first.status, 201);

  const secondJob = await admin.post('/api/jobs').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Overlap target', total: 50 });
  assert.equal(secondJob.status, 201);
  const overlap = await admin.post('/api/jobs/' + secondJob.body.data.id + '/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-02T11:15:00.000Z', durationMinutes: 30 });
  assert.equal(overlap.status, 409);
  assert.equal(overlap.body.error.details.conflicts.some((item) => item.type === 'OVERLAP'), true);

  const timeOff = await admin.post('/api/workers/wp-b/time-off').send({ startsAt: '2026-02-03T09:00:00.000Z', endsAt: '2026-02-03T12:00:00.000Z', status: 'APPROVED' });
  assert.equal(timeOff.status, 201);
  const timeOffJob = await admin.post('/api/jobs').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Time off target', total: 50 });
  const timeOffBlocked = await admin.post('/api/jobs/' + timeOffJob.body.data.id + '/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-03T10:00:00.000Z', durationMinutes: 30 });
  assert.equal(timeOffBlocked.status, 409);
  assert.equal(timeOffBlocked.body.error.details.conflicts.some((item) => item.type === 'TIME_OFF'), true);

  const roleAvailability = await admin.put('/api/worker-roles/role-tech-a/availability').send([{ dayOfWeek: 4, startTime: '08:00', endTime: '12:00' }]);
  assert.equal(roleAvailability.status, 200);
  const roleAvailabilityJob = await admin.post('/api/jobs').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Role availability target', total: 50 });
  const roleAvailabilityBlocked = await admin.post('/api/jobs/' + roleAvailabilityJob.body.data.id + '/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-05T13:00:00.000Z', durationMinutes: 30 });
  assert.equal(roleAvailabilityBlocked.status, 409);
  assert.equal(roleAvailabilityBlocked.body.error.details.conflicts.some((item) => item.type === 'OUTSIDE_AVAILABILITY'), true);
  const roleAvailabilityOverride = await admin.post('/api/jobs/' + roleAvailabilityJob.body.data.id + '/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-05T13:00:00.000Z', durationMinutes: 30, adminOverride: true });
  assert.equal(roleAvailabilityOverride.status, 201);
  assert.equal(roleAvailabilityOverride.body.data.conflictStatus, 'OVERRIDE');
  const availability = await admin.put('/api/workers/wp-b/availability').send([{ dayOfWeek: 3, startTime: '08:00', endTime: '12:00' }]);
  assert.equal(availability.status, 200);
  const availabilityJob = await admin.post('/api/jobs').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Availability target', total: 50 });
  const availabilityBlocked = await admin.post('/api/jobs/' + availabilityJob.body.data.id + '/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-04T13:00:00.000Z', durationMinutes: 30 });
  assert.equal(availabilityBlocked.status, 409);
  assert.equal(availabilityBlocked.body.error.details.conflicts.some((item) => item.type === 'OUTSIDE_AVAILABILITY'), true);
  const availabilityOverride = await admin.post('/api/jobs/' + availabilityJob.body.data.id + '/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-04T13:00:00.000Z', durationMinutes: 30, adminOverride: true });
  assert.equal(availabilityOverride.status, 201);
  assert.equal(availabilityOverride.body.data.conflictStatus, 'OVERRIDE');

  const settings = await admin.patch('/api/company/scheduling-settings').send({ workingDayStart: '08:00', workingDayEnd: '17:00' });
  assert.equal(settings.status, 200);
  const lateJob = await admin.post('/api/jobs').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Late target', total: 50 });
  const outsideHours = await admin.post('/api/jobs/' + lateJob.body.data.id + '/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-05T18:00:00.000Z', durationMinutes: 30 });
  assert.equal(outsideHours.status, 409);
  assert.equal(outsideHours.body.error.details.conflicts.some((item) => item.type === 'OUTSIDE_WORKING_HOURS'), true);
});

test('admin override reschedule and unschedule update schedules safely', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');

  const first = await admin.post('/api/jobs/job-other-worker/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-02T10:00:00.000Z', durationMinutes: 60 });
  assert.equal(first.status, 201);
  const other = await admin.post('/api/jobs').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Override target', total: 50 });
  const override = await admin.post('/api/jobs/' + other.body.data.id + '/schedule').send({ workerId: 'wp-b', startsAt: '2026-02-02T10:30:00.000Z', durationMinutes: 30, adminOverride: true });
  assert.equal(override.status, 201);
  assert.equal(override.body.data.conflictStatus, 'OVERRIDE');

  const rescheduled = await admin.post('/api/jobs/' + other.body.data.id + '/reschedule').send({ workerId: 'wp-b', startsAt: '2026-02-06T10:00:00.000Z', durationMinutes: 30 });
  assert.equal(rescheduled.status, 201);
  const schedule = await admin.get('/api/schedule');
  assert.equal(schedule.body.data.filter((item) => item.jobId === other.body.data.id && item.status === 'SCHEDULED').length, 1);

  const unscheduled = await admin.post('/api/jobs/' + other.body.data.id + '/unschedule').send({});
  assert.equal(unscheduled.status, 200);
  assert.equal(unscheduled.body.data.scheduledStart, null);
});

test('recurring rule creates next job and avoids duplicate period generation', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const rule = await admin.post('/api/recurring-jobs').send({ customerId: 'customer-a', serviceId: 'service-a', workerId: 'wp-b', title: 'Weekly maintenance', frequency: 'WEEKLY', startDate: '2026-02-02T00:00:00.000Z', preferredTime: '10:00', durationMinutes: 60 });
  assert.equal(rule.status, 201);

  const first = await admin.post('/api/recurring-jobs/' + rule.body.data.id + '/generate-next').send({});
  assert.equal(first.status, 201);
  assert.equal(first.body.data.job.title, 'Weekly maintenance');

  const duplicate = await admin.post('/api/recurring-jobs/' + rule.body.data.id + '/generate-next').send({});
  assert.equal(duplicate.status, 201);
  assert.notEqual(duplicate.body.data.job.id, first.body.data.job.id);
  assert.notEqual(duplicate.body.data.job.scheduledStart, first.body.data.job.scheduledStart);
});
test('paid invoices cannot be edited and workers cannot access receipts', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');
  const pay = await admin.post('/api/invoices/invoice-a/payments').send({ amount: 100, method: 'CASH', status: 'CONFIRMED' });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.data.status, 'PAID');
  const edit = await admin.patch('/api/invoices/invoice-a').send({ dueDate: '2026-02-01' });
  assert.equal(edit.status, 409);
  const receipts = await worker.get('/api/invoices/invoice-a/receipts');
  assert.equal(receipts.status, 403);
});

test('worker job lifecycle and activity timeline are scoped and recorded', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');

  const ownJobs = await worker.get('/api/worker/jobs');
  assert.equal(ownJobs.status, 200);
  assert.deepEqual(ownJobs.body.data.map((item) => item.id), ['job-a']);

  const otherWorker = await worker.post('/api/jobs/job-other-worker/arrive').send({});
  assert.equal(otherWorker.status, 404);

  const arrived = await worker.post('/api/jobs/job-a/arrive').send({});
  assert.equal(arrived.status, 200);
  assert.equal(arrived.body.data.status, 'ARRIVED');
  assert.ok(arrived.body.data.arrivedAt);

  const started = await worker.post('/api/jobs/job-a/start').send({});
  assert.equal(started.status, 200);
  assert.equal(started.body.data.status, 'IN_PROGRESS');

  const paused = await worker.post('/api/jobs/job-a/pause').send({});
  assert.equal(paused.status, 200);
  assert.equal(paused.body.data.status, 'PAUSED');

  const resumed = await worker.post('/api/jobs/job-a/resume').send({});
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.data.status, 'IN_PROGRESS');

  const missingNotes = await worker.post('/api/jobs/job-a/complete').send({});
  assert.equal(missingNotes.status, 400);

  const completed = await worker.post('/api/jobs/job-a/complete').send({ completionNotes: 'Finished cleanly' });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.status, 'COMPLETED');
  assert.equal(completed.body.data.completionNotes, 'Finished cleanly');

  const completedAgain = await worker.post('/api/jobs/job-a/complete').send({ completionNotes: 'Second note ignored' });
  assert.equal(completedAgain.status, 200);
  assert.equal(completedAgain.body.data.id, completed.body.data.id);
  assert.equal(completedAgain.body.data.completionNotes, 'Finished cleanly');

  const activity = await worker.get('/api/jobs/job-a/activity');
  assert.equal(activity.status, 200);
  assert.deepEqual(activity.body.data.map((item) => item.type).reverse(), ['ARRIVED', 'STARTED', 'PAUSED', 'RESUMED', 'COMPLETED']);
  assertNoPasswordHash(activity.body);
});

test("job completion evidence uploads are scoped and required", async () => {
  const app = await buildApp();
  const admin = await login(app, "admin-a@test.local");
  const worker = await login(app, "worker-a@test.local");

  const otherWorker = await worker.post("/api/jobs/job-other-worker/proof-photos").attach("photo", Buffer.from("fake"), { filename: "proof.jpg", contentType: "image/jpeg" });
  assert.equal(otherWorker.status, 404);

  const invalid = await worker.post("/api/jobs/job-a/proof-photos").attach("photo", Buffer.from("fake"), { filename: "proof.txt", contentType: "text/plain" });
  assert.equal(invalid.status, 400);

  const configured = await admin.patch("/api/jobs/job-a").send({ requiresProofPhotos: true, minimumProofPhotos: 1, requiresSignature: true });
  assert.equal(configured.status, 200);
  await worker.post("/api/jobs/job-a/arrive").send({});
  await worker.post("/api/jobs/job-a/start").send({});

  const missingEvidence = await worker.post("/api/jobs/job-a/complete").send({ completionNotes: "Done" });
  assert.equal(missingEvidence.status, 409);
  assert.equal(missingEvidence.body.error.details.proofPhotos.required, true);
  assert.equal(missingEvidence.body.error.details.signature.required, true);

  const workerOverride = await worker.post("/api/jobs/job-a/complete").send({ adminOverride: true });
  assert.equal(workerOverride.status, 403);

  const photo = await worker.post("/api/jobs/job-a/proof-photos").field("caption", "Before panel").attach("photo", Buffer.from("fake image"), { filename: "proof.jpg", contentType: "image/jpeg" });
  assert.equal(photo.status, 201);
  assert.equal(photo.body.data.uploadedById, "worker-a");
  const signature = await worker.post("/api/jobs/job-a/signature").field("signerName", "Customer A").attach("signature", Buffer.from("signature"), { filename: "signature.png", contentType: "image/png" });
  assert.equal(signature.status, 201);
  assert.equal(signature.body.data.capturedById, "worker-a");

  const completed = await worker.post("/api/jobs/job-a/complete").send({ completionNotes: "Evidence complete" });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.status, "COMPLETED");
  assert.equal(completed.body.data.completionEvidence.proofPhotosSatisfied, true);
  assert.equal(completed.body.data.completionEvidence.signatureSatisfied, true);
  assert.ok(completed.body.data.proofCompletedAt);
  assert.ok(completed.body.data.signatureCompletedAt);
  assert.ok(app.locals.testDb.jobActivities.some((item) => item.type === "PROOF_PHOTO_ADDED"));
  assert.ok(app.locals.testDb.jobActivities.some((item) => item.type === "SIGNATURE_ADDED"));
  assert.ok(app.locals.testDb.auditLogs.some((item) => item.entity === "JobProofPhoto"));
  assert.ok(app.locals.testDb.auditLogs.some((item) => item.entity === "JobSignature"));
});

test('admin can operate any company job and add admin notes', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');

  const arrived = await admin.post('/api/jobs/job-other-worker/arrive').send({});
  assert.equal(arrived.status, 200);
  assert.equal(arrived.body.data.status, 'ARRIVED');

  const started = await admin.post('/api/jobs/job-other-worker/start').send({});
  assert.equal(started.status, 200);
  assert.equal(started.body.data.status, 'IN_PROGRESS');

  const note = await admin.post('/api/jobs/job-other-worker/activity').send({ note: 'Customer requested admin follow-up' });
  assert.equal(note.status, 201);
  assert.equal(note.body.data.type, 'ADMIN_NOTE');

  const activity = await admin.get('/api/jobs/job-other-worker/activity');
  assert.equal(activity.status, 200);
  assert.equal(activity.body.data.some((item) => item.type === 'ADMIN_NOTE'), true);
  assertNoPasswordHash(activity.body);
});

test('company A cannot access company B job activity', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const activity = await admin.get('/api/jobs/job-b/activity');
  assert.equal(activity.status, 404);
  const note = await admin.post('/api/jobs/job-b/activity').send({ note: 'Nope' });
  assert.equal(note.status, 404);
  assertNoPasswordHash(activity.body);
  assertNoPasswordHash(note.body);
});


test('public user can submit valid booking request', async () => {
  const app = await buildApp();
  const response = await request(app).post('/api/public/booking-requests').send({ customerName: 'Public Customer', email: 'ignored@test.local', customerEmail: 'public@test.local', customerPhone: '0770000000', address: '123 Test Street', serviceId: 'service-a', preferredDate: '2026-07-02', preferredTimeWindow: 'MORNING', notes: 'Please help', status: 'CONVERTED', companyId: 'company-b' });
  assert.equal(response.status, 201);
  assert.equal(response.body.data.companyId, 'company-a');
  assert.equal(response.body.data.status, 'NEW');
  assert.equal(response.body.data.customerName, 'Public Customer');
  assert.equal(response.body.data.serviceId, 'service-a');
  assertNoPasswordHash(response.body);
});

test('public booking request validation and public services are safe', async () => {
  const app = await buildApp();
  const missingName = await request(app).post('/api/public/booking-requests').send({ customerEmail: 'public@test.local' });
  assert.equal(missingName.status, 400);
  const missingContact = await request(app).post('/api/public/booking-requests').send({ customerName: 'Public Customer' });
  assert.equal(missingContact.status, 400);
  const services = await request(app).get('/api/public/services');
  assert.equal(services.status, 200);
  assert.deepEqual(Object.keys(services.body.data[0]).sort(), ['basePrice', 'description', 'id', 'name']);
  assertNoPasswordHash(services.body);
});

test('admin can list review decline and convert booking requests', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');
  const created = await request(app).post('/api/public/booking-requests').send({ customerName: 'Convert Me', customerEmail: 'convert@test.local', customerPhone: '0771111111', address: 'Convert Address', serviceId: 'service-a', preferredTimeWindow: 'AFTERNOON', notes: 'Needs a job' });
  assert.equal(created.status, 201);
  const workerList = await worker.get('/api/booking-requests');
  assert.equal(workerList.status, 403);
  const list = await admin.get('/api/booking-requests');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.some((item) => item.id === created.body.data.id), true);
  const reviewed = await admin.post('/api/booking-requests/' + created.body.data.id + '/review').send({});
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.data.status, 'REVIEWED');
  const converted = await admin.post('/api/booking-requests/' + created.body.data.id + '/convert').send({});
  assert.equal(converted.status, 201);
  assert.equal(converted.body.data.status, 'CONVERTED');
  assert.ok(converted.body.data.convertedJobId);
  assert.equal(app.locals.testDb.jobs.some((job) => job.id === converted.body.data.convertedJobId && job.customerId === converted.body.data.customerId), true);
  const convertedAgain = await admin.post('/api/booking-requests/' + created.body.data.id + '/convert').send({});
  assert.equal(convertedAgain.status, 200);
  assert.equal(convertedAgain.body.data.convertedJobId, converted.body.data.convertedJobId);
  const declineSource = await request(app).post('/api/public/booking-requests').send({ customerName: 'Decline Me', customerPhone: '0772222222' });
  const declined = await admin.post('/api/booking-requests/' + declineSource.body.data.id + '/decline').send({});
  assert.equal(declined.status, 200);
  assert.equal(declined.body.data.status, 'DECLINED');
  assertNoPasswordHash(converted.body);
});

test('company A cannot see company B booking requests', async () => {
  const app = await buildApp();
  app.locals.testDb.bookingRequests.push({ id: 'booking-b', companyId: 'company-b', customerName: 'Company B Request', customerPhone: '555', status: 'NEW', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  const admin = await login(app, 'admin-a@test.local');
  const list = await admin.get('/api/booking-requests');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.some((item) => item.id === 'booking-b'), false);
  const detail = await admin.get('/api/booking-requests/booking-b');
  assert.equal(detail.status, 404);
  assertNoPasswordHash(list.body);
});
