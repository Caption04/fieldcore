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
  const id = (prefix) => `${prefix}-${next++}`;

  function companyById(companyId) { return db.companies.find((item) => item.id === companyId); }
  function brandingByCompanyId(companyId) { return db.companyBrandings.find((item) => item.companyId === companyId); }
  function userById(userId) { return db.users.find((item) => item.id === userId); }
  function customerById(customerId) { return db.customers.find((item) => item.id === customerId); }
  function serviceById(serviceId) { return db.services.find((item) => item.id === serviceId); }
  function workerById(workerId) { return db.workerProfiles.find((item) => item.id === workerId); }
  function jobById(jobId) { return db.jobs.find((item) => item.id === jobId); }
  function invoiceById(invoiceId) { return db.invoices.find((item) => item.id === invoiceId); }

  function enrichCompany(company, include) {
    if (!company) return null;
    const result = { ...company };
    if (include && include.branding) result.branding = clone(brandingByCompanyId(company.id)) || null;
    return result;
  }

  function enrichUser(user) {
    if (!user) return null;
    return { ...user, company: companyById(user.companyId), worker: db.workerProfiles.find((worker) => worker.userId === user.id) || null };
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
    if (include && include.photos) result.photos = db.jobPhotos.filter((photo) => photo.jobId === job.id);
    return result;
  }

  function enrichQuote(quote, include) {
    const result = { ...quote };
    if (include && include.customer) result.customer = clone(customerById(quote.customerId));
    if (include && include.service) result.service = clone(serviceById(quote.serviceId));
    if (include && include.job) result.job = clone(jobById(quote.jobId));
    return result;
  }

  function enrichInvoice(invoice, include) {
    const result = { ...invoice };
    if (include && include.customer) result.customer = clone(customerById(invoice.customerId));
    if (include && include.service) result.service = clone(serviceById(invoice.serviceId));
    if (include && include.job) result.job = clone(jobById(invoice.jobId));
    if (include && include.payments) result.payments = db.payments.filter((payment) => payment.invoiceId === invoice.id);
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
    scheduleItem: makeModel('scheduleItems'),
    payment: makeModel('payments'),
    workerLocation: makeModel('workerLocations'),
    jobPhoto: makeModel('jobPhotos'),
    auditLog: makeModel('auditLogs'),
    $transaction: (fn) => fn(createMockPrisma(db)),
    $disconnect: () => Promise.resolve()
  };
}

async function buildApp() {
  const hash = await bcrypt.hash('Password123!', 4);
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
      { id: 'wp-a', companyId: 'company-a', userId: 'worker-a', title: 'Tech', active: true },
      { id: 'wp-b', companyId: 'company-a', userId: 'worker-b', title: 'Tech', active: true },
      { id: 'wp-c', companyId: 'company-b', userId: 'worker-c', title: 'Tech', active: true }
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
      { id: 'job-a', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', workerId: 'wp-a', title: 'Assigned A', status: 'SCHEDULED', total: 100, createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'job-other-worker', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', workerId: 'wp-b', title: 'Assigned B', status: 'SCHEDULED', total: 100, createdAt: '2026-01-03T00:00:00.000Z' },
      { id: 'job-b', companyId: 'company-b', customerId: 'customer-b', serviceId: 'service-b', workerId: 'wp-c', title: 'Company B Job', status: 'SCHEDULED', total: 200, createdAt: '2026-01-04T00:00:00.000Z' }
    ],
    quotes: [{ id: 'quote-a', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', jobId: 'job-a', title: 'Quote A', status: 'SENT', amount: 100, createdAt: '2026-01-01T00:00:00.000Z' }],
    invoices: [{ id: 'invoice-a', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', jobId: 'job-a', number: 'INV-A', status: 'SENT', amount: 100, createdAt: '2026-01-01T00:00:00.000Z' }],
    scheduleItems: [],
    payments: [],
    workerLocations: [],
    jobPhotos: [],
    auditLogs: []
  };

  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: createMockPrisma(seed) } };
  for (const mod of ['../src/auth', '../src/routes/api', '../src/app']) {
    const resolved = require.resolve(mod);
    delete require.cache[resolved];
  }
  return require('../src/app').app;
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


test('worker dashboard does not expose admin financial or pipeline aggregates', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');
  const response = await worker.get('/api/dashboard');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.totals.unpaidInvoices, 0);
  assert.deepEqual(response.body.data.pipeline, { leads: 0, quoted: 0, won: 0 });
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
