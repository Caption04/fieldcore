const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
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
const jobStatusValues = ['NEW', 'SCHEDULED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const activityTypeValues = ['ASSIGNED','ARRIVED','STARTED','PAUSED','RESUMED','COMPLETED','ADMIN_NOTE','STATUS_CHANGED','PROOF_PHOTO_ADDED','PROOF_PHOTO_REMOVED','SIGNATURE_ADDED','SIGNATURE_REMOVED'];
const bookingRequestStatusValues = ['NEW', 'REVIEWED', 'CONVERTED', 'DECLINED', 'CANCELLED'];

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

async function requireWorkerRole(req, id) {
  if (!id) return null;
  const record = await prisma.workerRole.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Worker role not found');
  return record;
}

async function ensureWorkerRole(req, name, tx = prisma) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  return tx.workerRole.upsert({ where: { companyId_name: { companyId: req.companyId, name: clean } }, update: { active: true }, create: { companyId: req.companyId, name: clean } });
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

const jobInclude = { customer: true, service: true, worker: { include: SAFE_WORKER_INCLUDE } };
const jobDetailInclude = { ...jobInclude, proofPhotos: { orderBy: { createdAt: 'desc' } }, signature: true };
const jobActivityInclude = { worker: { include: SAFE_WORKER_INCLUDE }, user: { select: { id: true, companyId: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } } };

function lifecycleWorkerId(req, job) {
  return req.user.role === 'WORKER' && req.user.worker ? req.user.worker.id : job.workerId;
}

function evidenceStatus(job) {
  const proofPhotoCount = Array.isArray(job.proofPhotos) ? job.proofPhotos.length : 0;
  const proofPhotosRequired = Boolean(job.requiresProofPhotos);
  const signatureCaptured = Boolean(job.signature);
  return {
    proofPhotosRequired,
    minimumProofPhotos: proofPhotosRequired ? 1 : 0,
    proofPhotoCount,
    proofPhotosSatisfied: !proofPhotosRequired || proofPhotoCount >= 1,
    signatureRequired: Boolean(job.requiresSignature),
    signatureCaptured,
    signatureSatisfied: !job.requiresSignature || signatureCaptured,
    completionNotesRequired: true
  };
}

function jobWithEvidenceStatus(job) {
  if (!job) return job;
  return { ...job, completionEvidence: evidenceStatus(job) };
}

function createActivityData(req, job, type, note, metadata) {
  return { companyId: req.companyId, jobId: job.id, workerId: lifecycleWorkerId(req, job), userId: req.user.id, type, note, metadata };
}

async function addJobActivity(tx, req, job, type, note, metadata) {
  return tx.jobActivity.create({ data: createActivityData(req, job, type, note, metadata), include: jobActivityInclude });
}

async function addAuditLog(tx, req, action, entity, entityId, metadata) {
  return tx.auditLog.create({ data: { companyId: req.companyId, userId: req.user && req.user.id, action, entity, entityId, metadata } });
}

function assertNotCancelled(job, action) {
  if (job.status === 'CANCELLED') throw new AppError(409, 'Cancelled jobs cannot be ' + action);
}

function assertTransition(job, allowed, target) {
  if (!allowed.includes(job.status)) throw new AppError(409, 'Job must be ' + allowed.map((item) => item.replace(/_/g, ' ')).join(' or ') + ' before it can move to ' + target.replace(/_/g, ' '));
}

async function lifecycleTransition(req, jobId, config) {
  const job = await requireJob(req, jobId, { assignedOnly: req.user.role === 'WORKER' });
  assertNotCancelled(job, config.cancelledLabel || config.type.toLowerCase());
  assertTransition(job, config.allowed, config.status);
  const now = new Date();
  const data = await prisma.$transaction(async (tx) => {
    const updated = await tx.job.update({ where: { id: job.id }, data: { status: config.status, [config.stamp]: now }, include: jobDetailInclude });
    await addJobActivity(tx, req, job, config.type, config.note, { fromStatus: job.status, toStatus: config.status });
    await addAuditLog(tx, req, config.type, 'Job', job.id, { fromStatus: job.status, toStatus: config.status });
    return updated;
  });
  return data;
}

async function validateScheduleRelations(req, body) {
  await requireJob(req, body.jobId, { assignedOnly: false });
  if (body.workerId) await requireWorker(req, body.workerId);
}

const uploadDir = path.resolve(__dirname, '../../uploads/logos');
const proofUploadDir = path.resolve(__dirname, '../../uploads/jobs/proof');
const signatureUploadDir = path.resolve(__dirname, '../../uploads/jobs/signatures');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(proofUploadDir, { recursive: true });
fs.mkdirSync(signatureUploadDir, { recursive: true });

const evidenceImageTypes = ['image/png', 'image/jpeg', 'image/webp'];

function uploadFilename(prefix, file) {
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  return prefix + '-' + crypto.randomUUID() + ext;
}

function singleUpload(upload, fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (error) => {
      if (!error) return next();
      if (error instanceof AppError) return next(error);
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new AppError(400, 'Uploaded image is too large'));
      return next(error);
    });
  };
}

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

const proofUpload = multer({
  storage: multer.diskStorage({
    destination: proofUploadDir,
    filename: (req, file, cb) => cb(null, uploadFilename(req.companyId + '-proof', file))
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!evidenceImageTypes.includes(file.mimetype)) return cb(new AppError(400, 'Only PNG, JPG, and WEBP proof photos are allowed'));
    cb(null, true);
  }
});

const signatureUpload = multer({
  storage: multer.diskStorage({
    destination: signatureUploadDir,
    filename: (req, file, cb) => cb(null, uploadFilename(req.companyId + '-signature', file))
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!evidenceImageTypes.includes(file.mimetype)) return cb(new AppError(400, 'Only PNG, JPG, and WEBP signatures are allowed'));
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
  await tx.quoteStatusHistory.create({ data: { companyId: req.companyId, quoteId: quote.id, fromStatus: quote.status, toStatus, changedById: req.user && req.user.id, note } });
}

async function addInvoiceStatusHistory(tx, req, invoice, toStatus, note) {
  await tx.invoiceStatusHistory.create({ data: { companyId: req.companyId, invoiceId: invoice.id, fromStatus: invoice.status, toStatus, changedById: req.user && req.user.id, note } });
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

const scheduleInclude = { job: { include: { customer: true, service: true } }, worker: { include: SAFE_WORKER_INCLUDE } };
const activeScheduleStatuses = ['SCHEDULED', 'DISPATCHED', 'IN_PROGRESS'];
const scheduleStatusValues = ['SCHEDULED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'];
const conflictTypeValues = ['OVERLAP', 'TIME_OFF', 'OUTSIDE_AVAILABILITY', 'OUTSIDE_WORKING_HOURS', 'INVALID_TIME', 'JOB_NOT_SCHEDULABLE'];
const recurrenceValues = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

const schedulingSettingsSchema = z.object({
  defaultJobDurationMinutes: z.coerce.number().int().positive().optional(),
  defaultTravelBufferMinutes: z.coerce.number().int().min(0).optional(),
  allowOverbooking: z.boolean().optional(),
  defaultJobStatus: z.enum(jobStatusValues).optional(),
  requireCompletionNotes: z.boolean().optional(),
  requireProofPhotos: z.boolean().optional(),
  autoCreateScheduleOnAssign: z.boolean().optional(),
  timezone: z.string().trim().min(1).optional(),
  workingDayStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workingDayEnd: z.string().regex(/^\d{2}:\d{2}$/).optional()
});
const scheduleWriteSchema = z.object({ jobId: z.string().min(1), workerId: z.string().min(1), startsAt: z.coerce.date(), endsAt: optionalDate, durationMinutes: z.coerce.number().int().positive().optional(), travelBufferMinutes: z.coerce.number().int().min(0).optional(), notes: optionalText(1000), adminOverride: z.boolean().optional() });
const schedulePatchSchema = z.object({ workerId: z.string().min(1).optional(), startsAt: optionalDate, endsAt: optionalDate, durationMinutes: z.coerce.number().int().positive().optional(), travelBufferMinutes: z.coerce.number().int().min(0).optional(), notes: optionalText(1000), status: z.enum(scheduleStatusValues).optional(), adminOverride: z.boolean().optional() });
const conflictCheckSchema = scheduleWriteSchema.partial({ jobId: true }).extend({ jobId: z.string().min(1).optional(), workerId: z.string().min(1), startsAt: z.coerce.date() });
const availabilitySchema = z.array(z.object({ dayOfWeek: z.coerce.number().int().min(0).max(6), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.string().trim().min(1).optional(), active: z.boolean().optional() })).max(21);
const workerRoleSchema = z.object({ name: z.string().trim().min(2).max(120), description: optionalText(300), active: z.boolean().optional() });
const timeOffSchema = z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: optionalText(300), status: z.enum(['APPROVED', 'PENDING', 'REJECTED']).optional() });
const recurringJobSchema = z.object({ customerId: z.string().min(1), serviceId: z.string().optional(), workerId: z.string().optional(), title: z.string().min(2), description: optionalText(1000), frequency: z.enum(recurrenceValues), interval: z.coerce.number().int().positive().optional(), startDate: z.coerce.date(), endDate: optionalDate, preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), durationMinutes: z.coerce.number().int().positive(), active: z.boolean().optional(), nextRunAt: optionalDate });

function minutesFromTime(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function schedulingDefaults() {
  return { defaultJobDurationMinutes: 60, defaultTravelBufferMinutes: 0, allowOverbooking: false, defaultJobStatus: 'NEW', requireCompletionNotes: true, requireProofPhotos: true, autoCreateScheduleOnAssign: false, timezone: 'UTC', workingDayStart: '08:00', workingDayEnd: '17:00' };
}

async function getSchedulingSettings(companyId) {
  const existing = await prisma.companySchedulingSettings.findUnique({ where: { companyId } });
  return { ...schedulingDefaults(), ...(existing || {}) };
}

async function requireScheduleItem(req, id) {
  const where = { id, companyId: req.companyId, ...(req.user.role === 'WORKER' ? { workerId: req.user.worker ? req.user.worker.id : '__none__' } : {}) };
  const record = await prisma.scheduleItem.findFirst({ where, include: scheduleInclude });
  if (!record) throw notFound('Schedule item not found');
  return record;
}

function scheduleWindow(input, job, settings) {
  const startsAt = new Date(input.startsAt);
  const duration = Number(input.durationMinutes || job.durationMinutes || settings.defaultJobDurationMinutes || 60);
  const endsAt = input.endsAt ? new Date(input.endsAt) : addMinutes(startsAt, duration);
  const travelBufferMinutes = Number(input.travelBufferMinutes ?? job.travelBufferMinutes ?? settings.defaultTravelBufferMinutes ?? 0);
  return { startsAt, endsAt, durationMinutes: duration, travelBufferMinutes };
}

async function checkScheduleConflicts(req, input, options = {}) {
  const settings = await getSchedulingSettings(req.companyId);
  const job = options.job || (input.jobId ? await requireJob(req, input.jobId, { assignedOnly: req.user.role === 'WORKER' }) : { id: input.jobId, status: 'NEW' });
  const worker = await requireWorker(req, input.workerId);
  const window = scheduleWindow(input, job, settings);
  const conflicts = [];
  const add = (type, message, relatedJobId) => conflicts.push({ type, message, ...(relatedJobId ? { relatedJobId } : {}) });

  if (!worker.active) add('OUTSIDE_AVAILABILITY', 'Worker is inactive.');
  if (!(window.startsAt instanceof Date) || Number.isNaN(window.startsAt.getTime()) || !(window.endsAt instanceof Date) || Number.isNaN(window.endsAt.getTime()) || window.endsAt <= window.startsAt) add('INVALID_TIME', 'Schedule start and end must be valid and end after start.');
  if (job.status === 'CANCELLED') add('JOB_NOT_SCHEDULABLE', 'Cancelled jobs cannot be scheduled.');
  if (job.status === 'COMPLETED') add('JOB_NOT_SCHEDULABLE', 'Completed jobs cannot be scheduled.');

  if (!conflicts.some((item) => item.type === 'INVALID_TIME')) {
    const startMinute = minutesOfDay(window.startsAt);
    const endMinute = minutesOfDay(window.endsAt);
    if (startMinute < minutesFromTime(settings.workingDayStart) || endMinute > minutesFromTime(settings.workingDayEnd)) add('OUTSIDE_WORKING_HOURS', 'Schedule is outside company working hours.');

    const workerAvailability = await prisma.workerAvailability.findMany({ where: { companyId: req.companyId, workerId: worker.id, active: true, dayOfWeek: window.startsAt.getDay() } });
    const roleAvailability = !workerAvailability.length && worker.roleId ? await prisma.roleAvailability.findMany({ where: { companyId: req.companyId, roleId: worker.roleId, active: true, dayOfWeek: window.startsAt.getDay() } }) : [];
    const availability = workerAvailability.length ? workerAvailability : roleAvailability;
    if (availability.length && !availability.some((slot) => startMinute >= minutesFromTime(slot.startTime) && endMinute <= minutesFromTime(slot.endTime))) add('OUTSIDE_AVAILABILITY', workerAvailability.length ? 'Schedule is outside worker availability.' : 'Schedule is outside role availability.');

    const timeOff = await prisma.workerTimeOff.findMany({ where: { companyId: req.companyId, workerId: worker.id, status: 'APPROVED' } });
    for (const item of timeOff) {
      if (rangesOverlap(window.startsAt, window.endsAt, new Date(item.startsAt), new Date(item.endsAt))) add('TIME_OFF', 'Worker has approved time off during this schedule.');
    }

    const existing = await prisma.scheduleItem.findMany({ where: { companyId: req.companyId, workerId: worker.id, status: { in: activeScheduleStatuses } }, include: { job: true } });
    const blockedStart = addMinutes(window.startsAt, -window.travelBufferMinutes);
    const blockedEnd = addMinutes(window.endsAt, window.travelBufferMinutes);
    for (const item of existing) {
      if (item.jobId === job.id || item.id === options.excludeScheduleId) continue;
      const itemStart = addMinutes(new Date(item.startsAt), -Number(item.travelBufferMinutes || 0));
      const itemEnd = addMinutes(new Date(item.endsAt || item.startsAt), Number(item.travelBufferMinutes || 0));
      if (rangesOverlap(blockedStart, blockedEnd, itemStart, itemEnd)) add('OVERLAP', 'Worker already has a scheduled job in this time window.', item.jobId);
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts, window, settings, job, worker };
}

async function writeScheduleConflicts(tx, req, jobId, workerId, conflicts, resolved) {
  for (const conflict of conflicts) {
    await tx.scheduleConflict.create({ data: { companyId: req.companyId, jobId, workerId, conflictingJobId: conflict.relatedJobId, conflictType: conflict.type, message: conflict.message, resolved } });
  }
}

async function scheduleJob(req, job, input, options = {}) {
  const result = await checkScheduleConflicts(req, { ...input, jobId: job.id }, { job, excludeScheduleId: options.excludeScheduleId });
  const canOverride = adminRoles.includes(req.user.role) && (input.adminOverride || result.settings.allowOverbooking);
  if (result.hasConflict && !canOverride) throw new AppError(409, 'Schedule conflict detected', { conflicts: result.conflicts });
  const conflictStatus = result.hasConflict ? 'OVERRIDE' : 'CLEAR';
  const data = await prisma.$transaction(async (tx) => {
    if (options.rescheduleExistingId) await tx.scheduleItem.update({ where: { id: options.rescheduleExistingId }, data: { status: 'RESCHEDULED', conflictStatus: 'CLEAR', updatedById: req.user.id } });
    const existing = !options.forceNew ? await tx.scheduleItem.findFirst({ where: { companyId: req.companyId, jobId: job.id, status: { in: activeScheduleStatuses } } }) : null;
    const scheduleData = { companyId: req.companyId, jobId: job.id, workerId: result.worker.id, startsAt: result.window.startsAt, endsAt: result.window.endsAt, status: 'SCHEDULED', conflictStatus, travelBufferMinutes: result.window.travelBufferMinutes, notes: input.notes, createdById: req.user.id, updatedById: req.user.id };
    const schedule = existing ? await tx.scheduleItem.update({ where: { id: existing.id }, data: scheduleData, include: scheduleInclude }) : await tx.scheduleItem.create({ data: scheduleData, include: scheduleInclude });
    const updatedJob = await tx.job.update({ where: { id: job.id }, data: { workerId: result.worker.id, scheduledStart: result.window.startsAt, scheduledEnd: result.window.endsAt, durationMinutes: result.window.durationMinutes, travelBufferMinutes: result.window.travelBufferMinutes, status: 'SCHEDULED', ...(options.rescheduleExistingId ? { rescheduledFromId: options.rescheduleExistingId } : {}) } });
    if (result.hasConflict) await writeScheduleConflicts(tx, req, job.id, result.worker.id, result.conflicts, canOverride);
    return { schedule, job: updatedJob, conflicts: result.conflicts };
  });
  if (result.hasConflict && canOverride) await audit(req, 'OVERRIDE_SCHEDULE_CONFLICT', 'Job', job.id, { conflicts: result.conflicts });
  return data;
}

function nextRecurrenceDate(rule, fromDate) {
  const next = new Date(fromDate);
  const interval = Number(rule.interval || 1);
  if (rule.frequency === 'DAILY') next.setDate(next.getDate() + interval);
  if (rule.frequency === 'WEEKLY') next.setDate(next.getDate() + 7 * interval);
  if (rule.frequency === 'BIWEEKLY') next.setDate(next.getDate() + 14 * interval);
  if (rule.frequency === 'MONTHLY') next.setMonth(next.getMonth() + interval);
  if (rule.frequency === 'QUARTERLY') next.setMonth(next.getMonth() + 3 * interval);
  if (rule.frequency === 'YEARLY') next.setFullYear(next.getFullYear() + interval);
  return next;
}

function dateWithPreferredTime(date, preferredTime) {
  const next = new Date(date);
  if (preferredTime) {
    const [hours, minutes] = preferredTime.split(':').map(Number);
    next.setHours(hours, minutes, 0, 0);
  }
  return next;
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

const accountPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().email().transform((v) => v.toLowerCase()).optional()
});

const passwordPatchSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
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

router.patch('/auth/me', requireAuth, validate(accountPatchSchema), asyncHandler(async (req, res) => {
  const existing = await prisma.user.findFirst({ where: { id: req.user.id, companyId: req.companyId } });
  if (!existing) throw new AppError(404, 'User not found');
  const data = await prisma.user.update({ where: { id: existing.id }, data: req.body, select: SAFE_LOGIN_USER_SELECT });
  setAuthCookie(res, data);
  await audit({ companyId: req.companyId, user: data }, 'UPDATE', 'User', data.id, { section: 'account' });
  sendData(res, publicUser(data));
}));

router.patch('/auth/me/password', requireAuth, validate(passwordPatchSchema), asyncHandler(async (req, res) => {
  const existing = await prisma.user.findFirst({ where: { id: req.user.id, companyId: req.companyId } });
  if (!existing || !(await verifyPassword(req.body.currentPassword, existing.passwordHash))) throw new AppError(401, 'Current password is incorrect');
  const data = await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await hashPassword(req.body.newPassword) }, select: SAFE_LOGIN_USER_SELECT });
  setAuthCookie(res, data);
  await audit({ companyId: req.companyId, user: data }, 'UPDATE', 'User', data.id, { section: 'password' });
  sendData(res, { updated: true });
}));


const bookingRequestInclude = { customer: true, service: true, convertedJob: true, clientAccount: { select: { id: true, name: true, email: true, phone: true, status: true } } };
const publicTimeWindow = z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANY_TIME']).optional().or(z.literal('')).transform((value) => value || undefined);
const publicBookingRequestSchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  customerEmail: optionalEmail,
  customerPhone: optionalText(60),
  address: optionalText(300),
  serviceId: optionalText(120),
  serviceName: optionalText(160),
  preferredDate: optionalDate,
  preferredTimeWindow: publicTimeWindow,
  notes: optionalText(2000),
  source: optionalText(80)
}).refine((data) => data.customerEmail || data.customerPhone, { message: 'Email or phone is required', path: ['customerEmail'] });

async function publicBookingCompany() {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' }, include: { branding: true } });
  if (!company) throw notFound('Company not found');
  return company;
}

function publicCompanySummary(company) {
  const branding = publicBranding(company);
  return { brandName: branding.brandName, logoUrl: branding.logoUrl, primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor, accentColor: branding.accentColor, supportEmail: branding.supportEmail, supportPhone: branding.supportPhone };
}

router.get('/public/company', asyncHandler(async (req, res) => {
  sendData(res, normalize(publicCompanySummary(await publicBookingCompany())));
}));

router.get('/public/services', asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  const services = await prisma.service.findMany({ where: { companyId: company.id, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true, price: true } });
  sendData(res, normalize(services.map((service) => ({ id: service.id, name: service.name, description: service.description || null, basePrice: service.price }))));
}));

router.post('/public/booking-requests', validate(publicBookingRequestSchema), asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  let service = null;
  if (req.body.serviceId) {
    service = await prisma.service.findFirst({ where: { id: req.body.serviceId, companyId: company.id, active: true } });
    if (!service) throw notFound('Service not found');
  }
  const data = await prisma.bookingRequest.create({ data: { companyId: company.id, status: 'NEW', customerName: req.body.customerName, customerEmail: req.body.customerEmail, customerPhone: req.body.customerPhone, address: req.body.address, serviceId: service && service.id, serviceName: service ? service.name : req.body.serviceName, preferredDate: req.body.preferredDate, preferredTimeWindow: req.body.preferredTimeWindow, notes: req.body.notes, source: req.body.source || 'public_booking' } });
  sendData(res, normalize(data), 201);
}));

const CLIENT_COOKIE_NAME = process.env.CLIENT_COOKIE_NAME || "fieldcore_client_token";
const CLIENT_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 8 };
const CLIENT_JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const clientEmailSchema = z.string().trim().email().transform(function(value) { return value.toLowerCase(); });
const clientPasswordSchema = z.string().min(8).max(200);
const clientRegisterSchema = z.object({ name: z.string().trim().min(2).max(160), email: clientEmailSchema, phone: optionalText(60), password: clientPasswordSchema });
const clientLoginSchema = z.object({ email: clientEmailSchema, password: z.string().min(1).max(200) });
const clientProfilePatchSchema = z.object({ name: z.string().trim().min(2).max(160).optional(), phone: optionalText(60) });
const clientChangePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: clientPasswordSchema });
const clientForgotPasswordSchema = z.object({ email: clientEmailSchema });

function signClientToken(account) {
  return jwt.sign({ sub: account.id, companyId: account.companyId, kind: "client" }, CLIENT_JWT_SECRET, { expiresIn: "8h" });
}

function setClientAuthCookie(res, account) {
  res.cookie(CLIENT_COOKIE_NAME, signClientToken(account), CLIENT_COOKIE_OPTIONS);
}

function clearClientAuthCookie(res) {
  res.clearCookie(CLIENT_COOKIE_NAME, { sameSite: CLIENT_COOKIE_OPTIONS.sameSite, secure: CLIENT_COOKIE_OPTIONS.secure });
}

function publicClientAccount(account) {
  if (!account) return null;
  return { id: account.id, companyId: account.companyId, customerId: account.customerId || null, name: account.name, email: account.email, phone: account.phone || null, status: account.status, lastLoginAt: account.lastLoginAt || null, createdAt: account.createdAt, updatedAt: account.updatedAt };
}

async function requireClientAuth(req, res, next) {
  try {
    const token = req.cookies[CLIENT_COOKIE_NAME];
    if (!token) throw new AppError(401, "Client authentication required");
    const payload = jwt.verify(token, CLIENT_JWT_SECRET);
    if (payload.kind !== "client") throw new AppError(401, "Client authentication required");
    const account = await prisma.clientAccount.findFirst({ where: { id: payload.sub, companyId: payload.companyId } });
    if (!account || account.status === "DISABLED") throw new AppError(401, "Client authentication required");
    req.clientAccount = account;
    req.companyId = account.companyId;
    next();
  } catch (error) {
    next(error.status ? error : new AppError(401, "Client authentication required"));
  }
}

async function findOrCreateClientCustomer(companyId, input) {
  let customer = null;
  if (input.email) customer = await prisma.customer.findFirst({ where: { companyId: companyId, email: input.email } });
  if (!customer && input.phone) customer = await prisma.customer.findFirst({ where: { companyId: companyId, phone: input.phone } });
  if (customer) return customer;
  return prisma.customer.create({ data: { companyId: companyId, name: input.name, email: input.email, phone: input.phone } });
}

function uniqueRequests(records) {
  const seen = new Set();
  return records.filter(function(record) { if (!record || seen.has(record.id)) return false; seen.add(record.id); return true; }).sort(function(a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
}

async function clientBookingRequests(account, extra) {
  const filters = [
    { clientAccountId: account.id },
    account.customerId ? { customerId: account.customerId } : null,
    account.email ? { customerEmail: account.email } : null,
    account.phone ? { customerPhone: account.phone } : null
  ].filter(Boolean);
  const lists = await Promise.all(filters.map(function(filter) {
    return prisma.bookingRequest.findMany({ where: { companyId: account.companyId, ...filter, ...(extra || {}) }, include: bookingRequestInclude, orderBy: { createdAt: "desc" } });
  }));
  return uniqueRequests([].concat.apply([], lists));
}

router.post("/client/auth/register", validate(clientRegisterSchema), asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  const existing = await prisma.clientAccount.findFirst({ where: { companyId: company.id, email: req.body.email } });
  if (existing) throw new AppError(409, "A client account already exists for this email");
  const customer = await findOrCreateClientCustomer(company.id, req.body);
  const account = await prisma.clientAccount.create({ data: { companyId: company.id, customerId: customer.id, name: req.body.name, email: req.body.email, phone: req.body.phone, passwordHash: await hashPassword(req.body.password), status: "ACTIVE" } });
  setClientAuthCookie(res, account);
  sendData(res, normalize(publicClientAccount(account)), 201);
}));

router.post("/client/auth/login", validate(clientLoginSchema), asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  const account = await prisma.clientAccount.findFirst({ where: { companyId: company.id, email: req.body.email } });
  if (!account || !(await verifyPassword(req.body.password, account.passwordHash))) throw new AppError(401, "Invalid email or password");
  if (account.status === "DISABLED") throw new AppError(403, "Client account is disabled");
  const updated = await prisma.clientAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  setClientAuthCookie(res, updated);
  sendData(res, normalize(publicClientAccount(updated)));
}));

router.post("/client/auth/logout", (req, res) => {
  clearClientAuthCookie(res);
  sendData(res, { loggedOut: true });
});

router.get("/client/auth/session", asyncHandler(async (req, res) => {
  const token = req.cookies[CLIENT_COOKIE_NAME];
  if (!token) return sendData(res, null);
  try {
    const payload = jwt.verify(token, CLIENT_JWT_SECRET);
    if (payload.kind !== "client") return sendData(res, null);
    const account = await prisma.clientAccount.findFirst({ where: { id: payload.sub, companyId: payload.companyId } });
    if (!account || account.status === "DISABLED") return sendData(res, null);
    return sendData(res, normalize(publicClientAccount(account)));
  } catch (error) {
    return sendData(res, null);
  }
}));

router.get("/client/dashboard", requireClientAuth, asyncHandler(async (req, res) => {
  const requests = await clientBookingRequests(req.clientAccount);
  const statusCounts = requests.reduce(function(counts, item) { counts[item.status] = (counts[item.status] || 0) + 1; return counts; }, {});
  const customerWhere = clientCustomerWhere(req.clientAccount);
  const now = new Date();
  const [quotes, jobs, invoices, profileCustomer] = customerWhere ? await Promise.all([
    prisma.quote.findMany({ where: customerWhere, include: quoteInclude, orderBy: { createdAt: "desc" } }),
    prisma.job.findMany({ where: customerWhere, include: { customer: true, service: true, quotes: true, invoices: true, proofPhotos: true, signature: true }, orderBy: { createdAt: "desc" } }),
    prisma.invoice.findMany({ where: customerWhere, include: invoiceInclude, orderBy: { createdAt: "desc" } }),
    prisma.customer.findFirst({ where: { id: req.clientAccount.customerId, companyId: req.clientAccount.companyId } })
  ]) : [[], [], [], null];
  const invoiceIds = invoices.map(function(invoice) { return invoice.id; });
  const receipts = invoiceIds.length ? await prisma.receipt.findMany({ where: { companyId: req.clientAccount.companyId, invoiceId: { in: invoiceIds } }, include: { invoice: true, payment: true }, orderBy: { issuedAt: "desc" } }) : [];
  const stats = {
    totalRequests: requests.length,
    activeRequests: requests.filter(function(item) { return !["DECLINED", "CANCELLED", "CONVERTED"].includes(item.status); }).length,
    openBookingRequests: requests.filter(function(item) { return ["NEW", "REVIEWED"].includes(item.status); }).length,
    pendingQuotes: quotes.filter(function(item) { return item.status === "SENT"; }).length,
    acceptedQuotes: quotes.filter(function(item) { return item.status === "ACCEPTED"; }).length,
    upcomingJobs: jobs.filter(function(item) { return item.scheduledStart && new Date(item.scheduledStart) >= now && !["COMPLETED", "CANCELLED"].includes(item.status); }).length,
    activeJobs: jobs.filter(function(item) { return ["SCHEDULED", "DISPATCHED", "ARRIVED", "IN_PROGRESS", "PAUSED", "ON_HOLD"].includes(item.status); }).length,
    unpaidInvoices: invoices.filter(function(item) { return Number(item.balanceDue || item.total || 0) > 0 && item.status !== "VOID"; }).length,
    paidInvoices: invoices.filter(function(item) { return item.status === "PAID"; }).length,
    receipts: receipts.length,
    statusCounts: statusCounts,
    profileComplete: Boolean(req.clientAccount.name && req.clientAccount.email && req.clientAccount.phone && profileCustomer && profileCustomer.address)
  };
  sendData(res, normalize({
    client: publicClientAccount(req.clientAccount),
    stats,
    recentRequests: requests.slice(0, 5),
    recentQuotes: quotes.slice(0, 5).map(clientQuote),
    recentJobs: jobs.slice(0, 5).map(clientJob),
    recentInvoices: invoices.slice(0, 5).map(clientInvoice),
    recentReceipts: receipts.slice(0, 5).map(clientReceipt),
    recentActivity: requests.slice(0, 3).map(function(item) { return { type: "REQUEST", label: "Request " + String(item.status || "").toLowerCase().replace(/_/g, " "), createdAt: item.updatedAt || item.createdAt, request: item }; })
  }));
}));

router.get("/client/booking-requests", requireClientAuth, asyncHandler(async (req, res) => {
  sendData(res, normalize(await clientBookingRequests(req.clientAccount)));
}));

router.get("/client/booking-requests/:id", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const matches = await clientBookingRequests(req.clientAccount, { id: req.params.id });
  if (!matches.length) throw notFound("Booking request not found");
  sendData(res, normalize(matches[0]));
}));

router.post("/client/booking-requests", requireClientAuth, validate(publicBookingRequestSchema), asyncHandler(async (req, res) => {
  let service = null;
  if (req.body.serviceId) {
    service = await prisma.service.findFirst({ where: { id: req.body.serviceId, companyId: req.clientAccount.companyId, active: true } });
    if (!service) throw notFound("Service not found");
  }
  const data = await prisma.bookingRequest.create({ data: { companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId, clientAccountId: req.clientAccount.id, status: "NEW", customerName: req.body.customerName, customerEmail: req.body.customerEmail || req.clientAccount.email, customerPhone: req.body.customerPhone || req.clientAccount.phone, address: req.body.address, serviceId: service && service.id, serviceName: service ? service.name : req.body.serviceName, preferredDate: req.body.preferredDate, preferredTimeWindow: req.body.preferredTimeWindow, notes: req.body.notes, source: "client_portal" } });
  sendData(res, normalize(data), 201);
}));

router.get("/client/profile", requireClientAuth, asyncHandler(async (req, res) => {
  const customer = req.clientAccount.customerId ? await prisma.customer.findFirst({ where: { id: req.clientAccount.customerId, companyId: req.clientAccount.companyId } }) : null;
  sendData(res, normalize({ client: publicClientAccount(req.clientAccount), customer: customer && { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, address: customer.address } }));
}));

router.patch("/client/profile", requireClientAuth, validate(clientProfilePatchSchema), asyncHandler(async (req, res) => {
  const data = { name: req.body.name, phone: req.body.phone };
  const account = await prisma.clientAccount.update({ where: { id: req.clientAccount.id }, data: data });
  if (account.customerId && (data.name !== undefined || data.phone !== undefined)) {
    await prisma.customer.update({ where: { id: account.customerId }, data: { name: data.name, phone: data.phone } });
  }
  sendData(res, normalize(publicClientAccount(account)));
}));

router.post("/client/profile/password", requireClientAuth, validate(clientChangePasswordSchema), asyncHandler(async (req, res) => {
  const account = await prisma.clientAccount.findFirst({ where: { id: req.clientAccount.id, companyId: req.clientAccount.companyId } });
  if (!account || !(await verifyPassword(req.body.currentPassword, account.passwordHash))) throw new AppError(401, "Current password is incorrect");
  await prisma.clientAccount.update({ where: { id: account.id }, data: { passwordHash: await hashPassword(req.body.newPassword) } });
  sendData(res, { updated: true });
}));

router.post("/client/auth/forgot-password", validate(clientForgotPasswordSchema), asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  await prisma.clientAccount.findFirst({ where: { companyId: company.id, email: req.body.email } });
  sendData(res, { requested: true });
}));

const clientRejectSchema = z.object({ reason: optionalText(500) });
const clientPropertySchema = z.object({ label: optionalText(120), address: z.string().trim().min(1).max(300), city: optionalText(120), notes: optionalText(1000), isDefault: z.boolean().optional() });
function clientCustomerWhere(account) { return account.customerId ? { companyId: account.companyId, customerId: account.customerId } : null; }
function clientLine(item) { return item && { id: item.id, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount, taxAmount: item.taxAmount, lineTotal: item.lineTotal, sortOrder: item.sortOrder }; }
function clientCustomer(customer) { return customer && { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, address: customer.address }; }
function clientJobSummary(job) { return job && { id: job.id, title: job.title, status: job.status, scheduledStart: job.scheduledStart, scheduledEnd: job.scheduledEnd, completedAt: job.completedAt }; }
function clientQuote(quote) { return quote && { id: quote.id, quoteNumber: quote.id, customerId: quote.customerId, title: quote.title, description: quote.description, status: quote.status, service: quote.service && { id: quote.service.id, name: quote.service.name }, customer: clientCustomer(quote.customer), job: clientJobSummary(quote.job), createdAt: quote.createdAt, updatedAt: quote.updatedAt, validUntil: quote.validUntil, sentAt: quote.sentAt, acceptedAt: quote.acceptedAt, rejectedAt: quote.rejectedAt, subtotal: quote.subtotal, tax: quote.taxTotal, discount: quote.discountTotal, total: quote.total, amount: quote.amount, lineItems: (quote.lineItems || []).map(clientLine) }; }
function clientPayment(payment) { return payment && { id: payment.id, invoiceId: payment.invoiceId, amount: payment.amount, method: payment.method, status: payment.status, reference: payment.reference, receivedAt: payment.receivedAt, confirmedAt: payment.confirmedAt, createdAt: payment.createdAt }; }
function clientReceipt(receipt) { return receipt && { id: receipt.id, receiptNumber: receipt.receiptNumber, invoiceId: receipt.invoiceId, paymentId: receipt.paymentId, amount: receipt.amount, issuedAt: receipt.issuedAt, createdAt: receipt.createdAt, invoice: receipt.invoice && { id: receipt.invoice.id, number: receipt.invoice.number, status: receipt.invoice.status }, payment: clientPayment(receipt.payment) }; }
function clientInvoice(invoice) { const paid = (invoice.payments || []).filter(function(p) { return p.status === "CONFIRMED"; }).reduce(function(sum, p) { return sum + Number(p.amount || 0); }, 0); return invoice && { id: invoice.id, invoiceNumber: invoice.number, number: invoice.number, status: invoice.status, customerId: invoice.customerId, quoteId: invoice.quoteId, jobId: invoice.jobId, service: invoice.service && { id: invoice.service.id, name: invoice.service.name }, customer: clientCustomer(invoice.customer), quote: invoice.quote && { id: invoice.quote.id, title: invoice.quote.title, status: invoice.quote.status }, job: clientJobSummary(invoice.job), createdAt: invoice.createdAt, updatedAt: invoice.updatedAt, dueDate: invoice.dueDate, subtotal: invoice.subtotal, tax: invoice.taxTotal, discount: invoice.discountTotal, total: invoice.total, amountPaid: paid, amountDue: invoice.balanceDue, balanceDue: invoice.balanceDue, lineItems: (invoice.lineItems || []).map(clientLine), payments: (invoice.payments || []).map(clientPayment), receipts: (invoice.receipts || []).map(clientReceipt) }; }
function clientJob(job) { return job && { id: job.id, title: job.title, description: job.description, status: job.status, customerId: job.customerId, quoteId: job.quotes && job.quotes[0] && job.quotes[0].id, invoiceId: job.invoices && job.invoices[0] && job.invoices[0].id, service: job.service && { id: job.service.id, name: job.service.name, description: job.service.description }, customer: clientCustomer(job.customer), scheduledStart: job.scheduledStart, scheduledEnd: job.scheduledEnd, address: job.customer && job.customer.address, arrivedAt: job.arrivedAt, startedAt: job.startedAt, pausedAt: job.pausedAt, resumedAt: job.resumedAt, completedAt: job.completedAt, completionNotes: job.completionNotes, requiresProofPhotos: job.requiresProofPhotos, minimumProofPhotos: job.minimumProofPhotos, requiresSignature: job.requiresSignature, proofCompletedAt: job.proofCompletedAt, signatureCompletedAt: job.signatureCompletedAt, total: job.total, createdAt: job.createdAt, updatedAt: job.updatedAt, proofPhotos: (job.proofPhotos || []).map(clientProofPhoto), signature: clientSignature(job.signature) }; }
function clientProofPhoto(photo) { return photo && { id: photo.id, jobId: photo.jobId, url: photo.url, caption: photo.caption, createdAt: photo.createdAt }; }
function clientSignature(signature) { return signature && { id: signature.id, jobId: signature.jobId, signatureUrl: signature.signatureUrl, signedByName: signature.signerName, createdAt: signature.createdAt }; }
function clientActivity(item) { const labels = { ASSIGNED: "Job scheduled", ARRIVED: "Worker arrived", STARTED: "Work started", PAUSED: "Work paused", RESUMED: "Work resumed", COMPLETED: "Work completed", PROOF_PHOTO_ADDED: "Proof uploaded", SIGNATURE_ADDED: "Signature collected" }; return labels[item.type] && { id: item.id, jobId: item.jobId, type: item.type, label: labels[item.type], note: item.type === "COMPLETED" ? item.note : undefined, createdAt: item.createdAt }; }
async function clientOwnedQuote(account, id) { if (!account.customerId) return null; return prisma.quote.findFirst({ where: { id: id, companyId: account.companyId, customerId: account.customerId }, include: quoteInclude }); }
async function clientOwnedInvoice(account, id) { if (!account.customerId) return null; return prisma.invoice.findFirst({ where: { id: id, companyId: account.companyId, customerId: account.customerId }, include: invoiceInclude }); }
async function clientOwnedJob(account, id) { if (!account.customerId) return null; return prisma.job.findFirst({ where: { id: id, companyId: account.companyId, customerId: account.customerId }, include: { customer: true, service: true, quotes: true, invoices: true, proofPhotos: { orderBy: { createdAt: "desc" } }, signature: true } }); }
async function clientInvoiceIds(account) { if (!account.customerId) return []; const rows = await prisma.invoice.findMany({ where: { companyId: account.companyId, customerId: account.customerId }, select: { id: true } }); return rows.map(function(row) { return row.id; }); }
async function clientOwnedReceipt(account, id) { const invoiceIds = await clientInvoiceIds(account); if (!invoiceIds.length) return null; return prisma.receipt.findFirst({ where: { id: id, companyId: account.companyId, invoiceId: { in: invoiceIds } }, include: { invoice: true, payment: true } }); }

router.get("/client/quotes", requireClientAuth, asyncHandler(async (req, res) => {
  const where = clientCustomerWhere(req.clientAccount);
  if (!where) return sendData(res, []);
  const data = await prisma.quote.findMany({ where, include: quoteInclude, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(data.map(clientQuote)));
}));

router.get("/client/quotes/:id", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const quote = await clientOwnedQuote(req.clientAccount, req.params.id);
  if (!quote) throw notFound("Quote not found");
  sendData(res, normalize(clientQuote(quote)));
}));

router.post("/client/quotes/:id/accept", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const quote = await clientOwnedQuote(req.clientAccount, req.params.id);
  if (!quote) throw notFound("Quote not found");
  if (["REJECTED", "EXPIRED", "DRAFT"].includes(quote.status)) throw new AppError(409, "Quote cannot be accepted");
  const data = await prisma.$transaction(async (tx) => {
    const current = await tx.quote.findFirst({ where: { id: quote.id, companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId }, include: quoteInclude });
    if (!current) throw notFound("Quote not found");
    if (current.status === "ACCEPTED" && current.jobId) return current;
    if (!["SENT", "ACCEPTED"].includes(current.status)) throw new AppError(409, "Only sent quotes can be accepted");
    let jobId = current.jobId;
    if (!jobId) {
      const job = await tx.job.create({ data: { companyId: req.clientAccount.companyId, customerId: current.customerId, serviceId: current.serviceId, title: current.title, description: current.description, total: current.total || current.amount } });
      jobId = job.id;
    }
    if (current.status !== "ACCEPTED") {
      await tx.quoteStatusHistory.create({ data: { companyId: req.clientAccount.companyId, quoteId: current.id, fromStatus: current.status, toStatus: "ACCEPTED", note: "Quote accepted by client" } });
    }
    await tx.auditLog.create({ data: { companyId: req.clientAccount.companyId, action: "CLIENT_ACCEPT", entity: "Quote", entityId: current.id, metadata: { clientAccountId: req.clientAccount.id, jobId } } });
    return tx.quote.update({ where: { id: current.id }, data: { status: "ACCEPTED", acceptedAt: current.acceptedAt || new Date(), jobId }, include: quoteInclude });
  });
  sendData(res, normalize(clientQuote(data)));
}));

router.post("/client/quotes/:id/reject", requireClientAuth, validate(idParam, "params"), validate(clientRejectSchema), asyncHandler(async (req, res) => {
  const quote = await clientOwnedQuote(req.clientAccount, req.params.id);
  if (!quote) throw notFound("Quote not found");
  if (quote.status === "REJECTED") return sendData(res, normalize(clientQuote(quote)));
  if (quote.status !== "SENT") throw new AppError(409, "Only sent quotes can be rejected");
  const note = req.body.reason ? "Quote rejected by client: " + req.body.reason : "Quote rejected by client";
  const data = await prisma.$transaction(async (tx) => {
    await tx.quoteStatusHistory.create({ data: { companyId: req.clientAccount.companyId, quoteId: quote.id, fromStatus: quote.status, toStatus: "REJECTED", note } });
    await tx.auditLog.create({ data: { companyId: req.clientAccount.companyId, action: "CLIENT_REJECT", entity: "Quote", entityId: quote.id, metadata: { clientAccountId: req.clientAccount.id, reason: req.body.reason } } });
    return tx.quote.update({ where: { id: quote.id }, data: { status: "REJECTED", rejectedAt: new Date() }, include: quoteInclude });
  });
  sendData(res, normalize(clientQuote(data)));
}));

router.get("/client/invoices", requireClientAuth, asyncHandler(async (req, res) => {
  const where = clientCustomerWhere(req.clientAccount);
  if (!where) return sendData(res, []);
  const data = await prisma.invoice.findMany({ where, include: invoiceInclude, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(data.map(clientInvoice)));
}));

router.get("/client/invoices/:id", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const invoice = await clientOwnedInvoice(req.clientAccount, req.params.id);
  if (!invoice) throw notFound("Invoice not found");
  sendData(res, normalize(clientInvoice(invoice)));
}));

router.get("/client/payments", requireClientAuth, asyncHandler(async (req, res) => {
  const invoiceIds = await clientInvoiceIds(req.clientAccount);
  if (!invoiceIds.length) return sendData(res, []);
  const data = await prisma.payment.findMany({ where: { companyId: req.clientAccount.companyId, invoiceId: { in: invoiceIds } }, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(data.map(clientPayment)));
}));

router.get("/client/receipts", requireClientAuth, asyncHandler(async (req, res) => {
  const invoiceIds = await clientInvoiceIds(req.clientAccount);
  if (!invoiceIds.length) return sendData(res, []);
  const data = await prisma.receipt.findMany({ where: { companyId: req.clientAccount.companyId, invoiceId: { in: invoiceIds } }, include: { invoice: true, payment: true }, orderBy: { issuedAt: "desc" } });
  sendData(res, normalize(data.map(clientReceipt)));
}));

router.get("/client/receipts/:id", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const receipt = await clientOwnedReceipt(req.clientAccount, req.params.id);
  if (!receipt) throw notFound("Receipt not found");
  sendData(res, normalize(clientReceipt(receipt)));
}));

router.get("/client/jobs", requireClientAuth, asyncHandler(async (req, res) => {
  const where = clientCustomerWhere(req.clientAccount);
  if (!where) return sendData(res, []);
  const data = await prisma.job.findMany({ where, include: { customer: true, service: true, quotes: true, invoices: true, proofPhotos: { orderBy: { createdAt: "desc" } }, signature: true }, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(data.map(clientJob)));
}));

router.get("/client/jobs/:id", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await clientOwnedJob(req.clientAccount, req.params.id);
  if (!job) throw notFound("Job not found");
  sendData(res, normalize(clientJob(job)));
}));

router.get("/client/jobs/:id/proof-photos", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await clientOwnedJob(req.clientAccount, req.params.id);
  if (!job) throw notFound("Job not found");
  const data = await prisma.jobProofPhoto.findMany({ where: { companyId: req.clientAccount.companyId, jobId: job.id }, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(data.map(clientProofPhoto)));
}));

router.get("/client/jobs/:id/signature", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await clientOwnedJob(req.clientAccount, req.params.id);
  if (!job) throw notFound("Job not found");
  const data = await prisma.jobSignature.findFirst({ where: { companyId: req.clientAccount.companyId, jobId: job.id } });
  sendData(res, normalize(clientSignature(data)));
}));

router.get("/client/jobs/:id/activity", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await clientOwnedJob(req.clientAccount, req.params.id);
  if (!job) throw notFound("Job not found");
  const rows = await prisma.jobActivity.findMany({ where: { companyId: req.clientAccount.companyId, jobId: job.id, type: { in: ["ASSIGNED", "ARRIVED", "STARTED", "PAUSED", "RESUMED", "COMPLETED", "PROOF_PHOTO_ADDED", "SIGNATURE_ADDED"] } }, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(rows.map(clientActivity).filter(Boolean)));
}));

router.get("/client/properties", requireClientAuth, asyncHandler(async (req, res) => {
  if (!req.clientAccount.customerId) return sendData(res, []);
  const data = await prisma.customerProperty.findMany({ where: { companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  sendData(res, normalize(data));
}));

router.post("/client/properties", requireClientAuth, validate(clientPropertySchema), asyncHandler(async (req, res) => {
  if (!req.clientAccount.customerId) throw new AppError(409, "A linked customer is required before adding properties");
  const data = await prisma.$transaction(async (tx) => {
    if (req.body.isDefault) await tx.customerProperty.updateMany({ where: { companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId }, data: { isDefault: false } });
    return tx.customerProperty.create({ data: { companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId, clientAccountId: req.clientAccount.id, label: req.body.label || "Property", address: req.body.address, city: req.body.city, notes: req.body.notes, isDefault: Boolean(req.body.isDefault) } });
  });
  sendData(res, normalize(data), 201);
}));

router.patch("/client/properties/:id", requireClientAuth, validate(idParam, "params"), validate(clientPropertySchema.partial()), asyncHandler(async (req, res) => {
  if (!req.clientAccount.customerId) throw notFound("Property not found");
  const existing = await prisma.customerProperty.findFirst({ where: { id: req.params.id, companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId } });
  if (!existing) throw notFound("Property not found");
  const data = await prisma.$transaction(async (tx) => {
    if (req.body.isDefault) await tx.customerProperty.updateMany({ where: { companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId }, data: { isDefault: false } });
    return tx.customerProperty.update({ where: { id: existing.id }, data: { label: req.body.label, address: req.body.address, city: req.body.city, notes: req.body.notes, isDefault: req.body.isDefault } });
  });
  sendData(res, normalize(data));
}));

router.delete("/client/properties/:id", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  if (!req.clientAccount.customerId) throw notFound("Property not found");
  const existing = await prisma.customerProperty.findFirst({ where: { id: req.params.id, companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId } });
  if (!existing) throw notFound("Property not found");
  await prisma.customerProperty.delete({ where: { id: existing.id } });
  sendData(res, { deleted: true });
}));

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

  if (req.user.role === 'WORKER') {
    const workerId = req.user.worker ? req.user.worker.id : '__none__';
    const workerWhere = { companyId, workerId };
    const [company, activeJob, jobsToday, upcomingJobs, completedJobs, assignedJobs] = await Promise.all([
      getCompanyWithBranding(companyId),
      prisma.job.findFirst({ where: { ...workerWhere, status: { in: ['IN_PROGRESS', 'PAUSED'] } }, include: jobInclude, orderBy: { updatedAt: 'desc' } }),
      prisma.job.findMany({ where: { ...workerWhere, scheduledStart: { gte: start, lt: end } }, include: jobInclude, orderBy: { scheduledStart: 'asc' }, take: 10 }),
      prisma.job.findMany({ where: { ...workerWhere, scheduledStart: { gte: end } }, include: jobInclude, orderBy: { scheduledStart: 'asc' }, take: 5 }),
      prisma.job.count({ where: { ...workerWhere, status: 'COMPLETED', completedAt: { gte: start, lt: end } } }),
      prisma.job.findMany({ where: workerWhere, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 100 })
    ]);

    const assignedJobIds = assignedJobs.map((job) => job.id);
    const recentActivity = assignedJobIds.length
      ? await prisma.jobActivity.findMany({ where: { companyId, jobId: { in: assignedJobIds }, type: { in: ['ARRIVED', 'STARTED', 'PAUSED', 'RESUMED', 'COMPLETED'] } }, include: { ...jobActivityInclude, job: { include: { customer: true } } }, orderBy: { createdAt: 'desc' }, take: 8 })
      : [];
    const workerJobSummary = (job) => job && ({
      id: job.id,
      title: job.title,
      status: job.status,
      scheduledStart: job.scheduledStart,
      scheduledEnd: job.scheduledEnd,
      customer: job.customer ? { id: job.customer.id, name: job.customer.name, address: job.customer.address } : null
    });
    const workerActivitySummary = (item) => ({
      id: item.id,
      jobId: item.jobId,
      type: item.type,
      note: item.note,
      createdAt: item.createdAt,
      job: workerJobSummary(item.job)
    });
    const requiredActions = [];
    if (activeJob && activeJob.status === 'IN_PROGRESS') requiredActions.push({ type: 'COMPLETE_ACTIVE_JOB', label: 'Complete active job', jobId: activeJob.id });
    if (activeJob && activeJob.status === 'PAUSED') requiredActions.push({ type: 'RESUME_PAUSED_JOB', label: 'Resume paused job', jobId: activeJob.id });
    for (const job of jobsToday) {
      if (job.status === 'SCHEDULED' && job.scheduledStart && new Date(job.scheduledStart) <= now) requiredActions.push({ type: 'START_SCHEDULED_JOB', label: 'Start scheduled job', jobId: job.id });
      if (!['COMPLETED', 'CANCELLED'].includes(job.status) && job.scheduledEnd && new Date(job.scheduledEnd) < now) requiredActions.push({ type: 'JOB_OVERDUE', label: 'Job overdue', jobId: job.id });
      if (job.status === 'COMPLETED' && !job.completionNotes) requiredActions.push({ type: 'ADD_COMPLETION_NOTES', label: 'Add completion notes', jobId: job.id });
    }

    return sendData(res, normalize({
      role: 'WORKER',
      branding: publicBranding(company),
      company: profileResponse(company),
      today: {
        totalJobs: jobsToday.length,
        completedJobs,
        remainingJobs: Math.max(jobsToday.length - completedJobs, 0),
        activeJob: workerJobSummary(activeJob)
      },
      jobsToday: jobsToday.map(workerJobSummary),
      upcomingJobs: upcomingJobs.map(workerJobSummary),
      recentActivity: recentActivity.map(workerActivitySummary),
      requiredActions
    }));
  }

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


async function requireBookingRequest(req, id, db = prisma) {
  const record = await db.bookingRequest.findFirst({ where: { id, companyId: req.companyId }, include: bookingRequestInclude });
  if (!record) throw notFound('Booking request not found');
  return record;
}

async function findOrCreateBookingCustomer(db, req, request) {
  if (request.customerId) {
    const linked = await db.customer.findFirst({ where: { id: request.customerId, companyId: req.companyId } });
    if (linked) return linked;
  }
  let existing = null;
  if (request.customerEmail) existing = await db.customer.findFirst({ where: { companyId: req.companyId, email: request.customerEmail } });
  if (!existing && request.customerPhone) existing = await db.customer.findFirst({ where: { companyId: req.companyId, phone: request.customerPhone } });
  if (existing) return existing;
  return db.customer.create({ data: { companyId: req.companyId, name: request.customerName, email: request.customerEmail, phone: request.customerPhone, address: request.address, notes: request.notes } });
}

function bookingJobTitle(request) {
  const serviceName = request.service && request.service.name || request.serviceName || 'Service Request';
  return serviceName + ' - ' + request.customerName;
}

function bookingJobDescription(request) {
  return [request.notes, request.address ? 'Address: ' + request.address : null, request.preferredDate ? 'Preferred date: ' + new Date(request.preferredDate).toISOString().slice(0, 10) : null, request.preferredTimeWindow ? 'Preferred time: ' + String(request.preferredTimeWindow).replace(/_/g, ' ') : null].filter(Boolean).join('\n');
}

async function setBookingRequestStatus(req, id, status, action) {
  const existing = await requireBookingRequest(req, id);
  if (existing.status === 'CONVERTED') throw new AppError(409, 'Converted booking requests cannot be changed');
  const data = await prisma.bookingRequest.update({ where: { id: existing.id }, data: { status }, include: bookingRequestInclude });
  await audit(req, action, 'BookingRequest', existing.id, { fromStatus: existing.status, toStatus: status });
  return data;
}

router.get('/booking-requests', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.bookingRequest, req, { where: { companyId: req.companyId }, include: bookingRequestInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.get('/booking-requests/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await requireBookingRequest(req, req.params.id)));
}));

router.post('/booking-requests/:id/review', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await setBookingRequestStatus(req, req.params.id, 'REVIEWED', 'REVIEW')));
}));

router.post('/booking-requests/:id/decline', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await setBookingRequestStatus(req, req.params.id, 'DECLINED', 'DECLINE')));
}));

router.post('/booking-requests/:id/convert', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const existing = await requireBookingRequest(req, req.params.id);
  if (existing.convertedJobId) {
    const job = await prisma.job.findFirst({ where: { id: existing.convertedJobId, companyId: req.companyId }, include: jobInclude });
    return sendData(res, normalize({ ...existing, convertedJob: job || existing.convertedJob }));
  }
  if (['DECLINED', 'CANCELLED'].includes(existing.status)) throw new AppError(409, 'Declined or cancelled booking requests cannot be converted');
  const customer = await findOrCreateBookingCustomer(prisma, req, existing);
  const job = await prisma.job.create({ data: { companyId: req.companyId, customerId: customer.id, serviceId: existing.serviceId, title: bookingJobTitle(existing), description: bookingJobDescription(existing), status: 'NEW', total: existing.service && existing.service.price || 0 }, include: jobInclude });
  const updated = await prisma.bookingRequest.update({ where: { id: existing.id }, data: { status: 'CONVERTED', customerId: customer.id, convertedJobId: job.id }, include: bookingRequestInclude });
  await audit(req, 'CONVERT', 'BookingRequest', existing.id, { customerId: customer.id, jobId: job.id });
  sendData(res, normalize({ ...updated, convertedJob: job }), 201);
}));
const workerCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
  roleId: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  active: z.boolean().optional()
});
const workerPatchSchema = z.object({ roleId: z.string().nullable().optional(), title: z.string().optional(), phone: z.string().optional(), active: z.boolean().optional() });

router.get('/worker-roles', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const roles = await prisma.workerRole.findMany({ where: { companyId: req.companyId }, orderBy: { name: 'asc' } });
  sendData(res, normalize(roles));
}));

router.post('/worker-roles', requireRole(...adminRoles), validate(workerRoleSchema), asyncHandler(async (req, res) => {
  const data = await prisma.workerRole.upsert({ where: { companyId_name: { companyId: req.companyId, name: req.body.name } }, update: { description: req.body.description, active: req.body.active ?? true }, create: { ...req.body, active: req.body.active ?? true, companyId: req.companyId } });
  await audit(req, 'CREATE', 'WorkerRole', data.id);
  sendData(res, normalize(data), 201);
}));

router.patch('/worker-roles/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(workerRoleSchema.partial()), asyncHandler(async (req, res) => {
  await requireWorkerRole(req, req.params.id);
  const data = await prisma.workerRole.update({ where: { id: req.params.id }, data: req.body });
  await audit(req, 'UPDATE', 'WorkerRole', data.id);
  sendData(res, normalize(data));
}));

router.get('/worker-roles/:id/availability', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const role = await requireWorkerRole(req, req.params.id);
  const data = await prisma.roleAvailability.findMany({ where: { companyId: req.companyId, roleId: role.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
  sendData(res, normalize(data));
}));

router.put('/worker-roles/:id/availability', requireRole(...adminRoles), validate(idParam, 'params'), validate(availabilitySchema), asyncHandler(async (req, res) => {
  const role = await requireWorkerRole(req, req.params.id);
  const data = await prisma.$transaction(async (tx) => {
    await tx.roleAvailability.deleteMany({ where: { companyId: req.companyId, roleId: role.id } });
    for (const item of req.body) await tx.roleAvailability.create({ data: { ...item, timezone: item.timezone || 'UTC', active: item.active !== false, companyId: req.companyId, roleId: role.id } });
    return tx.roleAvailability.findMany({ where: { companyId: req.companyId, roleId: role.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
  });
  await audit(req, 'UPDATE', 'RoleAvailability', role.id);
  sendData(res, normalize(data));
}));
router.get('/workers', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.workerProfile, req, { where: { companyId: req.companyId }, include: SAFE_WORKER_INCLUDE, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data.map((w) => ({ ...w, user: publicUser(w.user) }))), 200, result.meta);
}));

router.post('/workers', requireRole(...adminRoles), validate(workerCreateSchema), asyncHandler(async (req, res) => {
  let role = req.body.roleId ? await requireWorkerRole(req, req.body.roleId) : null;
  if (!role && req.body.title) role = await ensureWorkerRole(req, req.body.title);
  const user = await prisma.user.create({
    data: {
      companyId: req.companyId,
      email: req.body.email,
      name: req.body.name,
      role: 'WORKER',
      passwordHash: await hashPassword(req.body.password),
      worker: { create: { companyId: req.companyId, roleId: role && role.id, title: req.body.title || role && role.name, phone: req.body.phone, active: req.body.active ?? true } }
    },
    select: SAFE_LOGIN_USER_SELECT
  });
  await audit(req, 'CREATE', 'WorkerProfile', user.worker.id);
  sendData(res, publicUser(user), 201);
}));

router.patch('/workers/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(workerPatchSchema), asyncHandler(async (req, res) => {
  await requireWorker(req, req.params.id);
  const body = { ...req.body };
  if (body.roleId) await requireWorkerRole(req, body.roleId);
  const data = await prisma.workerProfile.update({ where: { id: req.params.id }, data: body, include: SAFE_WORKER_INCLUDE });
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
  customerId: z.string().min(1),
  serviceId: z.string().optional(),
  workerId: z.string().optional(),
  title: z.string().min(2),
  description: z.string().optional(),
  status: z.enum(jobStatusValues).optional(),
  scheduledStart: optionalDate,
  scheduledEnd: optionalDate,
  durationMinutes: z.coerce.number().int().positive().optional(),
  travelBufferMinutes: z.coerce.number().int().min(0).optional(),
  requiresProofPhotos: z.boolean().optional(),
  minimumProofPhotos: z.coerce.number().int().min(0).max(20).optional(),
  requiresSignature: z.boolean().optional(),
  total: amount.optional(),
  adminOverride: z.boolean().optional()
});

router.get('/jobs', asyncHandler(async (req, res) => {
  const result = await paged(prisma.job, req, { where: { companyId: req.companyId, ...workerJobScope(req) }, include: jobInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.get('/worker/jobs', requireRole('WORKER'), asyncHandler(async (req, res) => {
  const result = await paged(prisma.job, req, { where: { companyId: req.companyId, ...workerJobScope(req) }, include: jobInclude, orderBy: { scheduledStart: 'asc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/jobs', requireRole(...adminRoles), validate(jobSchema), asyncHandler(async (req, res) => {
  await validateJobRelations(req, req.body);

  const wantsSchedule = Boolean(req.body.scheduledStart);

  if (wantsSchedule && !req.body.workerId) {
    throw new AppError(400, 'Worker is required when scheduling a job.');
  }

  if (wantsSchedule) {
    const fakeJob = {
      id: '__new_job__',
      status: req.body.status || 'NEW',
      durationMinutes: req.body.durationMinutes,
      travelBufferMinutes: req.body.travelBufferMinutes
    };

    const conflictCheck = await checkScheduleConflicts(
      req,
      {
        jobId: fakeJob.id,
        workerId: req.body.workerId,
        startsAt: req.body.scheduledStart,
        endsAt: req.body.scheduledEnd,
        durationMinutes: req.body.durationMinutes,
        travelBufferMinutes: req.body.travelBufferMinutes
      },
      { job: fakeJob }
    );

    const canOverride = adminRoles.includes(req.user.role) && (req.body.adminOverride || conflictCheck.settings.allowOverbooking);

    if (conflictCheck.hasConflict && !canOverride) {
      throw new AppError(409, 'Schedule conflict detected', { conflicts: conflictCheck.conflicts });
    }
  }

  const {
    scheduledStart,
    scheduledEnd,
    adminOverride,
    ...jobData
  } = req.body;

  const data = await prisma.job.create({
    data: {
      ...jobData,
      companyId: req.companyId,
      status: wantsSchedule ? 'NEW' : (jobData.status || 'NEW')
    },
    include: {
      customer: true,
      service: true,
      worker: { include: SAFE_WORKER_INCLUDE }
    }
  });

  if (wantsSchedule) {
    const scheduled = await scheduleJob(req, data, {
      workerId: req.body.workerId,
      startsAt: scheduledStart,
      endsAt: scheduledEnd,
      durationMinutes: req.body.durationMinutes,
      travelBufferMinutes: req.body.travelBufferMinutes,
      adminOverride: req.body.adminOverride
    });

    await audit(req, 'CREATE', 'Job', data.id, { scheduled: true, scheduleItemId: scheduled.schedule.id });

    return sendData(res, normalize({
      ...scheduled.job,
      customer: data.customer,
      service: data.service,
      worker: scheduled.schedule.worker
    }), 201);
  }

  await audit(req, 'CREATE', 'Job', data.id);
  sendData(res, normalize(data), 201);
}));

router.get('/jobs/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id);
  const data = await prisma.job.findUnique({ where: { id: req.params.id }, include: jobDetailInclude });
  sendData(res, normalize(jobWithEvidenceStatus(data)));
}));

router.get('/worker/jobs/:id', requireRole('WORKER'), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id, { assignedOnly: true });
  const data = await prisma.job.findUnique({ where: { id: req.params.id }, include: jobDetailInclude });
  sendData(res, normalize(jobWithEvidenceStatus(data)));
}));

router.patch('/jobs/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(jobSchema.partial()), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id, { assignedOnly: false });
  await validateJobRelations(req, req.body);
  const data = await prisma.job.update({ where: { id: req.params.id }, data: req.body, include: jobDetailInclude });
  await audit(req, 'UPDATE', 'Job', data.id);
  sendData(res, normalize(jobWithEvidenceStatus(data)));
}));

router.post('/jobs/:id/assign-worker', requireRole(...adminRoles), validate(idParam, 'params'), validate(z.object({ workerId: z.string().min(1) })), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id, { assignedOnly: false });
  await requireWorker(req, req.body.workerId);
  const data = await prisma.$transaction(async (tx) => {
    const updated = await tx.job.update({ where: { id: req.params.id }, data: { workerId: req.body.workerId, status: 'SCHEDULED' } });
    await addJobActivity(tx, req, updated, 'ASSIGNED', null, { workerId: req.body.workerId });
    await addAuditLog(tx, req, 'ASSIGN_WORKER', 'Job', updated.id, { workerId: req.body.workerId });
    return updated;
  });
  sendData(res, normalize(data));
}));

const noteActivitySchema = z.object({ note: z.string().trim().min(1).max(2000), metadata: z.record(z.any()).optional() });
const completeJobSchema = z.object({ completionNotes: z.string().trim().min(1).max(2000).optional(), adminOverride: z.boolean().optional(), customerSignatureUrl: z.string().url().optional(), proofPhotoIds: z.array(z.string().min(1)).optional() });

router.post('/jobs/:id/arrive', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await lifecycleTransition(req, req.params.id, { allowed: ['SCHEDULED', 'DISPATCHED'], status: 'ARRIVED', stamp: 'arrivedAt', type: 'ARRIVED', cancelledLabel: 'arrived' });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/start', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await lifecycleTransition(req, req.params.id, { allowed: ['ARRIVED', 'SCHEDULED', 'DISPATCHED'], status: 'IN_PROGRESS', stamp: 'startedAt', type: 'STARTED', cancelledLabel: 'started' });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/pause', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await lifecycleTransition(req, req.params.id, { allowed: ['IN_PROGRESS'], status: 'PAUSED', stamp: 'pausedAt', type: 'PAUSED', cancelledLabel: 'paused' });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/resume', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await lifecycleTransition(req, req.params.id, { allowed: ['PAUSED'], status: 'IN_PROGRESS', stamp: 'resumedAt', type: 'RESUMED', cancelledLabel: 'resumed' });
  sendData(res, normalize(data));
}));

router.post("/jobs/:id/complete", validate(idParam, "params"), validate(completeJobSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  if (job.status === "COMPLETED") {
    const existing = await prisma.job.findFirst({ where: { id: job.id, companyId: req.companyId }, include: jobDetailInclude });
    return sendData(res, normalize(jobWithEvidenceStatus(existing)));
  }
  assertNotCancelled(job, "completed");
  const isAdmin = adminRoles.includes(req.user.role);
  if (req.body.adminOverride && !isAdmin) throw new AppError(403, "Only admins can use completion override");
  if (!req.body.completionNotes && !req.body.adminOverride) throw new AppError(400, "Completion notes are required");
  if (!["IN_PROGRESS", "PAUSED"].includes(job.status) && !(isAdmin && req.body.adminOverride)) assertTransition(job, ["IN_PROGRESS", "PAUSED"], "COMPLETED");
  const [proofPhotoCount, signature] = await Promise.all([
    prisma.jobProofPhoto.count({ where: { companyId: req.companyId, jobId: job.id } }),
    prisma.jobSignature.findFirst({ where: { companyId: req.companyId, jobId: job.id } })
  ]);
  const missing = {
    proofPhotos: Boolean(job.requiresProofPhotos) && proofPhotoCount < 1,
    signature: Boolean(job.requiresSignature) && !signature
  };
  if ((missing.proofPhotos || missing.signature) && !req.body.adminOverride) {
    throw new AppError(409, "Completion evidence is required", {
      proofPhotos: { required: Boolean(job.requiresProofPhotos), minimum: Boolean(job.requiresProofPhotos) ? 1 : 0, count: proofPhotoCount, satisfied: !missing.proofPhotos },
      signature: { required: Boolean(job.requiresSignature), captured: Boolean(signature), satisfied: !missing.signature }
    });
  }
  const now = new Date();
  const updateData = {
    status: "COMPLETED",
    completedAt: now,
    completionNotes: req.body.completionNotes || job.completionNotes
  };
  if (proofPhotoCount > 0 && !job.proofCompletedAt) updateData.proofCompletedAt = now;
  if (signature && !job.signatureCompletedAt) updateData.signatureCompletedAt = now;
  const data = await prisma.$transaction(async (tx) => {
    const updated = await tx.job.update({ where: { id: job.id }, data: updateData, include: jobDetailInclude });
    await addJobActivity(tx, req, job, "COMPLETED", req.body.completionNotes, { fromStatus: job.status, toStatus: "COMPLETED", adminOverride: Boolean(req.body.adminOverride) });
    await addAuditLog(tx, req, req.body.adminOverride ? "COMPLETE_ADMIN_OVERRIDE" : "COMPLETE", "Job", job.id, { fromStatus: job.status, toStatus: "COMPLETED", proofPhotoCount, signatureCaptured: Boolean(signature) });
    return updated;
  });
  sendData(res, normalize(jobWithEvidenceStatus(data)));
}));

const proofPhotoBodySchema = z.object({ caption: optionalText(500) });
const signatureBodySchema = z.object({ signerName: optionalText(160) });
const proofPhotoParam = z.object({ id: z.string().min(1), photoId: z.string().min(1) });

async function loadEvidenceJob(req, res, next) {
  try {
    req.evidenceJob = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
    next();
  } catch (error) {
    next(error);
  }
}

function evidenceWorkerId(req, job) {
  if (req.user.role === "WORKER") return req.user.worker ? req.user.worker.id : null;
  return job.workerId || null;
}

function uploadedFileUrl(kind, file) {
  return "/uploads/jobs/" + kind + "/" + file.filename;
}

router.get("/jobs/:id/proof-photos", validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  const result = await paged(prisma.jobProofPhoto, req, { where: { companyId: req.companyId, jobId: job.id }, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post("/jobs/:id/proof-photos", validate(idParam, "params"), loadEvidenceJob, singleUpload(proofUpload, "photo"), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, "Proof photo is required");
  const parsed = proofPhotoBodySchema.safeParse(req.body);
  if (!parsed.success) throw parsed.error;
  const job = req.evidenceJob;
  const data = await prisma.$transaction(async (tx) => {
    const photo = await tx.jobProofPhoto.create({ data: { companyId: req.companyId, jobId: job.id, workerId: evidenceWorkerId(req, job), uploadedById: req.user.id, url: uploadedFileUrl("proof", req.file), filename: req.file.filename, mimeType: req.file.mimetype, sizeBytes: req.file.size, caption: parsed.data.caption } });
    await addJobActivity(tx, req, job, "PROOF_PHOTO_ADDED", parsed.data.caption, { proofPhotoId: photo.id });
    await addAuditLog(tx, req, "CREATE", "JobProofPhoto", photo.id, { jobId: job.id });
    return photo;
  });
  sendData(res, normalize(data), 201);
}));

router.delete("/jobs/:id/proof-photos/:photoId", validate(proofPhotoParam, "params"), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  const photo = await prisma.jobProofPhoto.findFirst({ where: { id: req.params.photoId, companyId: req.companyId, jobId: job.id } });
  if (!photo) throw notFound("Proof photo not found");
  if (req.user.role === "WORKER" && photo.uploadedById !== req.user.id) throw new AppError(403, "Workers can only remove proof photos they uploaded");
  const data = await prisma.$transaction(async (tx) => {
    const removed = await tx.jobProofPhoto.delete({ where: { id: photo.id } });
    await addJobActivity(tx, req, job, "PROOF_PHOTO_REMOVED", photo.caption, { proofPhotoId: photo.id });
    await addAuditLog(tx, req, "DELETE", "JobProofPhoto", photo.id, { jobId: job.id });
    return removed;
  });
  sendData(res, normalize(data));
}));

router.get("/jobs/:id/signature", validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  const data = await prisma.jobSignature.findFirst({ where: { companyId: req.companyId, jobId: job.id } });
  sendData(res, normalize(data));
}));

router.post("/jobs/:id/signature", validate(idParam, "params"), loadEvidenceJob, singleUpload(signatureUpload, "signature"), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, "Signature image is required");
  const parsed = signatureBodySchema.safeParse(req.body);
  if (!parsed.success) throw parsed.error;
  const job = req.evidenceJob;
  const data = await prisma.$transaction(async (tx) => {
    const signature = await tx.jobSignature.upsert({ where: { jobId: job.id }, update: { capturedById: req.user.id, signerName: parsed.data.signerName, signatureUrl: uploadedFileUrl("signatures", req.file), mimeType: req.file.mimetype, sizeBytes: req.file.size }, create: { companyId: req.companyId, jobId: job.id, capturedById: req.user.id, signerName: parsed.data.signerName, signatureUrl: uploadedFileUrl("signatures", req.file), mimeType: req.file.mimetype, sizeBytes: req.file.size } });
    await addJobActivity(tx, req, job, "SIGNATURE_ADDED", parsed.data.signerName, { signatureId: signature.id });
    await addAuditLog(tx, req, "UPSERT", "JobSignature", signature.id, { jobId: job.id });
    return signature;
  });
  sendData(res, normalize(data), 201);
}));

router.delete("/jobs/:id/signature", validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  const signature = await prisma.jobSignature.findFirst({ where: { companyId: req.companyId, jobId: job.id } });
  if (!signature) throw notFound("Signature not found");
  if (req.user.role === "WORKER" && signature.capturedById !== req.user.id) throw new AppError(403, "Workers can only remove signatures they captured");
  const data = await prisma.$transaction(async (tx) => {
    const removed = await tx.jobSignature.delete({ where: { id: signature.id } });
    await addJobActivity(tx, req, job, "SIGNATURE_REMOVED", signature.signerName, { signatureId: signature.id });
    await addAuditLog(tx, req, "DELETE", "JobSignature", signature.id, { jobId: job.id });
    return removed;
  });
  sendData(res, normalize(data));
}));

router.get('/jobs/:id/activity', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === 'WORKER' });
  const result = await paged(prisma.jobActivity, req, { where: { companyId: req.companyId, jobId: job.id }, include: jobActivityInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/jobs/:id/activity', validate(idParam, 'params'), validate(noteActivitySchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === 'WORKER' });
  const type = adminRoles.includes(req.user.role) ? 'ADMIN_NOTE' : 'STATUS_CHANGED';
  const data = await prisma.$transaction(async (tx) => {
    const activity = await addJobActivity(tx, req, job, type, req.body.note, req.body.metadata);
    await addAuditLog(tx, req, type, 'Job', job.id, { activityId: activity.id });
    return activity;
  });
  sendData(res, normalize(data), 201);
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

function scheduleWhere(req, extra = {}) {
  return { companyId: req.companyId, ...(req.user.role === 'WORKER' ? { workerId: req.user.worker ? req.user.worker.id : '__none__' } : {}), ...extra };
}

async function listSchedule(req, extra = {}) {
  const result = await paged(prisma.scheduleItem, req, { where: scheduleWhere(req, extra), include: scheduleInclude, orderBy: { startsAt: 'asc' } });
  return result;
}

function rangeFromQuery(req, fallbackDays) {
  const start = req.query.start ? new Date(String(req.query.start)) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = req.query.end ? new Date(String(req.query.end)) : addMinutes(start, fallbackDays * 24 * 60);
  return { startsAt: { gte: start, lt: end } };
}

router.get('/company/scheduling-settings', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, normalize(await getSchedulingSettings(req.companyId)));
}));

router.patch('/company/scheduling-settings', requireRole(...adminRoles), validate(schedulingSettingsSchema), asyncHandler(async (req, res) => {
  const data = await prisma.companySchedulingSettings.upsert({ where: { companyId: req.companyId }, update: req.body, create: { ...schedulingDefaults(), ...req.body, companyId: req.companyId } });
  await audit(req, 'UPDATE', 'CompanySchedulingSettings', data.id);
  sendData(res, normalize(data));
}));

router.post('/schedule/check-conflicts', requireRole(...adminRoles), validate(conflictCheckSchema), asyncHandler(async (req, res) => {
  const result = await checkScheduleConflicts(req, req.body);
  sendData(res, normalize({ hasConflict: result.hasConflict, conflicts: result.conflicts }));
}));

router.get('/schedule/calendar', asyncHandler(async (req, res) => {
  const result = await listSchedule(req, rangeFromQuery(req, 31));
  sendData(res, normalize(result.data), 200, result.meta);
}));
router.get('/schedule/day', asyncHandler(async (req, res) => {
  const result = await listSchedule(req, rangeFromQuery(req, 1));
  sendData(res, normalize(result.data), 200, result.meta);
}));
router.get('/schedule/week', asyncHandler(async (req, res) => {
  const result = await listSchedule(req, rangeFromQuery(req, 7));
  sendData(res, normalize(result.data), 200, result.meta);
}));
router.get('/schedule/month', asyncHandler(async (req, res) => {
  const result = await listSchedule(req, rangeFromQuery(req, 31));
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.get('/schedule', asyncHandler(async (req, res) => {
  const result = await listSchedule(req);
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/schedule', requireRole(...adminRoles), validate(scheduleWriteSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.body.jobId, { assignedOnly: false });
  await requireWorker(req, req.body.workerId);
  const data = await scheduleJob(req, job, req.body);
  await audit(req, 'CREATE', 'ScheduleItem', data.schedule.id, { jobId: job.id });
  sendData(res, normalize(data.schedule), 201);
}));

router.get('/schedule/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await requireScheduleItem(req, req.params.id)));
}));

router.patch('/schedule/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(schedulePatchSchema), asyncHandler(async (req, res) => {
  const existing = await requireScheduleItem(req, req.params.id);
  const job = await requireJob(req, existing.jobId, { assignedOnly: false });
  if (req.body.status && ['CANCELLED', 'COMPLETED'].includes(req.body.status)) {
    const data = await prisma.scheduleItem.update({ where: { id: existing.id }, data: { status: req.body.status, notes: req.body.notes, updatedById: req.user.id }, include: scheduleInclude });
    await audit(req, 'UPDATE', 'ScheduleItem', data.id);
    return sendData(res, normalize(data));
  }
  const payload = { ...existing, ...req.body, workerId: req.body.workerId || existing.workerId, startsAt: req.body.startsAt || existing.startsAt, endsAt: req.body.endsAt || existing.endsAt };
  const data = await scheduleJob(req, job, payload, { excludeScheduleId: existing.id });
  await audit(req, 'UPDATE', 'ScheduleItem', data.schedule.id, { jobId: job.id });
  sendData(res, normalize(data.schedule));
}));

router.delete('/schedule/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const existing = await requireScheduleItem(req, req.params.id);
  const data = await prisma.$transaction(async (tx) => {
    const schedule = await tx.scheduleItem.update({ where: { id: existing.id }, data: { status: 'CANCELLED', conflictStatus: 'CLEAR', updatedById: req.user.id }, include: scheduleInclude });
    await tx.job.update({ where: { id: existing.jobId }, data: { scheduledStart: null, scheduledEnd: null, status: 'NEW' } });
    return schedule;
  });
  await audit(req, 'DELETE', 'ScheduleItem', data.id, { jobId: existing.jobId });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/schedule', requireRole(...adminRoles), validate(idParam, 'params'), validate(scheduleWriteSchema.omit({ jobId: true })), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  const data = await scheduleJob(req, job, req.body);
  await audit(req, 'SCHEDULE', 'Job', job.id, { scheduleItemId: data.schedule.id });
  sendData(res, normalize(data.schedule), 201);
}));

router.post('/jobs/:id/reschedule', requireRole(...adminRoles), validate(idParam, 'params'), validate(scheduleWriteSchema.omit({ jobId: true })), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  const existing = await prisma.scheduleItem.findFirst({ where: { companyId: req.companyId, jobId: job.id, status: { in: activeScheduleStatuses } } });
  const data = await scheduleJob(req, job, req.body, { forceNew: true, rescheduleExistingId: existing && existing.id, excludeScheduleId: existing && existing.id });
  await audit(req, 'RESCHEDULE', 'Job', job.id, { fromScheduleItemId: existing && existing.id, scheduleItemId: data.schedule.id });
  sendData(res, normalize(data.schedule), 201);
}));

router.post('/jobs/:id/unschedule', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  const active = await prisma.scheduleItem.findMany({ where: { companyId: req.companyId, jobId: job.id, status: { in: activeScheduleStatuses } } });
  const data = await prisma.$transaction(async (tx) => {
    for (const item of active) await tx.scheduleItem.update({ where: { id: item.id }, data: { status: 'CANCELLED', conflictStatus: 'CLEAR', updatedById: req.user.id } });
    return tx.job.update({ where: { id: job.id }, data: { scheduledStart: null, scheduledEnd: null, workerId: null, status: job.status === 'SCHEDULED' ? 'NEW' : job.status }, include: { customer: true, service: true, worker: { include: SAFE_WORKER_INCLUDE } } });
  });
  await audit(req, 'UNSCHEDULE', 'Job', job.id);
  sendData(res, normalize(data));
}));

router.get('/workers/:id/availability', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const worker = await requireWorker(req, req.params.id);
  const data = await prisma.workerAvailability.findMany({ where: { companyId: req.companyId, workerId: worker.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
  sendData(res, normalize(data));
}));

router.put('/workers/:id/availability', requireRole(...adminRoles), validate(idParam, 'params'), validate(availabilitySchema), asyncHandler(async (req, res) => {
  const worker = await requireWorker(req, req.params.id);
  const data = await prisma.$transaction(async (tx) => {
    await tx.workerAvailability.deleteMany({ where: { companyId: req.companyId, workerId: worker.id } });
    for (const item of req.body) await tx.workerAvailability.create({ data: { ...item, timezone: item.timezone || 'UTC', active: item.active !== false, companyId: req.companyId, workerId: worker.id } });
    return tx.workerAvailability.findMany({ where: { companyId: req.companyId, workerId: worker.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
  });
  await audit(req, 'UPDATE', 'WorkerAvailability', worker.id);
  sendData(res, normalize(data));
}));

router.get('/workers/:id/time-off', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const worker = await requireWorker(req, req.params.id);
  const data = await prisma.workerTimeOff.findMany({ where: { companyId: req.companyId, workerId: worker.id }, orderBy: { startsAt: 'asc' } });
  sendData(res, normalize(data));
}));

router.post('/workers/:id/time-off', requireRole(...adminRoles), validate(idParam, 'params'), validate(timeOffSchema), asyncHandler(async (req, res) => {
  const worker = await requireWorker(req, req.params.id);
  if (req.body.endsAt <= req.body.startsAt) throw new AppError(400, 'Time off end must be after start');
  const data = await prisma.workerTimeOff.create({ data: { ...req.body, status: req.body.status || 'APPROVED', companyId: req.companyId, workerId: worker.id } });
  await audit(req, 'CREATE', 'WorkerTimeOff', data.id, { workerId: worker.id });
  sendData(res, normalize(data), 201);
}));

router.patch('/workers/:id/time-off/:timeOffId', requireRole(...adminRoles), validate(z.object({ id: z.string().min(1), timeOffId: z.string().min(1) }), 'params'), validate(timeOffSchema.partial()), asyncHandler(async (req, res) => {
  const worker = await requireWorker(req, req.params.id);
  const existing = await prisma.workerTimeOff.findFirst({ where: { id: req.params.timeOffId, companyId: req.companyId, workerId: worker.id } });
  if (!existing) throw notFound('Time off not found');
  const data = await prisma.workerTimeOff.update({ where: { id: existing.id }, data: req.body });
  await audit(req, 'UPDATE', 'WorkerTimeOff', data.id, { workerId: worker.id });
  sendData(res, normalize(data));
}));

router.get('/recurring-jobs', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.recurringJobRule, req, { where: { companyId: req.companyId }, orderBy: { nextRunAt: 'asc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/recurring-jobs', requireRole(...adminRoles), validate(recurringJobSchema), asyncHandler(async (req, res) => {
  await requireCustomer(req, req.body.customerId);
  if (req.body.serviceId) await requireService(req, req.body.serviceId);
  if (req.body.workerId) await requireWorker(req, req.body.workerId);
  const nextRunAt = req.body.nextRunAt || dateWithPreferredTime(req.body.startDate, req.body.preferredTime);
  const data = await prisma.recurringJobRule.create({ data: { ...req.body, interval: req.body.interval || 1, active: req.body.active !== false, nextRunAt, companyId: req.companyId } });
  await audit(req, 'CREATE', 'RecurringJobRule', data.id);
  sendData(res, normalize(data), 201);
}));

router.patch('/recurring-jobs/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(recurringJobSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await prisma.recurringJobRule.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
  if (!existing) throw notFound('Recurring job rule not found');
  if (req.body.customerId) await requireCustomer(req, req.body.customerId);
  if (req.body.serviceId) await requireService(req, req.body.serviceId);
  if (req.body.workerId) await requireWorker(req, req.body.workerId);
  const data = await prisma.recurringJobRule.update({ where: { id: existing.id }, data: req.body });
  await audit(req, 'UPDATE', 'RecurringJobRule', data.id);
  sendData(res, normalize(data));
}));

router.delete('/recurring-jobs/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const existing = await prisma.recurringJobRule.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
  if (!existing) throw notFound('Recurring job rule not found');
  const data = await prisma.recurringJobRule.update({ where: { id: existing.id }, data: { active: false } });
  await audit(req, 'DELETE', 'RecurringJobRule', data.id);
  sendData(res, normalize(data));
}));

router.post('/recurring-jobs/:id/generate-next', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const rule = await prisma.recurringJobRule.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
  if (!rule) throw notFound('Recurring job rule not found');
  if (!rule.active) throw new AppError(409, 'Recurring job rule is inactive');
  const runAt = dateWithPreferredTime(rule.nextRunAt, rule.preferredTime);
  if (rule.endDate && runAt > new Date(rule.endDate)) throw new AppError(409, 'Recurring job rule has ended');
  const duplicate = await prisma.job.findFirst({ where: { companyId: req.companyId, recurrenceRuleId: rule.id, scheduledStart: runAt } });
  if (duplicate) return sendData(res, normalize(duplicate));
  const data = await prisma.$transaction(async (tx) => {
    const job = await tx.job.create({ data: { companyId: req.companyId, customerId: rule.customerId, serviceId: rule.serviceId, workerId: rule.workerId, title: rule.title, description: rule.description, durationMinutes: rule.durationMinutes, recurrenceRuleId: rule.id, status: 'NEW' } });
    await tx.recurringJobRule.update({ where: { id: rule.id }, data: { nextRunAt: nextRecurrenceDate(rule, runAt) } });
    return job;
  });
  let generatedJob = data;
  let schedule = null;
  let conflicts = [];
  if (rule.workerId) {
    const check = await checkScheduleConflicts(req, { jobId: data.id, workerId: rule.workerId, startsAt: runAt, durationMinutes: rule.durationMinutes }, { job: data });
    conflicts = check.conflicts;
    if (!check.hasConflict) {
      const scheduled = await scheduleJob(req, data, { workerId: rule.workerId, startsAt: runAt, durationMinutes: rule.durationMinutes });
      schedule = scheduled.schedule;
      generatedJob = scheduled.job;
    } else await writeScheduleConflicts(prisma, req, data.id, rule.workerId, conflicts, false);
  }
  await audit(req, 'GENERATE_NEXT', 'RecurringJobRule', rule.id, { jobId: data.id, conflicts });
  sendData(res, normalize({ job: generatedJob, schedule, conflicts }), 201);
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

const photoSchema = z.object({ url: z.string().url().or(z.string().regex(/^\/uploads\/jobs\/proof\/[a-zA-Z0-9._-]+$/)), caption: optionalText(500) });
router.post("/jobs/:id/photos", validate(idParam, "params"), validate(photoSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  const data = await prisma.$transaction(async (tx) => {
    const photo = await tx.jobProofPhoto.create({ data: { companyId: req.companyId, jobId: job.id, workerId: evidenceWorkerId(req, job), uploadedById: req.user.id, url: req.body.url, filename: path.basename(req.body.url), mimeType: "image/jpeg", sizeBytes: 0, caption: req.body.caption } });
    await addJobActivity(tx, req, job, "PROOF_PHOTO_ADDED", req.body.caption, { proofPhotoId: photo.id, legacyRoute: true });
    await addAuditLog(tx, req, "CREATE", "JobProofPhoto", photo.id, { jobId: job.id, legacyRoute: true });
    return photo;
  });
  sendData(res, normalize(data), 201);
}));
router.get("/jobs/:id/photos", validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  const result = await paged(prisma.jobProofPhoto, req, { where: { companyId: req.companyId, jobId: job.id }, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

module.exports = { apiRouter: router };


