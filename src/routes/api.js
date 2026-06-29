const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const express = require('express');
const { Prisma } = require('@prisma/client');
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
const lineItemParam = z.object({ id: z.string().min(1), lineItemId: z.string().min(1) });
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
    if (!allowed.includes(file.mimetype)) return cb(new AppError(400, 'Only PNG, JPG, and WEBP logos are allowed')); 
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

function toDecimal(value) {
  return new Prisma.Decimal(value || 0);
}

function totalsFromLines(lines) {
  const totals = lines.reduce((sum, line) => {
    const quantity = toDecimal(line.quantity ?? 1);
    const unitPrice = toDecimal(line.unitPrice ?? 0);
    const discountAmount = toDecimal(line.discountAmount ?? 0);
    const taxAmount = toDecimal(line.taxAmount ?? 0);
    return {
      subtotal: sum.subtotal.plus(quantity.mul(unitPrice)),
      discountTotal: sum.discountTotal.plus(discountAmount),
      taxTotal: sum.taxTotal.plus(taxAmount)
    };
  }, { subtotal: toDecimal(0), discountTotal: toDecimal(0), taxTotal: toDecimal(0) });
  const total = totals.subtotal.minus(totals.discountTotal).plus(totals.taxTotal);
  if (total.lessThan(0)) throw new AppError(400, 'Total cannot be negative');
  return { ...totals, total, amount: total };
}

function moneyLine(input) {
  const quantity = toDecimal(input.quantity ?? 1);
  const unitPrice = toDecimal(input.unitPrice ?? input.amount ?? 0);
  const discountAmount = toDecimal(input.discountAmount ?? 0);
  const taxAmount = toDecimal(input.taxAmount ?? 0);
  const lineTotal = quantity.mul(unitPrice).minus(discountAmount).plus(taxAmount);
  if (quantity.lessThan(0) || unitPrice.lessThan(0) || discountAmount.lessThan(0) || taxAmount.lessThan(0) || lineTotal.lessThan(0)) {
    throw new AppError(400, 'Money values cannot create a negative line total');
  }
  return { quantity, unitPrice, discountAmount, taxAmount, lineTotal };
}

const lineItemSchema = z.object({
  serviceId: z.string().optional(),
  description: z.string().trim().min(1).max(300),
  quantity: amount.optional().default(1),
  unitPrice: amount.optional().default(0),
  discountAmount: amount.optional().default(0),
  taxAmount: amount.optional().default(0),
  sortOrder: z.coerce.number().int().min(0).optional().default(0)
});
const lineItemsSchema = z.array(lineItemSchema).max(100).optional();
const quoteInclude = { customer: true, service: true, job: true, lineItems: { orderBy: { sortOrder: 'asc' } }, statusHistory: { orderBy: { createdAt: 'desc' } } };
const invoiceInclude = { customer: true, service: true, job: true, quote: true, payments: true, receipts: true, lineItems: { orderBy: { sortOrder: 'asc' } }, statusHistory: { orderBy: { createdAt: 'desc' } } };

async function requireQuoteLineItem(req, quoteId, lineItemId) {
  const record = await prisma.quoteLineItem.findFirst({ where: { id: lineItemId, quoteId, companyId: req.companyId } });
  if (!record) throw notFound('Quote line item not found');
  return record;
}

async function requireInvoiceLineItem(req, invoiceId, lineItemId) {
  const record = await prisma.invoiceLineItem.findFirst({ where: { id: lineItemId, invoiceId, companyId: req.companyId } });
  if (!record) throw notFound('Invoice line item not found');
  return record;
}

async function recalcQuote(tx, companyId, quoteId) {
  const lines = await tx.quoteLineItem.findMany({ where: { companyId, quoteId } });
  return tx.quote.update({ where: { id: quoteId }, data: totalsFromLines(lines), include: quoteInclude });
}

async function recalcInvoice(tx, companyId, invoiceId) {
  const [lines, confirmed] = await Promise.all([
    tx.invoiceLineItem.findMany({ where: { companyId, invoiceId } }),
    tx.payment.findMany({ where: { companyId, invoiceId, status: 'CONFIRMED' } })
  ]);
  const totals = totalsFromLines(lines);
  const paid = confirmed.reduce((sum, payment) => sum.plus(toDecimal(payment.amount)), toDecimal(0));
  const balanceDue = totals.total.minus(paid);
  if (balanceDue.lessThan(0)) throw new AppError(400, 'Payment exceeds invoice balance');
  const data = { ...totals, balanceDue };
  if (paid.greaterThan(0)) {
    data.status = balanceDue.equals(0) ? 'PAID' : 'PARTIALLY_PAID';
    data.paidAt = balanceDue.equals(0) ? new Date() : null;
  }
  return tx.invoice.update({ where: { id: invoiceId }, data, include: invoiceInclude });
}

async function addQuoteStatusHistory(tx, req, quote, toStatus, note) {
  await tx.quoteStatusHistory.create({ data: { companyId: req.companyId, quoteId: quote.id, fromStatus: quote.status, toStatus, changedById: req.user.id, note } });
}

async function addInvoiceStatusHistory(tx, req, invoice, toStatus, note) {
  await tx.invoiceStatusHistory.create({ data: { companyId: req.companyId, invoiceId: invoice.id, fromStatus: invoice.status, toStatus, changedById: req.user.id, note } });
}

async function nextInvoiceNumber(tx, companyId) {
  const counter = await tx.companyInvoiceCounter.upsert({ where: { companyId }, update: {}, create: { companyId } });
  let nextNumber = counter.nextNumber;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const number = counter.prefix + '-' + String(nextNumber).padStart(counter.padding, '0');
    const existingCount = await tx.invoice.count({ where: { companyId, number } });
    await tx.companyInvoiceCounter.update({ where: { companyId }, data: { nextNumber: nextNumber + 1 } });
    nextNumber += 1;
    if (existingCount === 0) return number;
  }
  throw new AppError(409, 'Could not allocate invoice number');
}

async function createReceiptForPayment(tx, payment, invoice) {
  const existing = await tx.receipt.findUnique({ where: { paymentId: payment.id } });
  if (existing) return existing;
  const count = await tx.receipt.count({ where: { companyId: payment.companyId } });
  return tx.receipt.create({ data: { companyId: payment.companyId, invoiceId: invoice.id, paymentId: payment.id, receiptNumber: 'RCT-' + String(count + 1).padStart(4, '0'), amount: payment.amount } });
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
    if (!req.file) throw new AppError(400, 'Logo file is required');

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

const completeJobSchema = z.object({ completionNotes: z.string().trim().max(2000).optional(), customerSignatureUrl: z.string().url().optional(), proofPhotoIds: z.array(z.string().min(1)).optional(), adminOverride: z.boolean().optional() });

router.post('/jobs/:id/complete', validate(idParam, 'params'), validate(completeJobSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === 'WORKER' });
  if (job.status === 'COMPLETED') return sendData(res, normalize(job));
  if (job.status === 'CANCELLED') throw new AppError(409, 'Cancelled jobs cannot be completed');
  const isAdmin = adminRoles.includes(req.user.role);
  const hasProof = (req.body.proofPhotoIds && req.body.proofPhotoIds.length > 0) || Boolean(req.body.completionNotes);
  if (!isAdmin && !hasProof) throw new AppError(400, 'Completion notes or proof photo is required');
  if (req.body.adminOverride && !isAdmin) throw new AppError(403, 'Only admins can use completion override');
  if (!hasProof && !req.body.adminOverride) throw new AppError(400, 'Completion notes or proof photo is required');
  if (req.body.proofPhotoIds && req.body.proofPhotoIds.length) {
    const count = await prisma.jobPhoto.count({ where: { companyId: req.companyId, jobId: job.id, id: { in: req.body.proofPhotoIds } } });
    if (count !== req.body.proofPhotoIds.length) throw new AppError(404, 'Proof photo not found');
  }
  const data = await prisma.job.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date(), completionNotes: req.body.completionNotes, customerSignatureUrl: req.body.customerSignatureUrl }, include: { customer: true, service: true, worker: { include: SAFE_WORKER_INCLUDE }, photos: true } });
  await audit(req, req.body.adminOverride ? 'COMPLETE_ADMIN_OVERRIDE' : 'COMPLETE', 'Job', data.id, { proofPhotoIds: req.body.proofPhotoIds || [] });
  sendData(res, normalize(data));
}));

const quoteSchema = z.object({
  customerId: z.string().min(1),
  serviceId: z.string().optional(),
  jobId: z.string().optional(),
  title: z.string().min(2),
  description: z.string().optional(),
  validUntil: optionalDate,
  amount: amount.optional(),
  lineItems: lineItemsSchema
});

function fallbackQuoteLines(body) {
  if (body.lineItems && body.lineItems.length) return body.lineItems;
  if (body.amount || body.serviceId) return [{ serviceId: body.serviceId, description: body.title, quantity: 1, unitPrice: body.amount || 0, sortOrder: 0 }];
  return [];
}

router.get('/quotes', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const [company, result] = await Promise.all([
    getCompanyWithBranding(req.companyId),
    paged(prisma.quote, req, { where: { companyId: req.companyId }, include: quoteInclude, orderBy: { createdAt: 'desc' } })
  ]);
  sendData(res, normalize(result.data.map((item) => ({ ...item, branding: publicBranding(company) }))), 200, result.meta);
}));

router.post('/quotes', requireRole(...adminRoles), validate(quoteSchema), asyncHandler(async (req, res) => {
  await validateQuoteRelations(req, req.body);
  const data = await prisma.$transaction(async (tx) => {
    const { lineItems, amount: ignoredAmount, ...quoteData } = req.body;
    const quote = await tx.quote.create({ data: { ...quoteData, companyId: req.companyId, status: 'DRAFT' } });
    for (const [index, item] of fallbackQuoteLines(req.body).entries()) {
      if (item.serviceId) await requireService(req, item.serviceId);
      await tx.quoteLineItem.create({ data: { ...item, ...moneyLine(item), companyId: req.companyId, quoteId: quote.id, sortOrder: item.sortOrder ?? index } });
    }
    await addQuoteStatusHistory(tx, req, { ...quote, status: null }, 'DRAFT', 'Quote created');
    return recalcQuote(tx, req.companyId, quote.id);
  });
  await audit(req, 'CREATE', 'Quote', data.id);
  sendData(res, normalize(data), 201);
}));

router.get('/quotes/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireQuote(req, req.params.id);
  const data = await prisma.quote.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: quoteInclude });
  sendData(res, normalize(data));
}));

router.patch('/quotes/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(quoteSchema.partial()), asyncHandler(async (req, res) => {
  const quote = await requireQuote(req, req.params.id);
  if (quote.status !== 'DRAFT') throw new AppError(409, 'Only draft quotes can be edited');
  await validateQuoteRelations(req, req.body);
  const { lineItems, ...quoteData } = req.body;
  const data = await prisma.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quote.id }, data: quoteData });
    if (lineItems) {
      await tx.quoteLineItem.deleteMany({ where: { companyId: req.companyId, quoteId: quote.id } });
      for (const [index, item] of lineItems.entries()) {
        if (item.serviceId) await requireService(req, item.serviceId);
        await tx.quoteLineItem.create({ data: { ...item, ...moneyLine(item), companyId: req.companyId, quoteId: quote.id, sortOrder: item.sortOrder ?? index } });
      }
    }
    return recalcQuote(tx, req.companyId, quote.id);
  });
  await audit(req, 'UPDATE', 'Quote', data.id);
  sendData(res, normalize(data));
}));

async function transitionQuote(req, status, stamp, note) {
  const quote = await requireQuote(req, req.params.id);
  if (quote.status === status) return prisma.quote.findFirst({ where: { id: quote.id, companyId: req.companyId }, include: quoteInclude });
  const allowed = { SENT: ['DRAFT'], ACCEPTED: ['SENT'], REJECTED: ['SENT'], EXPIRED: ['SENT'] };
  if (!allowed[status].includes(quote.status)) throw new AppError(409, 'Quote cannot transition from ' + quote.status + ' to ' + status);
  return prisma.$transaction(async (tx) => {
    await addQuoteStatusHistory(tx, req, quote, status, note);
    return tx.quote.update({ where: { id: quote.id }, data: { status, [stamp]: new Date() }, include: quoteInclude });
  });
}

router.post('/quotes/:id/send', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await transitionQuote(req, 'SENT', 'sentAt', 'Quote sent');
  await audit(req, 'SEND', 'Quote', data.id);
  sendData(res, normalize(data));
}));

router.post('/quotes/:id/accept', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const quote = await requireQuote(req, req.params.id);
  if (quote.status === 'REJECTED' || quote.status === 'EXPIRED') throw new AppError(409, 'Rejected or expired quotes cannot be accepted');
  const data = await prisma.$transaction(async (tx) => {
    const current = await tx.quote.findFirst({ where: { id: quote.id, companyId: req.companyId }, include: quoteInclude });
    if (current.status === 'ACCEPTED' && current.jobId) return current;
    if (current.status !== 'SENT' && current.status !== 'ACCEPTED') throw new AppError(409, 'Only sent quotes can be accepted');
    let jobId = current.jobId;
    if (!jobId) {
      const job = await tx.job.create({ data: { companyId: req.companyId, customerId: current.customerId, serviceId: current.serviceId, title: current.title, description: current.description, total: current.total || current.amount } });
      jobId = job.id;
    }
    if (current.status !== 'ACCEPTED') await addQuoteStatusHistory(tx, req, current, 'ACCEPTED', 'Quote accepted');
    return tx.quote.update({ where: { id: current.id }, data: { status: 'ACCEPTED', acceptedAt: current.acceptedAt || new Date(), jobId }, include: quoteInclude });
  });
  await audit(req, 'ACCEPT', 'Quote', data.id, { jobId: data.jobId });
  sendData(res, normalize(data));
}));

router.post('/quotes/:id/reject', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await transitionQuote(req, 'REJECTED', 'rejectedAt', 'Quote rejected');
  await audit(req, 'REJECT', 'Quote', data.id);
  sendData(res, normalize(data));
}));

router.post('/quotes/:id/expire', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await transitionQuote(req, 'EXPIRED', 'expiredAt', 'Quote expired');
  await audit(req, 'EXPIRE', 'Quote', data.id);
  sendData(res, normalize(data));
}));

router.post('/quotes/:id/line-items', requireRole(...adminRoles), validate(idParam, 'params'), validate(lineItemSchema), asyncHandler(async (req, res) => {
  const quote = await requireQuote(req, req.params.id);
  if (quote.status !== 'DRAFT') throw new AppError(409, 'Only draft quotes can be edited');
  if (req.body.serviceId) await requireService(req, req.body.serviceId);
  const data = await prisma.$transaction(async (tx) => {
    await tx.quoteLineItem.create({ data: { ...req.body, ...moneyLine(req.body), companyId: req.companyId, quoteId: quote.id } });
    return recalcQuote(tx, req.companyId, quote.id);
  });
  await audit(req, 'CREATE', 'QuoteLineItem', quote.id);
  sendData(res, normalize(data), 201);
}));

router.patch('/quotes/:id/line-items/:lineItemId', requireRole(...adminRoles), validate(lineItemParam, 'params'), validate(lineItemSchema.partial()), asyncHandler(async (req, res) => {
  const quote = await requireQuote(req, req.params.id);
  if (quote.status !== 'DRAFT') throw new AppError(409, 'Only draft quotes can be edited');
  await requireQuoteLineItem(req, quote.id, req.params.lineItemId);
  if (req.body.serviceId) await requireService(req, req.body.serviceId);
  const data = await prisma.$transaction(async (tx) => {
    const existing = await tx.quoteLineItem.findFirst({ where: { id: req.params.lineItemId, companyId: req.companyId, quoteId: quote.id } });
    const merged = { ...existing, ...req.body };
    await tx.quoteLineItem.update({ where: { id: req.params.lineItemId }, data: { ...req.body, ...moneyLine(merged) } });
    return recalcQuote(tx, req.companyId, quote.id);
  });
  await audit(req, 'UPDATE', 'QuoteLineItem', req.params.lineItemId);
  sendData(res, normalize(data));
}));

router.delete('/quotes/:id/line-items/:lineItemId', requireRole(...adminRoles), validate(lineItemParam, 'params'), asyncHandler(async (req, res) => {
  const quote = await requireQuote(req, req.params.id);
  if (quote.status !== 'DRAFT') throw new AppError(409, 'Only draft quotes can be edited');
  await requireQuoteLineItem(req, quote.id, req.params.lineItemId);
  const data = await prisma.$transaction(async (tx) => {
    await tx.quoteLineItem.delete({ where: { id: req.params.lineItemId } });
    return recalcQuote(tx, req.companyId, quote.id);
  });
  await audit(req, 'DELETE', 'QuoteLineItem', req.params.lineItemId);
  sendData(res, normalize(data));
}));

const invoiceSchema = z.object({
  customerId: z.string().min(1),
  serviceId: z.string().optional(),
  jobId: z.string().optional(),
  quoteId: z.string().optional(),
  number: z.string().optional(),
  dueDate: optionalDate,
  amount: amount.optional(),
  lineItems: lineItemsSchema
});

function fallbackInvoiceLines(body) {
  if (body.lineItems && body.lineItems.length) return body.lineItems;
  if (body.amount || body.serviceId) return [{ serviceId: body.serviceId, description: body.number || 'Invoice item', quantity: 1, unitPrice: body.amount || 0, sortOrder: 0 }];
  return [];
}

router.get('/invoices', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const [company, result] = await Promise.all([
    getCompanyWithBranding(req.companyId),
    paged(prisma.invoice, req, { where: { companyId: req.companyId }, include: invoiceInclude, orderBy: { createdAt: 'desc' } })
  ]);
  sendData(res, normalize(result.data.map((item) => ({ ...item, branding: publicBranding(company) }))), 200, result.meta);
}));

router.post('/invoices', requireRole(...adminRoles), validate(invoiceSchema), asyncHandler(async (req, res) => {
  await validateInvoiceRelations(req, req.body);
  if (req.body.quoteId) await requireQuote(req, req.body.quoteId);
  const data = await prisma.$transaction(async (tx) => {
    const { lineItems, amount: ignoredAmount, ...invoiceData } = req.body;
    const number = invoiceData.number || await nextInvoiceNumber(tx, req.companyId);
    const invoice = await tx.invoice.create({ data: { ...invoiceData, number, companyId: req.companyId, status: 'DRAFT' } });
    for (const [index, item] of fallbackInvoiceLines(req.body).entries()) {
      if (item.serviceId) await requireService(req, item.serviceId);
      await tx.invoiceLineItem.create({ data: { ...item, ...moneyLine(item), companyId: req.companyId, invoiceId: invoice.id, sortOrder: item.sortOrder ?? index } });
    }
    await addInvoiceStatusHistory(tx, req, { ...invoice, status: null }, 'DRAFT', 'Invoice created');
    return recalcInvoice(tx, req.companyId, invoice.id);
  });
  await audit(req, 'CREATE', 'Invoice', data.id);
  sendData(res, normalize(data), 201);
}));

router.get('/invoices/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireInvoice(req, req.params.id);
  const data = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: invoiceInclude });
  sendData(res, normalize(data));
}));

router.patch('/invoices/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(invoiceSchema.partial()), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  if (invoice.status === 'PAID' || invoice.status === 'VOID') throw new AppError(409, 'Paid or void invoices cannot be edited');
  await validateInvoiceRelations(req, req.body);
  if (req.body.quoteId) await requireQuote(req, req.body.quoteId);
  const { lineItems, ...invoiceData } = req.body;
  const data = await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id: invoice.id }, data: invoiceData });
    if (lineItems) {
      await tx.invoiceLineItem.deleteMany({ where: { companyId: req.companyId, invoiceId: invoice.id } });
      for (const [index, item] of lineItems.entries()) {
        if (item.serviceId) await requireService(req, item.serviceId);
        await tx.invoiceLineItem.create({ data: { ...item, ...moneyLine(item), companyId: req.companyId, invoiceId: invoice.id, sortOrder: item.sortOrder ?? index } });
      }
    }
    return recalcInvoice(tx, req.companyId, invoice.id);
  });
  await audit(req, 'UPDATE', 'Invoice', data.id);
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/create-invoice', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  if (job.status !== 'COMPLETED') throw new AppError(409, 'Only completed jobs can be invoiced');
  const existing = await prisma.invoice.findFirst({ where: { companyId: req.companyId, jobId: job.id }, include: invoiceInclude });
  if (existing) return sendData(res, normalize(existing));
  const quote = await prisma.quote.findFirst({ where: { companyId: req.companyId, jobId: job.id }, include: { lineItems: true } });
  const data = await prisma.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, req.companyId);
    const invoice = await tx.invoice.create({ data: { companyId: req.companyId, customerId: job.customerId, serviceId: job.serviceId, jobId: job.id, quoteId: quote && quote.id, number, status: 'DRAFT' } });
    const sourceLines = quote && quote.lineItems && quote.lineItems.length ? quote.lineItems : [{ serviceId: job.serviceId, description: job.title, quantity: 1, unitPrice: job.total || 0, sortOrder: 0 }];
    for (const [index, item] of sourceLines.entries()) {
      await tx.invoiceLineItem.create({ data: { serviceId: item.serviceId, description: item.description || job.title, quantity: item.quantity || 1, unitPrice: item.unitPrice || item.lineTotal || job.total || 0, discountAmount: item.discountAmount || 0, taxAmount: item.taxAmount || 0, ...moneyLine(item), companyId: req.companyId, invoiceId: invoice.id, sortOrder: item.sortOrder ?? index } });
    }
    await addInvoiceStatusHistory(tx, req, { ...invoice, status: null }, 'DRAFT', 'Invoice created from job');
    return recalcInvoice(tx, req.companyId, invoice.id);
  });
  await audit(req, 'CREATE_FROM_JOB', 'Invoice', data.id, { jobId: job.id });
  sendData(res, normalize(data), 201);
}));

async function transitionInvoice(req, status, stamp, note) {
  const invoice = await requireInvoice(req, req.params.id);
  if (invoice.status === status) return prisma.invoice.findFirst({ where: { id: invoice.id, companyId: req.companyId }, include: invoiceInclude });
  if (invoice.status === 'VOID' || invoice.status === 'PAID') throw new AppError(409, 'Paid or void invoices cannot change status');
  return prisma.$transaction(async (tx) => {
    await addInvoiceStatusHistory(tx, req, invoice, status, note);
    return tx.invoice.update({ where: { id: invoice.id }, data: { status, [stamp]: new Date() }, include: invoiceInclude });
  });
}

router.post('/invoices/:id/send', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await transitionInvoice(req, 'SENT', 'sentAt', 'Invoice sent');
  await audit(req, 'SEND', 'Invoice', data.id);
  sendData(res, normalize(data));
}));

router.post('/invoices/:id/void', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await transitionInvoice(req, 'VOID', 'voidedAt', 'Invoice voided');
  await audit(req, 'VOID', 'Invoice', data.id);
  sendData(res, normalize(data));
}));

router.post('/invoices/:id/mark-paid', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  if (invoice.status === 'PAID') return sendData(res, normalize(await prisma.invoice.findFirst({ where: { id: invoice.id, companyId: req.companyId }, include: invoiceInclude })));
  const amountDue = invoice.balanceDue || invoice.total || invoice.amount;
  const payment = await prisma.payment.create({ data: { companyId: req.companyId, invoiceId: invoice.id, amount: amountDue, method: 'MANUAL_ADJUSTMENT', status: 'CONFIRMED', receivedAt: new Date(), confirmedAt: new Date(), createdById: req.user.id } });
  await createReceiptForPayment(prisma, payment, invoice);
  const data = await recalcInvoice(prisma, req.companyId, invoice.id);
  await audit(req, 'MARK_PAID', 'Invoice', data.id);
  sendData(res, normalize(data));
}));

router.post('/invoices/:id/line-items', requireRole(...adminRoles), validate(idParam, 'params'), validate(lineItemSchema), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  if (invoice.status === 'PAID' || invoice.status === 'VOID') throw new AppError(409, 'Paid or void invoices cannot be edited');
  if (req.body.serviceId) await requireService(req, req.body.serviceId);
  const data = await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.create({ data: { ...req.body, ...moneyLine(req.body), companyId: req.companyId, invoiceId: invoice.id } });
    return recalcInvoice(tx, req.companyId, invoice.id);
  });
  await audit(req, 'CREATE', 'InvoiceLineItem', invoice.id);
  sendData(res, normalize(data), 201);
}));

router.patch('/invoices/:id/line-items/:lineItemId', requireRole(...adminRoles), validate(lineItemParam, 'params'), validate(lineItemSchema.partial()), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  if (invoice.status === 'PAID' || invoice.status === 'VOID') throw new AppError(409, 'Paid or void invoices cannot be edited');
  await requireInvoiceLineItem(req, invoice.id, req.params.lineItemId);
  if (req.body.serviceId) await requireService(req, req.body.serviceId);
  const data = await prisma.$transaction(async (tx) => {
    const existing = await tx.invoiceLineItem.findFirst({ where: { id: req.params.lineItemId, companyId: req.companyId, invoiceId: invoice.id } });
    const merged = { ...existing, ...req.body };
    await tx.invoiceLineItem.update({ where: { id: req.params.lineItemId }, data: { ...req.body, ...moneyLine(merged) } });
    return recalcInvoice(tx, req.companyId, invoice.id);
  });
  await audit(req, 'UPDATE', 'InvoiceLineItem', req.params.lineItemId);
  sendData(res, normalize(data));
}));

router.delete('/invoices/:id/line-items/:lineItemId', requireRole(...adminRoles), validate(lineItemParam, 'params'), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  if (invoice.status === 'PAID' || invoice.status === 'VOID') throw new AppError(409, 'Paid or void invoices cannot be edited');
  await requireInvoiceLineItem(req, invoice.id, req.params.lineItemId);
  const data = await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.delete({ where: { id: req.params.lineItemId } });
    return recalcInvoice(tx, req.companyId, invoice.id);
  });
  await audit(req, 'DELETE', 'InvoiceLineItem', req.params.lineItemId);
  sendData(res, normalize(data));
}));

const paymentSchema = z.object({ amount: amount, method: z.enum(['CASH', 'BANK_TRANSFER', 'PAYNOW', 'CARD', 'MANUAL_ADJUSTMENT', 'OTHER']).default('OTHER'), status: z.enum(['PENDING', 'CONFIRMED']).optional(), reference: z.string().optional(), receivedAt: optionalDate, notes: z.string().optional() });

router.get('/invoices/:id/payments', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireInvoice(req, req.params.id);
  const data = await prisma.payment.findMany({ where: { companyId: req.companyId, invoiceId: req.params.id }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
}));

router.post('/invoices/:id/payments', requireRole(...adminRoles), validate(idParam, 'params'), validate(paymentSchema), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  if (invoice.status === 'PAID') throw new AppError(409, 'Invoice is already paid');
  const confirmNow = req.body.status === 'CONFIRMED';
  const balance = toDecimal(invoice.balanceDue || invoice.total || invoice.amount);
  if (confirmNow && toDecimal(req.body.amount).greaterThan(balance)) throw new AppError(400, 'Payment exceeds invoice balance');
  const data = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({ data: { ...req.body, companyId: req.companyId, invoiceId: invoice.id, status: confirmNow ? 'CONFIRMED' : 'PENDING', receivedAt: req.body.receivedAt || new Date(), confirmedAt: confirmNow ? new Date() : null, createdById: req.user.id } });
    if (confirmNow) await createReceiptForPayment(tx, payment, invoice);
    return confirmNow ? recalcInvoice(tx, req.companyId, invoice.id) : tx.invoice.findFirst({ where: { id: invoice.id, companyId: req.companyId }, include: invoiceInclude });
  });
  await audit(req, 'CREATE', 'Payment', invoice.id, { status: req.body.status || 'PENDING' });
  sendData(res, normalize(data), 201);
}));

router.post('/payments/:id/confirm', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
  if (!payment) throw notFound('Payment not found');
  const invoice = await requireInvoice(req, payment.invoiceId);
  if (payment.status === 'CONFIRMED') {
    await createReceiptForPayment(prisma, payment, invoice);
    return sendData(res, normalize(await prisma.payment.findFirst({ where: { id: payment.id, companyId: req.companyId }, include: { receipt: true } })));
  }
  if (toDecimal(payment.amount).greaterThan(toDecimal(invoice.balanceDue || invoice.total || invoice.amount))) throw new AppError(400, 'Payment exceeds invoice balance');
  const data = await prisma.$transaction(async (tx) => {
    const confirmed = await tx.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
    await createReceiptForPayment(tx, confirmed, invoice);
    await recalcInvoice(tx, req.companyId, invoice.id);
    return tx.payment.findFirst({ where: { id: payment.id, companyId: req.companyId }, include: { receipt: true } });
  });
  await audit(req, 'CONFIRM', 'Payment', payment.id);
  sendData(res, normalize(data));
}));

router.post('/payments/:id/refund', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
  if (!payment) throw notFound('Payment not found');
  const data = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
  await recalcInvoice(prisma, req.companyId, payment.invoiceId);
  await audit(req, 'REFUND', 'Payment', payment.id);
  sendData(res, normalize(data));
}));

router.get('/receipts/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const receipt = await prisma.receipt.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: { invoice: { include: { customer: true } }, payment: true } });
  if (!receipt) throw notFound('Receipt not found');
  const company = await getCompanyWithBranding(req.companyId);
  sendData(res, normalize({ ...receipt, company: profileResponse(company), branding: publicBranding(company) }));
}));

router.get('/invoices/:id/receipts', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireInvoice(req, req.params.id);
  const data = await prisma.receipt.findMany({ where: { companyId: req.companyId, invoiceId: req.params.id }, include: { payment: true }, orderBy: { issuedAt: 'desc' } });
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
