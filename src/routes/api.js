const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { AppError, asyncHandler, notFound, sendData } = require('../errors');
const {
  COOKIE_NAME,
  SAFE_LOGIN_USER_SELECT,
  SAFE_WORKER_INCLUDE,
  audit,
  clearAuthCookie,
  hashPassword,
  publicUser,
  requireAuth,
  requireRole,
  setAuthCookie,
  verifyPassword
} = require('../auth');

const router = express.Router();

const idParam = z.object({ id: z.string().min(1) });
const amount = z.coerce.number().nonnegative().default(0);
const optionalDate = z.preprocess((value) => value ? new Date(String(value)) : undefined, z.date().optional());
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color');
const optionalText = (max) => z.string().trim().max(max).optional().or(z.literal('')).transform((value) => value || undefined);
const optionalEmail = z.string().email().optional().or(z.literal('')).transform((value) => value || undefined);
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((value) => {
    if (!value) return true;

    if (/^\/uploads\/logos\/[a-zA-Z0-9._-]+$/.test(value)) {
      return true;
    }

    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be a valid URL or uploaded logo path')
  .transform((value) => value || undefined);
const optionalColor = hexColor.optional().or(z.literal('')).transform((value) => value || undefined);
const adminRoles = ['OWNER', 'ADMIN'];

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(parsed.error);
    req[source] = parsed.data;
    next();
  };
}

function normalize(record) {
  if (Array.isArray(record)) return record.map(normalize);
  if (!record || typeof record !== 'object') return record;
  const output = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'passwordHash') continue;
    if (value && typeof value === 'object' && typeof value.toNumber === 'function') output[key] = value.toNumber();
    else if (value instanceof Date) output[key] = value.toISOString();
    else output[key] = normalize(value);
  }
  return output;
}

function pagination(req) {
  const page = Math.max(Number.parseInt(req.query.page || '1', 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '25', 10) || 25, 1), 100);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

function paginationMeta(pageInfo, total) {
  return { pagination: { page: pageInfo.page, limit: pageInfo.limit, total } };
}

async function paged(model, req, args) {
  const pageInfo = pagination(req);
  const [data, total] = await Promise.all([
    model.findMany({ ...args, skip: pageInfo.skip, take: pageInfo.take }),
    model.count({ where: args.where })
  ]);
  return { data, meta: paginationMeta(pageInfo, total) };
}

function workerJobScope(req) {
  if (req.user.role !== 'WORKER') return {};
  return { workerId: req.user.worker ? req.user.worker.id : '__none__' };
}

async function requireCustomer(req, id) {
  const record = await prisma.customer.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Customer not found');
  return record;
}

async function requireService(req, id) {
  if (!id) return null;
  const record = await prisma.service.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Service not found');
  return record;
}

async function requireWorker(req, id) {
  if (!id) return null;
  const record = await prisma.workerProfile.findFirst({ where: { id, companyId: req.companyId }, include: SAFE_WORKER_INCLUDE });
  if (!record) throw notFound('Worker not found');
  return record;
}

async function requireJob(req, id, options = {}) {
  const assignedOnly = options.assignedOnly !== false;
  const record = await prisma.job.findFirst({ where: { id, companyId: req.companyId, ...(assignedOnly ? workerJobScope(req) : {}) } });
  if (!record) throw notFound('Job not found');
  return record;
}

async function requireQuote(req, id) {
  const record = await prisma.quote.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Quote not found');
  return record;
}

async function requireInvoice(req, id) {
  const record = await prisma.invoice.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Invoice not found');
  return record;
}

async function validateJobRelations(req, body) {
  if (body.customerId) await requireCustomer(req, body.customerId);
  if (body.serviceId) await requireService(req, body.serviceId);
  if (body.workerId) await requireWorker(req, body.workerId);
}

async function validateQuoteRelations(req, body) {
  if (body.customerId) await requireCustomer(req, body.customerId);
  if (body.serviceId) await requireService(req, body.serviceId);
  if (body.jobId) await requireJob(req, body.jobId, { assignedOnly: false });
}

async function validateInvoiceRelations(req, body) {
  if (body.customerId) await requireCustomer(req, body.customerId);
  if (body.serviceId) await requireService(req, body.serviceId);
  if (body.jobId) await requireJob(req, body.jobId, { assignedOnly: false });
}

async function validateScheduleRelations(req, body) {
  await requireJob(req, body.jobId, { assignedOnly: false });
  if (body.workerId) await requireWorker(req, body.workerId);
}

const uploadDir = path.resolve(__dirname, '../../uploads/logos');
fs.mkdirSync(uploadDir, { recursive: true });

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.companyId}-${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new AppError('Only PNG, JPG, and WEBP logos are allowed', 400));
    cb(null, true);
  }
});

const companyProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: optionalText(160),
  tradingName: optionalText(160),
  registrationNumber: optionalText(80),
  taxNumber: optionalText(80),
  address: optionalText(300),
  phone: optionalText(60),
  email: optionalEmail
});

const companyBrandingSchema = z.object({
  brandName: optionalText(120),
  logoUrl: optionalUrl,
  primaryColor: optionalColor,
  secondaryColor: optionalColor,
  accentColor: optionalColor,
  supportEmail: optionalEmail,
  supportPhone: optionalText(60),
  websiteUrl: optionalUrl,
  invoiceFooter: optionalText(500),
  invoiceTerms: optionalText(1000)
});

function brandingDefaults(company) {
  return {
    id: null,
    companyId: company.id,
    brandName: company.tradingName || company.name || 'FieldCore',
    logoUrl: null,
    primaryColor: '#2363ff',
    secondaryColor: '#263ff1',
    accentColor: '#12a96d',
    supportEmail: company.email || null,
    supportPhone: company.phone || null,
    websiteUrl: null,
    invoiceFooter: null,
    invoiceTerms: null
  };
}

async function getCompanyWithBranding(companyId) {
  return prisma.company.findUnique({ where: { id: companyId }, include: { branding: true } });
}

function publicBranding(company) {
  return normalize(company.branding || brandingDefaults(company));
}

function profileResponse(company) {
  return normalize({
    id: company.id,
    name: company.name,
    legalName: company.legalName,
    tradingName: company.tradingName,
    registrationNumber: company.registrationNumber,
    taxNumber: company.taxNumber,
    address: company.address,
    phone: company.phone,
    email: company.email,
    branding: publicBranding(company)
  });
}
const registerSchema = z.object({
  companyName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1)
});

router.post('/auth/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const user = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: req.body.companyName } });
    return tx.user.create({
      data: {
        companyId: company.id,
        email: req.body.email,
        name: req.body.name,
        role: 'OWNER',
        passwordHash: await hashPassword(req.body.password)
      },
      select: SAFE_LOGIN_USER_SELECT
    });
  });
  setAuthCookie(res, user);
  await audit({ companyId: user.companyId, user }, 'REGISTER', 'User', user.id, { companyName: user.company && user.company.name });
  sendData(res, publicUser(user), 201);
}));

router.post('/auth/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email }, select: SAFE_LOGIN_USER_SELECT });
  if (!user || !(await verifyPassword(req.body.password, user.passwordHash))) throw new AppError(401, 'Invalid email or password');
  setAuthCookie(res, user);
  await audit({ companyId: user.companyId, user }, 'LOGIN', 'User', user.id);
  sendData(res, publicUser(user));
}));

router.post('/auth/logout', (req, res) => {
  clearAuthCookie(res);
  sendData(res, { loggedOut: true });
});

router.get('/health', (req, res) => sendData(res, { service: 'fieldcore-api', ok: true }));
router.get('/auth/session', asyncHandler(async (req, res) => {
  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = req.cookies[COOKIE_NAME] || bearer;
  if (!token) return sendData(res, null);
  return requireAuth(req, res, (error) => {
    if (error) return sendData(res, null);
    return sendData(res, publicUser(req.user));
  });
}));
router.get('/auth/me', requireAuth, (req, res) => sendData(res, publicUser(req.user)));

router.use(requireAuth);

router.get('/company/profile', asyncHandler(async (req, res) => {
  const company = await getCompanyWithBranding(req.companyId);
  sendData(res, profileResponse(company));
}));

router.patch('/company/profile', requireRole(...adminRoles), validate(companyProfileSchema), asyncHandler(async (req, res) => {
  const data = await prisma.company.update({ where: { id: req.companyId }, data: req.body, include: { branding: true } });
  await audit(req, 'UPDATE', 'Company', data.id, { section: 'profile' });
  sendData(res, profileResponse(data));
}));

router.get('/company/branding', asyncHandler(async (req, res) => {
  const company = await getCompanyWithBranding(req.companyId);
  sendData(res, publicBranding(company));
}));

router.patch('/company/branding', requireRole(...adminRoles), validate(companyBrandingSchema), asyncHandler(async (req, res) => {
  const data = await prisma.companyBranding.upsert({
    where: { companyId: req.companyId },
    update: req.body,
    create: { ...req.body, companyId: req.companyId }
  });
  await audit(req, 'UPDATE', 'CompanyBranding', data.id, { section: 'branding' });
  sendData(res, normalize(data));
}));

router.post(
  '/company/branding/logo',
  requireRole(...adminRoles),
  logoUpload.single('logo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('Logo file is required', 400);

    const logoUrl = `/uploads/logos/${req.file.filename}`;

    const data = await prisma.companyBranding.upsert({
      where: { companyId: req.companyId },
      update: { logoUrl },
      create: {
        companyId: req.companyId,
        logoUrl
      }
    });

    await audit(req, 'UPDATE', 'CompanyBranding', data.id, { section: 'logo' });

    sendData(res, normalize(data));
  })
);

router.get('/dashboard', asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const jobWhere = { companyId, ...workerJobScope(req) };
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [company, jobsToday, activeWorkers, recentJobs, schedule, workers, pipeline, unpaid] = await Promise.all([
    getCompanyWithBranding(companyId),
    prisma.job.count({ where: { ...jobWhere, scheduledStart: { gte: start, lt: end } } }),
    req.user.role === 'WORKER' ? Promise.resolve(req.user.worker && req.user.worker.active ? 1 : 0) : prisma.workerProfile.count({ where: { companyId, active: true } }),
    prisma.job.findMany({ where: jobWhere, include: { customer: true, worker: { include: SAFE_WORKER_INCLUDE } }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.scheduleItem.findMany({ where: { companyId, startsAt: { gte: start, lt: end }, ...(req.user.role === 'WORKER' ? { workerId: req.user.worker ? req.user.worker.id : '__none__' } : {}) }, include: { job: true, worker: { include: SAFE_WORKER_INCLUDE } }, orderBy: { startsAt: 'asc' }, take: 5 }),
    req.user.role === 'WORKER' ? Promise.resolve(req.user.worker ? [req.user.worker] : []) : prisma.workerProfile.findMany({ where: { companyId }, include: SAFE_WORKER_INCLUDE, take: 5 }),
    req.user.role === 'WORKER' ? Promise.resolve([]) : prisma.quote.groupBy({ by: ['status'], where: { companyId }, _count: true }),
    req.user.role === 'WORKER' ? Promise.resolve([]) : prisma.invoice.findMany({ where: { companyId, status: { in: ['SENT', 'OVERDUE'] } }, select: { amount: true } })
  ]);

  const unpaidInvoices = unpaid.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const totals = { jobsToday, revenueMonthToDate: 0, unpaidInvoices, activeWorkers };
  const pipe = { leads: 0, quoted: 0, won: 0 };
  for (const item of pipeline) {
    if (item.status === 'DRAFT') pipe.leads += item._count;
    if (item.status === 'SENT') pipe.quoted += item._count;
    if (item.status === 'ACCEPTED') pipe.won += item._count;
  }
  sendData(res, normalize({ branding: publicBranding(company), company: profileResponse(company), totals, schedule, workers, recentJobs, pipeline: pipe }));
}));

const customerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')).transform((v) => v || undefined),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional()
});

router.get('/customers', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.customer, req, { where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' }, include: { jobs: true, invoices: true } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/customers', requireRole(...adminRoles), validate(customerSchema), asyncHandler(async (req, res) => {
  const data = await prisma.customer.create({ data: { ...req.body, companyId: req.companyId } });
  await audit(req, 'CREATE', 'Customer', data.id);
  sendData(res, normalize(data), 201);
}));

router.get('/customers/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await requireCustomer(req, req.params.id)));
}));

router.patch('/customers/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(customerSchema.partial()), asyncHandler(async (req, res) => {
  await requireCustomer(req, req.params.id);
  const data = await prisma.customer.update({ where: { id: req.params.id }, data: req.body });
  await audit(req, 'UPDATE', 'Customer', data.id);
  sendData(res, normalize(data));
}));

router.delete('/customers/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireCustomer(req, req.params.id);
  await prisma.customer.delete({ where: { id: req.params.id } });
  await audit(req, 'DELETE', 'Customer', req.params.id);
  sendData(res, { deleted: true });
}));

const workerCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
  title: z.string().optional(),
  phone: z.string().optional(),
  active: z.boolean().optional()
});
const workerPatchSchema = z.object({ title: z.string().optional(), phone: z.string().optional(), active: z.boolean().optional() });

router.get('/workers', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.workerProfile, req, { where: { companyId: req.companyId }, include: SAFE_WORKER_INCLUDE, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data.map((w) => ({ ...w, user: publicUser(w.user) }))), 200, result.meta);
}));

router.post('/workers', requireRole(...adminRoles), validate(workerCreateSchema), asyncHandler(async (req, res) => {
  const user = await prisma.user.create({
    data: {
      companyId: req.companyId,
      email: req.body.email,
      name: req.body.name,
      role: 'WORKER',
      passwordHash: await hashPassword(req.body.password),
      worker: { create: { companyId: req.companyId, title: req.body.title, phone: req.body.phone, active: req.body.active ?? true } }
    },
    select: SAFE_LOGIN_USER_SELECT
  });
  await audit(req, 'CREATE', 'WorkerProfile', user.worker.id);
  sendData(res, publicUser(user), 201);
}));

router.patch('/workers/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(workerPatchSchema), asyncHandler(async (req, res) => {
  await requireWorker(req, req.params.id);
  const data = await prisma.workerProfile.update({ where: { id: req.params.id }, data: req.body, include: SAFE_WORKER_INCLUDE });
  await audit(req, 'UPDATE', 'WorkerProfile', data.id);
  sendData(res, normalize({ ...data, user: publicUser(data.user) }));
}));

const serviceSchema = z.object({ name: z.string().min(2), description: z.string().optional(), price: amount.optional(), active: z.boolean().optional() });
router.get('/services', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.service, req, { where: { companyId: req.companyId, active: true }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));
router.post('/services', requireRole(...adminRoles), validate(serviceSchema), asyncHandler(async (req, res) => {
  const data = await prisma.service.create({ data: { ...req.body, companyId: req.companyId } });
  await audit(req, 'CREATE', 'Service', data.id);
  sendData(res, normalize(data), 201);
}));

const jobSchema = z.object({
  customerId: z.string().min(1), serviceId: z.string().optional(), workerId: z.string().optional(), title: z.string().min(2),
  description: z.string().optional(), status: z.enum(['NEW', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
  scheduledStart: optionalDate, scheduledEnd: optionalDate, total: amount.optional()
});

router.get('/jobs', asyncHandler(async (req, res) => {
  const result = await paged(prisma.job, req, { where: { companyId: req.companyId, ...workerJobScope(req) }, include: { customer: true, service: true, worker: { include: SAFE_WORKER_INCLUDE } }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/jobs', requireRole(...adminRoles), validate(jobSchema), asyncHandler(async (req, res) => {
  await validateJobRelations(req, req.body);
  const data = await prisma.job.create({ data: { ...req.body, companyId: req.companyId }, include: { customer: true, worker: { include: SAFE_WORKER_INCLUDE } } });
  if (data.scheduledStart) await prisma.scheduleItem.create({ data: { companyId: req.companyId, jobId: data.id, workerId: data.workerId, startsAt: data.scheduledStart, endsAt: data.scheduledEnd } });
  await audit(req, 'CREATE', 'Job', data.id);
  sendData(res, normalize(data), 201);
}));

router.get('/jobs/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id);
  const data = await prisma.job.findUnique({ where: { id: req.params.id }, include: { customer: true, service: true, worker: { include: SAFE_WORKER_INCLUDE }, photos: true } });
  sendData(res, normalize(data));
}));

router.patch('/jobs/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(jobSchema.partial()), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id, { assignedOnly: false });
  await validateJobRelations(req, req.body);
  const data = await prisma.job.update({ where: { id: req.params.id }, data: req.body, include: { customer: true, worker: { include: SAFE_WORKER_INCLUDE } } });
  await audit(req, 'UPDATE', 'Job', data.id);
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/assign-worker', requireRole(...adminRoles), validate(idParam, 'params'), validate(z.object({ workerId: z.string().min(1) })), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id, { assignedOnly: false });
  await requireWorker(req, req.body.workerId);
  const data = await prisma.job.update({ where: { id: req.params.id }, data: { workerId: req.body.workerId, status: 'SCHEDULED' } });
  await audit(req, 'ASSIGN_WORKER', 'Job', data.id, { workerId: req.body.workerId });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/complete', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id);
  const data = await prisma.job.update({ where: { id: req.params.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  await audit(req, 'COMPLETE', 'Job', data.id);
  sendData(res, normalize(data));
}));

const quoteSchema = z.object({ customerId: z.string().min(1), serviceId: z.string().optional(), jobId: z.string().optional(), title: z.string().min(2), status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']).optional(), amount: amount.optional(), validUntil: optionalDate });
router.get('/quotes', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const [company, result] = await Promise.all([
    getCompanyWithBranding(req.companyId),
    paged(prisma.quote, req, { where: { companyId: req.companyId }, include: { customer: true, service: true, job: true }, orderBy: { createdAt: 'desc' } })
  ]);
  sendData(res, normalize(result.data.map((item) => ({ ...item, branding: publicBranding(company) }))), 200, result.meta);
}));
router.post('/quotes', requireRole(...adminRoles), validate(quoteSchema), asyncHandler(async (req, res) => {
  await validateQuoteRelations(req, req.body);
  const data = await prisma.quote.create({ data: { ...req.body, companyId: req.companyId }, include: { customer: true, service: true } });
  await audit(req, 'CREATE', 'Quote', data.id);
  sendData(res, normalize(data), 201);
}));
router.patch('/quotes/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(quoteSchema.partial()), asyncHandler(async (req, res) => {
  await requireQuote(req, req.params.id);
  await validateQuoteRelations(req, req.body);
  const data = await prisma.quote.update({ where: { id: req.params.id }, data: req.body });
  await audit(req, 'UPDATE', 'Quote', data.id);
  sendData(res, normalize(data));
}));
router.post('/quotes/:id/accept', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireQuote(req, req.params.id);
  const data = await prisma.quote.update({ where: { id: req.params.id }, data: { status: 'ACCEPTED' } });
  await audit(req, 'ACCEPT', 'Quote', data.id);
  sendData(res, normalize(data));
}));
router.post('/quotes/:id/reject', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireQuote(req, req.params.id);
  const data = await prisma.quote.update({ where: { id: req.params.id }, data: { status: 'REJECTED' } });
  await audit(req, 'REJECT', 'Quote', data.id);
  sendData(res, normalize(data));
}));

const invoiceSchema = z.object({ customerId: z.string().min(1), serviceId: z.string().optional(), jobId: z.string().optional(), number: z.string().optional(), status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID']).optional(), amount: amount.optional(), dueDate: optionalDate });
router.get('/invoices', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const [company, result] = await Promise.all([
    getCompanyWithBranding(req.companyId),
    paged(prisma.invoice, req, { where: { companyId: req.companyId }, include: { customer: true, service: true, job: true, payments: true }, orderBy: { createdAt: 'desc' } })
  ]);
  sendData(res, normalize(result.data.map((item) => ({ ...item, branding: publicBranding(company) }))), 200, result.meta);
}));
router.post('/invoices', requireRole(...adminRoles), validate(invoiceSchema), asyncHandler(async (req, res) => {
  await validateInvoiceRelations(req, req.body);
  const count = await prisma.invoice.count({ where: { companyId: req.companyId } });
  const data = await prisma.invoice.create({ data: { ...req.body, companyId: req.companyId, number: req.body.number || `INV-${String(count + 1).padStart(4, '0')}` }, include: { customer: true } });
  await audit(req, 'CREATE', 'Invoice', data.id);
  sendData(res, normalize(data), 201);
}));
router.patch('/invoices/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(invoiceSchema.partial()), asyncHandler(async (req, res) => {
  await requireInvoice(req, req.params.id);
  await validateInvoiceRelations(req, req.body);
  const data = await prisma.invoice.update({ where: { id: req.params.id }, data: req.body });
  await audit(req, 'UPDATE', 'Invoice', data.id);
  sendData(res, normalize(data));
}));
router.post('/invoices/:id/mark-paid', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  const data = await prisma.invoice.update({ where: { id: req.params.id }, data: { status: 'PAID', paidAt: new Date() } });
  await prisma.payment.create({ data: { companyId: req.companyId, invoiceId: invoice.id, amount: data.amount } });
  await audit(req, 'MARK_PAID', 'Invoice', data.id);
  sendData(res, normalize(data));
}));

const scheduleSchema = z.object({ jobId: z.string().min(1), workerId: z.string().optional(), startsAt: z.coerce.date(), endsAt: optionalDate, notes: z.string().optional() });
router.get('/schedule', asyncHandler(async (req, res) => {
  const result = await paged(prisma.scheduleItem, req, { where: { companyId: req.companyId, ...(req.user.role === 'WORKER' ? { workerId: req.user.worker ? req.user.worker.id : '__none__' } : {}) }, include: { job: { include: { customer: true } }, worker: { include: SAFE_WORKER_INCLUDE } }, orderBy: { startsAt: 'asc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));
router.post('/schedule', requireRole(...adminRoles), validate(scheduleSchema), asyncHandler(async (req, res) => {
  await validateScheduleRelations(req, req.body);
  const data = await prisma.scheduleItem.create({ data: { ...req.body, companyId: req.companyId } });
  await audit(req, 'CREATE', 'ScheduleItem', data.id);
  sendData(res, normalize(data), 201);
}));

router.post('/worker-location', requireRole('WORKER'), validate(z.object({ latitude: z.coerce.number(), longitude: z.coerce.number() })), asyncHandler(async (req, res) => {
  if (!req.user.worker) throw new AppError(400, 'Worker profile required');
  const data = await prisma.workerLocation.create({ data: { companyId: req.companyId, workerId: req.user.worker.id, latitude: req.body.latitude, longitude: req.body.longitude } });
  sendData(res, normalize(data), 201);
}));
router.get('/worker-location/latest', asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId, ...(req.user.role === 'WORKER' ? { workerId: req.user.worker ? req.user.worker.id : '__none__' } : {}) };
  const result = await paged(prisma.workerLocation, req, { where, distinct: ['workerId'], orderBy: { recordedAt: 'desc' }, include: { worker: { include: SAFE_WORKER_INCLUDE } } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

const photoSchema = z.object({ url: z.string().url(), caption: z.string().optional() });
router.post('/jobs/:id/photos', validate(idParam, 'params'), validate(photoSchema), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id);
  const data = await prisma.jobPhoto.create({ data: { ...req.body, companyId: req.companyId, jobId: req.params.id } });
  await audit(req, 'CREATE', 'JobPhoto', data.id, { jobId: req.params.id });
  sendData(res, normalize(data), 201);
}));
router.get('/jobs/:id/photos', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id);
  const result = await paged(prisma.jobPhoto, req, { where: { companyId: req.companyId, jobId: req.params.id }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

module.exports = { apiRouter: router };
