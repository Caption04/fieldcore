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
const { configStatus } = require('../config/env');
const { notify } = require('../services/notification.service');
const { billingSummary, cancelSubscription, changePlan, createCheckout } = require('../services/saasBilling.service');
const { reportCsv, reportData } = require('../services/reporting.service');
const { analyticsCsv, buildExecutiveAnalytics } = require('../services/executiveAnalytics.service');
const { canUseFeature, getUsage, listPlans, requireFeature, requirePlanLimit } = require('../services/subscription.service');
const { getStorageObjectForCompany, readStorageObject, storeUploadedFile } = require('../services/integrations/storage.service');
const {
  disableIntegrationConnection,
  getIntegrationConnection,
  listIntegrationConnections,
  saveIntegrationConnection,
  testIntegrationConnection,
  updateIntegrationConnection
} = require('../services/integrations/integrationConnections.service');
const { getFinanceMapping, saveFinanceMapping } = require('../services/finance/financeMapping.service');
const { clearFinanceTokens, saveFinanceTokens } = require('../services/finance/financeToken.service');
const { safeFinanceSyncLog, syncFinanceRecord, testFinanceIntegration } = require('../services/finance/financeSync.service');
const { createFinanceProvider } = require('../services/finance/providers');
const { createPaymentProvider, safePaymentProviderConnection, verifySharedSecretWebhook } = require('../services/payments/paymentProviderRegistry');
const { savePaymentProviderSecrets } = require('../services/payments/paymentToken.service');
const { createOrFlagReconciliationItem, matchReconciliationItem, safeReconciliationItem } = require('../services/payments/reconciliation.service');
const {
  COOKIE_NAME,
  SAFE_LOGIN_USER_SELECT,
  SAFE_USER_SELECT,
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
const positiveQuantity = z.coerce.number().positive();
const optionalQuantity = z.coerce.number().nonnegative().optional();
const adminRoles = ['OWNER', 'ADMIN'];
const ownerRoles = ['OWNER'];
const jobStatusValues = ['NEW', 'SCHEDULED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const activityTypeValues = ['ASSIGNED','ARRIVED','STARTED','PAUSED','RESUMED','COMPLETED','ADMIN_NOTE','STATUS_CHANGED','PROOF_PHOTO_ADDED','PROOF_PHOTO_REMOVED','SIGNATURE_ADDED','SIGNATURE_REMOVED','COMPLETION_LOCATION_CAPTURED'];
const proofCategoryValues = ['BEFORE', 'AFTER', 'GENERAL', 'DAMAGE', 'ISSUE', 'EXTRA_WORK', 'CUSTOMER_APPROVAL'];
const bookingRequestStatusValues = ['NEW', 'REVIEWED', 'CONVERTED', 'DECLINED', 'CANCELLED'];
const integrationProviderValues = ['BREVO', 'META_WHATSAPP_CLOUD', 'CLICKATELL', 'AFRICAS_TALKING', 'CLOUDFLARE_R2'];
const integrationChannelValues = ['EMAIL', 'WHATSAPP', 'SMS', 'STORAGE'];
const assetStatusValues = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'RETIRED'];
const serviceContractStatusValues = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'];
const billingIntervalValues = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'ON_DEMAND'];
const slaStatusValues = ['NOT_APPLICABLE', 'ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'WAIVED'];
const contractBillingStatusValues = ['UNKNOWN', 'INCLUDED', 'BILLABLE', 'OVERAGE', 'WARRANTY'];
const assetIncidentSeverityValues = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const assetIncidentStatusValues = ['OPEN', 'RESOLVED', 'IGNORED'];
const complianceDocumentTypeValues = ['PHOTO', 'DOCUMENT', 'CERTIFICATE', 'REPORT', 'OTHER'];
const preventiveMaintenanceStatusValues = ['PLANNED', 'GENERATED', 'SKIPPED', 'FAILED', 'REVIEW_REQUIRED'];
const recurrenceValues = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
const stockLocationTypeValues = ['WAREHOUSE', 'BRANCH', 'VEHICLE', 'TECHNICIAN', 'OTHER'];
const stockMovementTypeValues = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RESERVED', 'RESERVATION_RELEASED', 'JOB_USED', 'JOB_RETURNED', 'PURCHASE_RECEIVED', 'TRANSFER_IN', 'TRANSFER_OUT'];
const jobPartStatusValues = ['PLANNED', 'RESERVED', 'USED', 'SHORT', 'RETURNED', 'CANCELLED'];
const purchaseRequestStatusValues = ['DRAFT', 'REQUESTED', 'APPROVED', 'REJECTED', 'ORDERED', 'CLOSED'];
const purchaseOrderStatusValues = ['DRAFT', 'APPROVAL_REQUIRED', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];
const financeProviderValues = ['MANUAL_CSV', 'XERO', 'QUICKBOOKS', 'SAGE', 'ZOHO_BOOKS', 'CUSTOM'];
const financeIntegrationStatusValues = ['DISCONNECTED', 'CONFIGURED', 'ACTIVE', 'ERROR', 'DISABLED'];
const financeExportTypeValues = ['INVOICES', 'PAYMENTS', 'RECEIPTS', 'CUSTOMERS'];
const financeExportStatusValues = ['COMPLETED', 'FAILED'];
const paymentMethodValues = ['CASH', 'BANK_TRANSFER', 'PAYNOW', 'PAYFAST', 'YOCO', 'OZOW', 'SNAPSCAN', 'CARD', 'MANUAL_CARD', 'EXTERNAL_PAYMENT_LINK', 'MANUAL_ADJUSTMENT', 'CUSTOM_MANUAL', 'OTHER'];
const paymentProviderValues = ['PAYFAST', 'YOCO', 'OZOW', 'PAYNOW', 'SNAPSCAN', 'ZAPPER', 'STRIPE', 'MANUAL_BANK', 'ECOCASH_MANUAL', 'MOCK'];
const paymentProviderConnectionStatusValues = ['DISCONNECTED', 'CONFIGURED', 'ACTIVE', 'ERROR', 'DISABLED'];
const paymentLinkStatusValues = ['CREATED', 'SENT', 'OPENED', 'PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED'];
const reconciliationStatusValues = ['UNMATCHED', 'MATCHED', 'DUPLICATE', 'SUSPICIOUS', 'IGNORED'];
const externalLocalTypeValues = ['INVOICE', 'PAYMENT', 'RECEIPT', 'CUSTOMER', 'QUOTE', 'JOB'];
const offlineActionStatusValues = ['RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE', 'REJECTED', 'CONFLICT', 'RESOLVED'];
const offlineActionTypeValues = ['JOB_ARRIVE', 'JOB_START', 'JOB_PAUSE', 'JOB_RESUME', 'JOB_COMPLETE', 'JOB_NOTE', 'PROOF_PHOTO_UPLOADED', 'SIGNATURE_CAPTURED', 'LOCATION_CAPTURED', 'GPS_CHECKPOINT', 'PART_USED', 'PART_SHORTAGE', 'CHECKLIST_COMPLETED', 'ISSUE_NOTE', 'CUSTOMER_UNAVAILABLE'];
const approvalEventTypeValues = ['QUOTE_DISCOUNT', 'QUOTE_SEND', 'INVOICE_DISCOUNT', 'INVOICE_VOID', 'PAYMENT_REFUND', 'PURCHASE_REQUEST_APPROVE', 'PURCHASE_ORDER_SEND', 'PURCHASE_ORDER_APPROVE', 'STOCK_ADJUSTMENT', 'JOB_RESCHEDULE', 'JOB_REASSIGN_AFTER_DISPATCH', 'SLA_WAIVE', 'CONTRACT_CANCEL'];
const approvalStatusValues = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const permissionKeys = [
  'invoice.void',
  'invoice.discount.approve',
  'payment.refund',
  'quote.discount.approve',
  'purchaseRequest.approve',
  'purchaseOrder.send',
  'purchaseOrder.approve',
  'stock.adjust',
  'contract.sla.override',
  'job.reassign.after_dispatch',
  'branch.manage',
  'report.enterprise.view',
  'settings.finance.manage',
  'integration.manage',
  'approval.policy.manage',
  'approval.request.decide',
  'audit.view',
  'mobile.sync.manage',
  'contract.automation.manage'
];
const defaultPermissionBundles = {
  OWNER: permissionKeys,
  ADMIN: permissionKeys.filter((key) => !['integration.manage'].includes(key)),
  WORKER: [],
  CLIENT: []
};
const approvalActionMap = {
  INVOICE_VOID: 'invoice.void',
  PAYMENT_REFUND: 'payment.refund',
  PURCHASE_REQUEST_APPROVE: 'purchaseRequest.approve',
  PURCHASE_ORDER_SEND: 'purchaseOrder.send',
  PURCHASE_ORDER_APPROVE: 'purchaseOrder.approve',
  STOCK_ADJUSTMENT: 'stock.adjust',
  JOB_REASSIGN_AFTER_DISPATCH: 'job.reassign.after_dispatch',
  SLA_WAIVE: 'contract.sla.override',
  CONTRACT_CANCEL: 'contract.sla.override',
  QUOTE_DISCOUNT: 'quote.discount.approve',
  INVOICE_DISCOUNT: 'invoice.discount.approve'
};


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

function branchFilterFromQuery(req) {
  const branchId = req.query && req.query.branchId ? String(req.query.branchId).trim() : '';
  return branchId ? { branchId } : {};
}

async function requireBranch(req, id) {
  if (!id) return null;
  const record = await prisma.branch.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Branch not found');
  return record;
}

async function requireApprovalPolicy(req, id) {
  if (!id) return null;
  const record = await prisma.approvalPolicy.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Approval policy not found');
  return record;
}

async function requireApprovalRequest(req, id) {
  const record = await prisma.approvalRequest.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Approval request not found');
  return record;
}

async function requireCompanyUser(req, id) {
  const record = prisma.user.findFirst
    ? await prisma.user.findFirst({ where: { id, companyId: req.companyId }, select: SAFE_USER_SELECT })
    : await prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
  if (!record || record.companyId !== req.companyId) throw notFound('User not found');
  return record;
}

function safeAuditMetadata(metadata = {}) {
  const secretPattern = /(secret|token|password|apiKey|key|authorization|cookie)/i;
  const clean = (value) => {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(clean);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, secretPattern.test(key) ? '[redacted]' : clean(val)]));
    }
    return value;
  };
  return clean(metadata);
}

function requestAuditContext(req, extra = {}) {
  return safeAuditMetadata({
    ...extra,
    ip: req.ip,
    userAgent: req.get && req.get('user-agent')
  });
}

async function addEnterpriseAudit(req, action, entity, entityId, metadata) {
  return prisma.auditLog.create({
    data: {
      companyId: req.companyId,
      userId: req.user && req.user.id,
      action,
      entity,
      entityId,
      metadata: requestAuditContext(req, metadata)
    }
  });
}

function roleBundle(role) {
  return new Set(defaultPermissionBundles[role] || []);
}

async function getEffectivePermissionSet(req, userId = req.user.id, branchId) {
  const user = userId === req.user.id ? req.user : await requireCompanyUser(req, userId);
  const permissions = roleBundle(user.role);
  const overrides = await prisma.userPermissionOverride.findMany({ where: { companyId: req.companyId, userId } });
  for (const override of overrides.filter((item) => !item.branchId || item.branchId === branchId)) {
    if (override.allowed) permissions.add(override.permissionKey);
    else permissions.delete(override.permissionKey);
  }
  const branchAccess = branchId ? await prisma.userBranchAccess.findFirst({ where: { companyId: req.companyId, userId, branchId, active: true } }) : null;
  if (branchAccess && Array.isArray(branchAccess.permissions)) for (const key of branchAccess.permissions) permissions.add(key);
  return permissions;
}

async function hasPermission(req, permissionKey, options = {}) {
  if (!permissionKeys.includes(permissionKey)) return false;
  const permissions = await getEffectivePermissionSet(req, req.user.id, options.branchId);
  return permissions.has(permissionKey);
}

async function requirePermission(req, permissionKey, options = {}) {
  if (!(await hasPermission(req, permissionKey, options))) throw new AppError(403, 'Missing permission: ' + permissionKey);
}

function roleRank(role) {
  return { CLIENT: 0, WORKER: 1, ADMIN: 2, OWNER: 3 }[role] || 0;
}

async function canDecideApproval(req, approval) {
  if (approval.branchId) {
    const access = await prisma.userBranchAccess.findFirst({ where: { companyId: req.companyId, userId: req.user.id, branchId: approval.branchId, active: true } });
    if (!access && req.user.role !== 'OWNER') return false;
  }
  const policy = approval.policyId ? await prisma.approvalPolicy.findFirst({ where: { id: approval.policyId, companyId: req.companyId } }) : null;
  if (policy && !policy.allowSelfApproval && approval.requestedById === req.user.id) return false;
  if (policy && roleRank(req.user.role) < roleRank(policy.requiredApproverRole || 'OWNER')) return false;
  return hasPermission(req, 'approval.request.decide', { branchId: approval.branchId });
}

async function findApprovalPolicy(req, eventType, options = {}) {
  const policies = await prisma.approvalPolicy.findMany({ where: { companyId: req.companyId, eventType, active: true }, orderBy: { createdAt: 'desc' } });
  const amountValue = Number(options.amount || 0);
  return policies
    .filter((policy) => !policy.branchId || policy.branchId === options.branchId)
    .sort((a, b) => (b.branchId ? 1 : 0) - (a.branchId ? 1 : 0) || Number(b.thresholdAmount || 0) - Number(a.thresholdAmount || 0))
    .find((policy) => policy.thresholdAmount == null || amountValue >= Number(policy.thresholdAmount));
}

function approvalRequiredPayload(request) {
  return {
    approvalRequired: true,
    approvalRequestId: request.id,
    status: request.status,
    eventType: request.eventType,
    entityType: request.entityType,
    entityId: request.entityId,
    amount: request.amount,
    thresholdAmount: request.thresholdAmount,
    expiresAt: request.expiresAt
  };
}

async function requireApprovalOrProceed(req, config) {
  const permissionKey = config.permissionKey || approvalActionMap[config.eventType];
  if (permissionKey) await requirePermission(req, permissionKey, { branchId: config.branchId });
  const policy = await findApprovalPolicy(req, config.eventType, { branchId: config.branchId, amount: config.amount });
  if (!policy) return null;
  if (policy.reasonRequired && !config.reason) throw new AppError(400, 'Approval reason is required.');
  if (policy.allowSelfApproval && roleRank(req.user.role) >= roleRank(policy.requiredApproverRole || 'OWNER')) return null;
  const expiresAt = policy.expiresAfterHours ? new Date(Date.now() + policy.expiresAfterHours * 60 * 60 * 1000) : null;
  const request = await prisma.approvalRequest.create({
    data: {
      companyId: req.companyId,
      branchId: config.branchId || policy.branchId || null,
      policyId: policy.id,
      requestedById: req.user.id,
      entityType: config.entityType,
      entityId: config.entityId,
      eventType: config.eventType,
      actionKey: config.actionKey,
      actionPayload: safeAuditMetadata(config.actionPayload || {}),
      amount: config.amount == null ? null : config.amount,
      thresholdAmount: policy.thresholdAmount,
      reason: config.reason,
      expiresAt,
      status: 'PENDING'
    },
    include: { policy: true, requestedBy: { select: SAFE_USER_SELECT } }
  });
  await addEnterpriseAudit(req, 'APPROVAL_REQUIRED', config.entityType, config.entityId, { approvalRequestId: request.id, eventType: config.eventType, actionKey: config.actionKey, amount: config.amount, thresholdAmount: policy.thresholdAmount, branchId: config.branchId });
  return request;
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

async function requireCustomerProperty(req, id, customerId) {
  if (!id) return null;
  const record = await prisma.customerProperty.findFirst({ where: { id, companyId: req.companyId, ...(customerId ? { customerId } : {}) } });
  if (!record) throw notFound('Customer property not found');
  return record;
}

async function requireAsset(req, id) {
  const record = await prisma.asset.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Asset not found');
  return record;
}

async function requireServiceContract(req, id) {
  const record = await prisma.serviceContract.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Service contract not found');
  return record;
}

async function requireSupplier(req, id) {
  if (!id) return null;
  const record = await prisma.supplier.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Supplier not found');
  return record;
}

async function requireStockLocation(req, id) {
  if (!id) return null;
  const record = await prisma.stockLocation.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Stock location not found');
  return record;
}

async function requireInventoryItem(req, id) {
  const record = await prisma.inventoryItem.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Inventory item not found');
  return record;
}

async function requireJobPart(req, jobId, partId) {
  const record = await prisma.jobPartUsage.findFirst({ where: { id: partId, jobId, companyId: req.companyId } });
  if (!record) throw notFound('Job part not found');
  return record;
}

async function requirePurchaseRequest(req, id) {
  const record = await prisma.purchaseRequest.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Purchase request not found');
  return record;
}

async function requirePurchaseOrder(req, id) {
  const record = await prisma.purchaseOrder.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Purchase order not found');
  return record;
}

async function requireAssignedWorkerJob(req, id) {
  if (!req.user.worker) throw notFound('Job not found');
  const record = await prisma.job.findFirst({ where: { id, companyId: req.companyId, workerId: req.user.worker.id } });
  if (!record) throw notFound('Job not found');
  return record;
}

function decimalNumber(value) {
  return Number(value || 0);
}

async function getOrCreateStock(tx, req, itemId, locationId) {
  let stock = await tx.inventoryStock.findFirst({ where: { companyId: req.companyId, itemId, locationId } });
  if (!stock) {
    stock = await tx.inventoryStock.create({ data: { companyId: req.companyId, itemId, locationId, quantityOnHand: 0, quantityReserved: 0 } });
  }
  return stock;
}

async function applyStockChange(tx, req, change) {
  const stock = await getOrCreateStock(tx, req, change.itemId, change.locationId);
  const onHand = decimalNumber(stock.quantityOnHand) + decimalNumber(change.onHandDelta);
  const reserved = decimalNumber(stock.quantityReserved) + decimalNumber(change.reservedDelta);
  const company = await tx.company.findUnique({ where: { id: req.companyId } });
  const allowNegativeStock = company && company.allowNegativeStock === true;
  if (!allowNegativeStock && onHand < 0) throw new AppError(400, 'Insufficient stock on hand');
  if (reserved < 0) throw new AppError(400, 'Reserved stock cannot be negative');
  if (!allowNegativeStock && reserved > onHand) throw new AppError(400, 'Reserved stock cannot exceed stock on hand');

  const updated = await tx.inventoryStock.update({ where: { id: stock.id }, data: { quantityOnHand: onHand, quantityReserved: reserved } });
  await tx.stockMovement.create({
    data: {
      companyId: req.companyId,
      itemId: change.itemId,
      locationId: change.locationId,
      jobId: change.jobId,
      purchaseOrderId: change.purchaseOrderId,
      movementType: change.movementType,
      quantity: change.quantity,
      unitCost: change.unitCost,
      reason: change.reason,
      createdById: req.user && req.user.id
    }
  });
  return updated;
}

function requestLineTotal(line) {
  return decimalNumber(line.quantity) * decimalNumber(line.estimatedUnitCost || line.unitCost || 0);
}

function purchaseOrderLineTotal(line) {
  return decimalNumber(line.quantity) * decimalNumber(line.unitCost || 0);
}

async function companyThreshold(req, key, fallback) {
  const company = await prisma.company.findUnique({ where: { id: req.companyId } });
  return decimalNumber(company && company[key] !== undefined ? company[key] : fallback);
}

async function ensureWorkerCanUseStockLocation(req, location) {
  if (!req.user || !req.user.worker) return;
  if (location.workerId && location.workerId !== req.user.worker.id) {
    throw new AppError(403, 'Technicians can only consume stock from their assigned vehicle or location');
  }
}

async function calculateJobCosting(req, jobId) {
  const job = await requireJob(req, jobId, { assignedOnly: false });
  const quotes = await prisma.quote.findMany({ where: { companyId: req.companyId, jobId: job.id } });
  const invoices = await prisma.invoice.findMany({ where: { companyId: req.companyId, jobId: job.id } });
  const parts = await prisma.jobPartUsage.findMany({ where: { companyId: req.companyId, jobId: job.id }, include: { item: true } });
  const quotedRevenue = quotes.reduce((sum, quote) => sum + decimalNumber(quote.total || quote.amount), 0);
  const invoicedRevenue = invoices.reduce((sum, invoice) => sum + decimalNumber(invoice.total || invoice.amount), 0);
  const partsCost = parts.reduce((sum, part) => {
    const quantity = decimalNumber(part.quantityUsed || part.quantityPlanned || 0);
    const unitCost = decimalNumber(part.unitCost || (part.item && part.item.unitCost) || 0);
    return sum + quantity * unitCost;
  }, 0);
  const estimatedLabourCost = decimalNumber(job.estimatedLabourCost || 0);
  const estimatedTravelCost = decimalNumber(job.estimatedTravelCost || 0);
  const costTotal = partsCost + estimatedLabourCost + estimatedTravelCost;
  const revenue = invoicedRevenue || quotedRevenue || decimalNumber(job.total);
  const grossMarginEstimate = revenue - costTotal;
  const unbilledPartsWarning = partsCost > 0 && invoicedRevenue <= 0;
  const includedParts = parts.filter((part) => part.contractBillingStatus === 'INCLUDED').length;
  const billableParts = parts.filter((part) => ['BILLABLE', 'OVERAGE'].includes(part.contractBillingStatus)).length;
  return { jobId: job.id, quotedRevenue, invoicedRevenue, partsCost, estimatedLabourCost, estimatedTravelCost, costTotal, grossMarginEstimate, grossMarginPercent: revenue ? Math.round((grossMarginEstimate / revenue) * 10000) / 100 : null, unbilledPartsWarning, contractIncludedParts: includedParts, billableParts, partLines: parts };
}

function safeWorkerPart(part) {
  return {
    id: part.id,
    jobId: part.jobId,
    itemId: part.itemId,
    locationId: part.locationId,
    quantityPlanned: part.quantityPlanned,
    quantityUsed: part.quantityUsed,
    notes: part.notes,
    status: part.status,
    item: part.item ? {
      id: part.item.id,
      sku: part.item.sku,
      name: part.item.name,
      description: part.item.description,
      category: part.item.category,
      unitOfMeasure: part.item.unitOfMeasure
    } : undefined,
    location: part.location ? {
      id: part.location.id,
      name: part.location.name,
      type: part.location.type
    } : undefined
  };
}

async function requireContractServiceLine(req, contractId, lineId) {
  const record = await prisma.contractServiceLine.findFirst({ where: { id: lineId, contractId, companyId: req.companyId } });
  if (!record) throw notFound('Contract service line not found');
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

async function requireQuote(req, id, options = {}) {
  const includeDeleted = options.includeDeleted === true;
  const record = await prisma.quote.findFirst({ where: { id, companyId: req.companyId, ...(includeDeleted ? {} : { deletedAt: null }) } });
  if (!record) throw notFound('Quote not found');
  return record;
}

async function requireInvoice(req, id) {
  const record = await prisma.invoice.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Invoice not found');
  return record;
}

function financeSettingsDefaults(companyId) {
  return {
    id: null,
    companyId,
    country: 'ZW',
    timezone: 'Africa/Harare',
    defaultCurrency: 'USD',
    allowedCurrencies: ['USD', 'ZAR'],
    taxName: 'Tax',
    taxRate: 0,
    pricesIncludeTax: false,
    dateFormat: 'yyyy-MM-dd',
    numberFormat: 'en-ZW',
    invoicePrefix: 'INV',
    receiptPrefix: 'RCT',
    quoteExpiryDays: 14,
    paymentTermsDays: 14,
    fiscalYearStartMonth: 1,
    invoiceFooter: null,
    allowedPaymentMethods: ['CASH', 'BANK_TRANSFER', 'PAYNOW', 'PAYFAST', 'YOCO', 'OZOW', 'SNAPSCAN', 'CARD', 'MANUAL_CARD', 'EXTERNAL_PAYMENT_LINK', 'MANUAL_ADJUSTMENT', 'CUSTOM_MANUAL', 'OTHER'],
    paymentInstructions: null,
    enforceQuoteDepositBeforeScheduling: false,
    defaultQuoteDepositPercent: 0,
    reminderThrottleHours: 24,
    createdAt: null,
    updatedAt: null
  };
}

function financeLocalization(settings) {
  const merged = { ...financeSettingsDefaults(settings && settings.companyId || null), ...(settings || {}) };
  return {
    country: merged.country,
    timezone: merged.timezone,
    defaultCurrency: merged.defaultCurrency,
    allowedCurrencies: Array.isArray(merged.allowedCurrencies) ? merged.allowedCurrencies : ['USD'],
    taxName: merged.taxName,
    taxRate: Number(merged.taxRate || 0),
    pricesIncludeTax: Boolean(merged.pricesIncludeTax),
    dateFormat: merged.dateFormat,
    numberFormat: merged.numberFormat,
    invoicePrefix: merged.invoicePrefix || 'INV',
    receiptPrefix: merged.receiptPrefix || 'RCT',
    quoteExpiryDays: Number(merged.quoteExpiryDays || 14),
    paymentTermsDays: Number(merged.paymentTermsDays || 14),
    allowedPaymentMethods: Array.isArray(merged.allowedPaymentMethods) ? merged.allowedPaymentMethods : financeSettingsDefaults().allowedPaymentMethods,
    paymentInstructions: merged.paymentInstructions || null,
    enforceQuoteDepositBeforeScheduling: Boolean(merged.enforceQuoteDepositBeforeScheduling),
    defaultQuoteDepositPercent: Number(merged.defaultQuoteDepositPercent || 0),
    reminderThrottleHours: Number(merged.reminderThrottleHours || 24)
  };
}

function addDaysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

async function paymentMethodsForCompany(companyId, tx = prisma) {
  const settings = financeLocalization(await getCompanyFinanceSettings(companyId, tx));
  return settings.allowedPaymentMethods.filter((method) => paymentMethodValues.includes(method));
}

async function assertPaymentMethodAllowed(companyId, method, tx = prisma) {
  const allowed = await paymentMethodsForCompany(companyId, tx);
  if (!allowed.includes(method)) throw new AppError(400, 'Payment method is not enabled for this company');
}

function attachLocalization(record, settings) {
  if (!record) return record;
  return { ...record, localization: financeLocalization(settings) };
}

async function getCompanyFinanceSettings(companyId, tx = prisma) {
  const record = await tx.companyFinanceSettings.findUnique({ where: { companyId } });
  return record || financeSettingsDefaults(companyId);
}

async function requireFinanceIntegration(req, id) {
  const record = await prisma.financeIntegration.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Finance integration not found');
  return record;
}


async function requirePaymentProviderConnection(req, id) {
  const record = await prisma.paymentProviderConnection.findFirst({ where: { id, companyId: req.companyId } });
  if (!record) throw notFound('Payment provider connection not found');
  return record;
}

async function requireActivePaymentProvider(req, provider, id) {
  const where = { companyId: req.companyId, status: 'ACTIVE', ...(id ? { id } : { provider }) };
  const record = await prisma.paymentProviderConnection.findFirst({ where });
  if (!record) throw new AppError(409, 'Payment provider is not configured or active');
  return record;
}

function safePaymentLink(link) {
  if (!link) return link;
  return { id: link.id, companyId: link.companyId, branchId: link.branchId || null, invoiceId: link.invoiceId, quoteId: link.quoteId || null, providerConnectionId: link.providerConnectionId || null, provider: link.provider, status: link.status, amount: link.amount, currency: link.currency, reference: link.reference, checkoutUrl: link.checkoutUrl || null, externalId: link.externalId || null, expiresAt: link.expiresAt || null, sentAt: link.sentAt || null, paidAt: link.paidAt || null, createdAt: link.createdAt, updatedAt: link.updatedAt };
}

function safePaymentRefund(refund) {
  if (!refund) return refund;
  return { id: refund.id, companyId: refund.companyId, branchId: refund.branchId || null, paymentId: refund.paymentId, invoiceId: refund.invoiceId, providerConnectionId: refund.providerConnectionId || null, approvalRequestId: refund.approvalRequestId || null, amount: refund.amount, status: refund.status, providerRefundId: refund.providerRefundId || null, reason: refund.reason || null, processedAt: refund.processedAt || null, createdAt: refund.createdAt, updatedAt: refund.updatedAt };
}

function paymentReference(invoiceId) {
  return 'FC-' + invoiceId + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function ensureQuoteDepositBeforeScheduling(req, job) {
  const settings = financeLocalization(await getCompanyFinanceSettings(req.companyId));
  if (!settings.enforceQuoteDepositBeforeScheduling) return;
  const quotes = await prisma.quote.findMany({ where: { companyId: req.companyId, jobId: job.id, status: 'ACCEPTED' } });
  const blocked = quotes.find((quote) => Number(quote.depositRequiredAmount || 0) > 0 && !quote.depositPaidAt);
  if (blocked) throw new AppError(409, 'Quote deposit must be paid before scheduling this job');
}

async function createReceiptAndRecalcForConfirmedPayment(tx, payment, invoice) {
  await createReceiptForPayment(tx, payment, invoice);
  return recalcInvoice(tx, payment.companyId, invoice.id);
}

async function requireFinanceIntegrationByProvider(companyId, provider) {
  const record = await prisma.financeIntegration.findFirst({ where: { companyId, provider } });
  if (!record) throw notFound('Finance integration not found');
  return record;
}

function safeFinanceConfig(config = {}) {
  const secretPattern = /(secret|token|password|apiKey|key|authorization|cookie)/i;
  return Object.fromEntries(Object.entries(config || {}).map(([key, value]) => [key, secretPattern.test(key) ? '[redacted]' : value]));
}

function safeFinanceIntegration(record) {
  if (!record) return record;
  return {
    id: record.id,
    companyId: record.companyId,
    provider: record.provider,
    status: record.status,
    externalTenantId: record.externalTenantId || null,
    lastSyncAt: record.lastSyncAt || null,
    connectedAt: record.connectedAt || null,
    disconnectedAt: record.disconnectedAt || null,
    lastTestAt: record.lastTestAt || null,
    lastError: record.lastError || null,
    config: safeFinanceConfig(record.config || {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function safeFinanceWebhookEvent(record) {
  if (!record) return record;
  return {
    id: record.id,
    companyId: record.companyId,
    integrationId: record.integrationId || null,
    provider: record.provider,
    eventId: record.eventId || null,
    eventType: record.eventType || null,
    status: record.status,
    signatureValid: Boolean(record.signatureValid),
    errorMessage: record.errorMessage || null,
    receivedAt: record.receivedAt,
    processedAt: record.processedAt || null
  };
}

function validFinanceWebhookSignature(integration, req) {
  const configured = integration && integration.config && integration.config.webhookSecret;
  if (!configured) return false;
  const provided = req.get('x-fieldcore-signature') || req.get('x-xero-signature') || req.get('x-signature') || '';
  if (!provided) return false;
  const body = JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', String(configured)).update(body).digest('hex');
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function financeDateWhere(query, field = 'createdAt') {
  const where = {};
  if (query.startDate || query.endDate) {
    where[field] = {};
    if (query.startDate) where[field].gte = query.startDate;
    if (query.endDate) where[field].lte = query.endDate;
  }
  return where;
}

function csvCell(value) {
  if (value == null) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function csvDocument(headers, rows) {
  return headers.map(csvCell).join(',') + '\n' + rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')).join('\n') + '\n';
}

async function recordFinanceExport(req, exportType, fileName, recordCount, status = 'COMPLETED', error) {
  const log = await prisma.financeExportLog.create({
    data: {
      companyId: req.companyId,
      exportType,
      provider: 'MANUAL_CSV',
      status,
      fileName,
      recordCount,
      createdById: req.user && req.user.id,
      error
    }
  });
  await audit(req, status === 'COMPLETED' ? 'EXPORT' : 'EXPORT_FAILED', 'FinanceExportLog', log.id, { exportType, fileName, recordCount });
  return log;
}

async function sendFinanceCsv(req, res, exportType, fileName, headers, rows) {
  await recordFinanceExport(req, exportType, fileName, rows.length);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
  return res.send(csvDocument(headers, rows));
}

async function requireFinanceLocalRecord(req, localType, localId) {
  const map = {
    INVOICE: ['invoice', 'Invoice'],
    PAYMENT: ['payment', 'Payment'],
    RECEIPT: ['receipt', 'Receipt'],
    CUSTOMER: ['customer', 'Customer'],
    QUOTE: ['quote', 'Quote'],
    JOB: ['job', 'Job']
  };
  const entry = map[localType];
  if (!entry) throw new AppError(400, 'Unsupported local record type');
  const record = await prisma[entry[0]].findFirst({ where: { id: localId, companyId: req.companyId } });
  if (!record) throw notFound(entry[1] + ' not found');
  return record;
}

async function validateJobRelations(req, body) {
  if (body.customerId) await requireCustomer(req, body.customerId);
  if (body.serviceId) await requireService(req, body.serviceId);
  if (body.workerId) await requireWorker(req, body.workerId);
  if (body.contractId) {
    const contract = await requireServiceContract(req, body.contractId);
    if (body.customerId && contract.customerId !== body.customerId) throw new AppError(400, 'Contract must belong to the selected customer');
    if (body.contractLineId) await requireContractServiceLine(req, contract.id, body.contractLineId);
  } else if (body.contractLineId) {
    throw new AppError(400, 'Contract is required when selecting a contract service line');
  }
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

const jobInclude = { customer: true, service: true, contract: true, worker: { include: SAFE_WORKER_INCLUDE }, jobAssets: { include: { asset: true } } };
const jobDetailInclude = { ...jobInclude, completedBy: { select: { id: true, companyId: true, name: true, email: true, role: true } }, proofPhotos: { orderBy: { createdAt: 'desc' } }, signature: true, completionLocation: true };
const jobActivityInclude = { worker: { include: SAFE_WORKER_INCLUDE }, user: { select: { id: true, companyId: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } } };
const assetInclude = { customer: true, property: true, service: true, jobAssets: { include: { job: { include: { service: true, invoices: true, proofPhotos: true } } }, orderBy: { createdAt: 'desc' } }, serviceContractAssets: { include: { contract: true } } };
const contractInclude = { customer: true, property: true, assets: { include: { asset: true } }, serviceLines: { include: { service: true }, orderBy: { nextDueAt: 'asc' } }, jobs: { include: { service: true, jobAssets: { include: { asset: true } } }, orderBy: { createdAt: 'desc' } } };

const integrationConfigSchema = z.record(z.union([z.string().trim().max(500), z.boolean(), z.number()])).default({});
const integrationSecretsSchema = z.record(z.string().max(4000).optional().or(z.literal(''))).default({});
const integrationCreateSchema = z.object({
  provider: z.enum(integrationProviderValues),
  displayName: optionalText(120),
  config: integrationConfigSchema,
  secrets: integrationSecretsSchema
});
const integrationPatchSchema = z.object({
  displayName: optionalText(120),
  config: integrationConfigSchema.optional(),
  secrets: integrationSecretsSchema.optional()
});
const messageLogQuerySchema = z.object({
  channel: z.enum(integrationChannelValues).optional(),
  provider: z.enum(integrationProviderValues).optional(),
  status: z.string().trim().max(40).optional(),
  page: z.string().optional(),
  limit: z.string().optional()
});

const currencyCode = z.string().trim().transform((value) => value.toUpperCase()).refine((value) => /^[A-Z]{3}$/.test(value), 'Currency must be a 3-letter ISO code');
const countryCode = z.string().trim().transform((value) => value.toUpperCase()).refine((value) => /^[A-Z]{2}$/.test(value), 'Country must be a 2-letter ISO code');
const financeSettingsSchema = z.object({
  country: countryCode.optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  defaultCurrency: currencyCode.optional(),
  allowedCurrencies: z.array(currencyCode).max(20).optional(),
  taxName: optionalText(40),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  pricesIncludeTax: z.boolean().optional(),
  dateFormat: z.string().trim().min(2).max(40).optional(),
  numberFormat: z.string().trim().min(2).max(40).optional(),
  invoicePrefix: optionalText(20),
  receiptPrefix: optionalText(20),
  quoteExpiryDays: z.coerce.number().int().min(1).max(365).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
  invoiceFooter: optionalText(1000),
  allowedPaymentMethods: z.array(z.enum(paymentMethodValues)).max(20).optional(),
  paymentInstructions: optionalText(1000),
  enforceQuoteDepositBeforeScheduling: z.boolean().optional(),
  defaultQuoteDepositPercent: z.coerce.number().min(0).max(100).optional(),
  reminderThrottleHours: z.coerce.number().int().min(1).max(720).optional()
}).superRefine((value, ctx) => {
  if (value.defaultCurrency && value.allowedCurrencies && !value.allowedCurrencies.includes(value.defaultCurrency)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedCurrencies'], message: 'Allowed currencies must include the default currency' });
  }
});
const financeIntegrationConfigSchema = z.record(z.union([z.string().trim().max(500), z.boolean(), z.number()])).default({});
const financeIntegrationCreateSchema = z.object({
  provider: z.enum(financeProviderValues),
  status: z.enum(financeIntegrationStatusValues).optional(),
  externalTenantId: optionalText(160),
  config: financeIntegrationConfigSchema
});
const financeIntegrationPatchSchema = z.object({
  status: z.enum(financeIntegrationStatusValues).optional(),
  externalTenantId: optionalText(160),
  config: financeIntegrationConfigSchema.optional()
});
const financeExportQuerySchema = z.object({
  startDate: optionalDate,
  endDate: optionalDate
});
const financeMarkExportedSchema = z.object({
  provider: z.enum(financeProviderValues).default('MANUAL_CSV'),
  localType: z.enum(externalLocalTypeValues),
  ids: z.array(z.string().min(1)).min(1).max(500),
  externalIds: z.record(z.string().trim().min(1).max(250)).optional(),
  exportedAt: optionalDate
});

const financeTokenSchema = z.object({
  accessToken: z.string().trim().min(1).max(5000).optional(),
  refreshToken: z.string().trim().min(1).max(5000).optional(),
  expiresAt: optionalDate
}).refine((value) => !value.accessToken === !value.refreshToken, { message: 'Access token and refresh token must be provided together' });

const financeConnectSchema = z.object({
  externalTenantId: optionalText(160),
  mockMode: z.boolean().optional(),
  tokens: financeTokenSchema.optional()
});

const financeMappingSchema = z.object({
  integrationId: optionalText(120),
  revenueAccountCode: optionalText(80),
  taxRateId: optionalText(80),
  paymentsAccountCode: optionalText(80),
  discountsAccountCode: optionalText(80),
  stockAccountCode: optionalText(80),
  branchTrackingCategoryId: optionalText(120),
  trackingCategoryId: optionalText(120),
  invoicePrefix: optionalText(20),
  customerNamingRule: z.enum(['CUSTOMER_NAME', 'COMPANY_NAME_EMAIL', 'ACCOUNT_NUMBER_NAME']).optional(),
  config: financeIntegrationConfigSchema.optional()
});

const financeProviderParam = z.object({ provider: z.enum(financeProviderValues) });
const financeInvoiceSyncParam = z.object({ id: z.string().min(1), invoiceId: z.string().min(1) });
const financePaymentSyncParam = z.object({ id: z.string().min(1), paymentId: z.string().min(1) });
const financeBatchSyncSchema = z.object({
  invoiceIds: z.array(z.string().min(1)).max(100).default([]),
  paymentIds: z.array(z.string().min(1)).max(100).default([])
});
const financeWebhookParam = z.object({ provider: z.enum(financeProviderValues), companyId: z.string().min(1) });

const paymentProviderConfigSchema = z.record(z.union([z.string().trim().max(1000), z.boolean(), z.number()])).default({});
const paymentProviderConnectionSchema = z.object({
  provider: z.enum(paymentProviderValues),
  displayName: optionalText(120),
  status: z.enum(paymentProviderConnectionStatusValues).optional(),
  config: paymentProviderConfigSchema,
  secrets: z.record(z.string().trim().max(2000)).optional()
});
const paymentProviderPatchSchema = z.object({
  displayName: optionalText(120),
  status: z.enum(paymentProviderConnectionStatusValues).optional(),
  config: paymentProviderConfigSchema.optional(),
  secrets: z.record(z.string().trim().max(2000)).optional()
});
const paymentLinkSchema = z.object({
  provider: z.enum(paymentProviderValues).optional(),
  providerConnectionId: z.string().min(1).optional(),
  amount: amount.optional(),
  currency: currencyCode.optional(),
  expiresAt: optionalDate,
  sendNow: z.boolean().optional()
});
const paymentWebhookParam = z.object({ provider: z.enum(paymentProviderValues), companyId: z.string().min(1) });
const reconciliationImportSchema = z.object({
  provider: z.enum(paymentProviderValues),
  providerConnectionId: z.string().min(1).optional(),
  providerPaymentId: optionalText(160),
  reference: optionalText(200),
  payerName: optionalText(200),
  payerEmail: optionalEmail,
  amount: amount,
  currency: currencyCode.default('USD'),
  paidAt: optionalDate,
  raw: z.record(z.any()).optional()
});
const reconciliationMatchSchema = z.object({ invoiceId: z.string().min(1), method: z.enum(paymentMethodValues).default('BANK_TRANSFER') });
const refundSchema = z.object({ amount: amount.optional(), reason: optionalText(1000), providerConnectionId: z.string().min(1).optional() });
const reminderSchema = z.object({ channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS']).default('EMAIL'), reminderType: optionalText(80), force: z.boolean().optional() });
const promisePaymentSchema = z.object({ promisedPaymentDate: optionalDate, paymentPlanNotes: optionalText(1000) });

const workerDeviceRegisterSchema = z.object({
  platform: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  deviceName: optionalText(120),
  deviceModel: optionalText(120),
  appVersion: optionalText(80),
  deviceId: z.string().trim().min(4).max(180)
});
const workerSyncBootstrapSchema = z.object({
  deviceId: z.string().trim().min(4).max(180).optional()
});
const workerSyncPullQuerySchema = z.object({
  since: optionalDate,
  deviceId: optionalText(180),
  page: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional()
});
const offlinePayloadSchema = z.record(z.any()).default({});
const offlineActionSchema = z.object({
  idempotencyKey: z.string().trim().min(6).max(180),
  clientActionId: optionalText(180),
  actionType: z.enum(offlineActionTypeValues),
  snapshotUpdatedAt: optionalDate,
  payload: offlinePayloadSchema
});
const workerSyncPushSchema = z.object({
  deviceId: z.string().trim().min(4).max(180).optional(),
  actions: z.array(offlineActionSchema).min(1).max(100)
});
const workerSyncStatusParam = z.object({ idempotencyKey: z.string().trim().min(1).max(180) });
const workerDeviceIdParam = z.object({ id: z.string().trim().min(1).max(180) });
const workerDeviceRevokeSchema = z.object({ reason: optionalText(500) });
const offlineActionIdParam = z.object({ id: z.string().trim().min(1).max(180) });
const offlineActionResolveSchema = z.object({ resolutionNote: optionalText(1000) });
const offlineActionAdminQuerySchema = z.object({ status: z.enum(offlineActionStatusValues).optional(), workerId: optionalText(160), deviceId: optionalText(180), limit: z.coerce.number().int().positive().max(200).optional() });
const checklistItemSchema = z.object({ label: z.string().trim().min(1).max(240), helpText: optionalText(500), answerType: z.enum(['TEXT', 'NUMBER', 'YES_NO', 'PASS_FAIL', 'PHOTO']).default('TEXT'), required: z.boolean().optional(), photoRequired: z.boolean().optional(), passFail: z.boolean().optional(), sortOrder: z.coerce.number().int().optional(), active: z.boolean().optional() });
const checklistTemplateSchema = z.object({ serviceId: optionalText(160), contractId: optionalText(160), name: z.string().trim().min(1).max(180), description: optionalText(1000), active: z.boolean().optional(), requiredForCompletion: z.boolean().optional(), sortOrder: z.coerce.number().int().optional(), items: z.array(checklistItemSchema).optional() });

const branchSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: optionalText(40),
  country: optionalText(80),
  city: optionalText(120),
  address: optionalText(500),
  timezone: optionalText(80),
  active: z.boolean().optional()
});
const approvalPolicySchema = z.object({
  name: z.string().trim().min(1).max(160),
  eventType: z.enum(approvalEventTypeValues),
  thresholdAmount: amount.optional(),
  branchId: optionalText(160),
  requiredApproverRole: z.enum(['OWNER', 'ADMIN']).optional(),
  allowSelfApproval: z.boolean().optional(),
  reasonRequired: z.boolean().optional(),
  expiresAfterHours: z.coerce.number().int().positive().optional(),
  active: z.boolean().optional()
});
const approvalRequestSchema = z.object({
  policyId: optionalText(160),
  branchId: optionalText(160),
  entityType: z.string().trim().min(1).max(80),
  entityId: z.string().trim().min(1).max(160),
  eventType: z.enum(approvalEventTypeValues),
  actionKey: optionalText(160),
  actionPayload: z.record(z.any()).optional(),
  amount: amount.optional(),
  reason: optionalText(1000)
});
const approvalDecisionSchema = z.object({
  decisionNote: optionalText(1000)
});
const permissionOverrideSchema = z.object({
  permissionKey: z.enum(permissionKeys),
  allowed: z.boolean().default(true),
  branchId: optionalText(160)
});
const branchAccessSchema = z.object({
  branchId: z.string().min(1),
  permissions: z.array(z.enum(permissionKeys)).optional(),
  active: z.boolean().optional()
});
const approvalExecutionSchema = z.object({
  decisionNote: optionalText(1000)
});



function lifecycleWorkerId(req, job) {
  return req.user.role === 'WORKER' && req.user.worker ? req.user.worker.id : job.workerId;
}

function evidenceStatus(job) {
  const proofPhotos = Array.isArray(job.proofPhotos) ? job.proofPhotos : [];
  const countByCategory = (category) => proofPhotos.filter((photo) => (photo.category || 'GENERAL') === category).length;
  const beforePhotoCount = countByCategory('BEFORE');
  const afterPhotoCount = countByCategory('AFTER');
  const generalPhotoCount = proofPhotos.filter((photo) => !['BEFORE', 'AFTER'].includes(photo.category || 'GENERAL')).length;
  const proofPhotoCount = proofPhotos.length;
  const proofPhotosRequired = Boolean(job.requiresProofPhotos);
  const signatureCaptured = Boolean(job.signature);
  const locationCaptured = Boolean(job.completionLocation);
  return {
    proofPhotosRequired,
    minimumProofPhotos: proofPhotosRequired ? 1 : 0,
    proofPhotoCount,
    beforePhotoCount,
    afterPhotoCount,
    generalPhotoCount,
    proofPhotosSatisfied: !proofPhotosRequired || proofPhotoCount >= 1,
    beforePhotosRequired: Boolean(job.requiresBeforePhotos),
    beforePhotosSatisfied: !job.requiresBeforePhotos || beforePhotoCount >= 1,
    afterPhotosRequired: Boolean(job.requiresAfterPhotos),
    afterPhotosSatisfied: !job.requiresAfterPhotos || afterPhotoCount >= 1,
    signatureRequired: Boolean(job.requiresSignature),
    signatureCaptured,
    signatureSatisfied: !job.requiresSignature || signatureCaptured,
    completionNotesRequired: true,
    completionNotesSatisfied: Boolean(job.completionNotes),
    locationRequired: Boolean(job.requiresLocation),
    locationCaptured,
    locationSatisfied: !job.requiresLocation || locationCaptured
  };
}

function jobWithEvidenceStatus(job) {
  if (!job) return job;
  return { ...job, completionEvidence: evidenceStatus(job) };
}

function proofSummary(job, clientSafe = false) {
  const evidence = evidenceStatus(job);
  const location = job.completionLocation ? {
    present: true,
    capturedAt: job.completionLocation.capturedAt,
    source: job.completionLocation.source || null,
    accuracy: job.completionLocation.accuracy || null,
    ...(clientSafe ? {} : { latitude: job.completionLocation.latitude, longitude: job.completionLocation.longitude, capturedById: job.completionLocation.capturedById || null })
  } : { present: false };
  return {
    jobId: job.id,
    status: job.status,
    completedAt: job.completedAt || null,
    completedBy: clientSafe ? undefined : job.completedBy && { id: job.completedBy.id, name: job.completedBy.name, role: job.completedBy.role },
    beforePhotoCount: evidence.beforePhotoCount,
    afterPhotoCount: evidence.afterPhotoCount,
    generalProofPhotoCount: evidence.generalPhotoCount,
    proofPhotoCount: evidence.proofPhotoCount,
    signaturePresent: evidence.signatureCaptured,
    signedByName: job.signature && job.signature.signerName || null,
    completionNotes: job.completionNotes || null,
    locationPresent: location.present,
    location,
    requirements: evidence
  };
}

function createActivityData(req, job, type, note, metadata, syncMeta = {}) {
  return {
    companyId: req.companyId,
    jobId: job.id,
    workerId: lifecycleWorkerId(req, job),
    userId: req.user.id,
    type,
    note,
    metadata,
    capturedAt: syncMeta.capturedAt,
    offlineCreatedAt: syncMeta.offlineCreatedAt,
    deviceId: syncMeta.deviceId,
    syncId: syncMeta.syncId
  };
}

async function addJobActivity(tx, req, job, type, note, metadata, syncMeta = {}) {
  return tx.jobActivity.create({ data: createActivityData(req, job, type, note, metadata, syncMeta), include: jobActivityInclude });
}

function workerRequired(req) {
  if (!req.user.worker) throw new AppError(403, 'Worker profile is required');
  return req.user.worker;
}

function dateFromPayload(value) {
  return value ? new Date(String(value)) : undefined;
}

function safeSyncMeta(payload = {}, deviceId, idempotencyKey) {
  return {
    capturedAt: dateFromPayload(payload.capturedAt),
    offlineCreatedAt: dateFromPayload(payload.offlineCreatedAt),
    deviceId: payload.deviceId || deviceId,
    syncId: idempotencyKey
  };
}

function offlineJob(job) {
  if (!job) return job;
  return normalize({
    id: job.id,
    title: job.title,
    description: job.description,
    status: job.status,
    customerId: job.customerId,
    serviceId: job.serviceId,
    workerId: job.workerId,
    scheduledStart: job.scheduledStart,
    scheduledEnd: job.scheduledEnd,
    arrivedAt: job.arrivedAt,
    startedAt: job.startedAt,
    pausedAt: job.pausedAt,
    resumedAt: job.resumedAt,
    completedAt: job.completedAt,
    completionNotes: job.completionNotes,
    requiresProofPhotos: job.requiresProofPhotos,
    requiresBeforePhotos: job.requiresBeforePhotos,
    requiresAfterPhotos: job.requiresAfterPhotos,
    requiresSignature: job.requiresSignature,
    requiresLocation: job.requiresLocation,
    updatedAt: job.updatedAt,
    customer: job.customer && { id: job.customer.id, name: job.customer.name, phone: job.customer.phone, address: job.customer.address },
    service: job.service && { id: job.service.id, name: job.service.name, description: job.service.description },
    assets: (job.jobAssets || []).map((link) => link.asset && { id: link.asset.id, name: link.asset.name, assetType: link.asset.assetType, assetTag: link.asset.assetTag, locationLabel: link.asset.locationLabel }).filter(Boolean),
    parts: (job.jobPartUsages || []).map(safeWorkerPart),
    proofPhotos: job.proofPhotos || [],
    signature: job.signature || null,
    completionLocation: job.completionLocation || null,
    checklistAnswers: job.checklistAnswers || []
  });
}

const offlineJobInclude = {
  customer: true,
  service: true,
  jobAssets: { include: { asset: true } },
  jobPartUsages: { include: { item: true, location: true } },
  proofPhotos: { orderBy: { createdAt: 'desc' } },
  signature: true,
  completionLocation: true,
  checklistAnswers: { include: { item: true, template: true } }
};

async function registerOrTouchWorkerDevice(req, body, tx = prisma) {
  const worker = workerRequired(req);
  const now = new Date();
  const existing = await tx.workerDevice.findFirst({ where: { companyId: req.companyId, deviceId: body.deviceId } });
  const data = {
    companyId: req.companyId,
    workerId: worker.id,
    userId: req.user.id,
    platform: body.platform,
    deviceName: body.deviceName,
    deviceModel: body.deviceModel,
    appVersion: body.appVersion,
    deviceId: body.deviceId,
    lastSeenAt: now,
    trustedAt: existing && existing.trustedAt || now
  };
  if (existing) {
    if (!existing.active || existing.revokedAt) throw new AppError(403, 'Worker device has been revoked');
    return tx.workerDevice.update({ where: { id: existing.id }, data });
  }
  return tx.workerDevice.create({ data: { ...data, active: true } });
}

async function resolveWorkerDevice(req, deviceId) {
  if (!deviceId) return null;
  const worker = workerRequired(req);
  const device = await prisma.workerDevice.findFirst({ where: { companyId: req.companyId, workerId: worker.id, deviceId } });
  if (!device) throw notFound('Worker device not found');
  if (!device.active || device.revokedAt) throw new AppError(403, 'Worker device has been revoked');
  await prisma.workerDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return device;
}

function parseSyncSnapshot(action, payload) {
  const value = action.snapshotUpdatedAt || payload.snapshotUpdatedAt || payload.jobUpdatedAt;
  return value ? new Date(value) : null;
}

function isJobStale(job, snapshot) {
  return snapshot && job.updatedAt && new Date(job.updatedAt).getTime() > snapshot.getTime();
}

function conflictError(message, details) {
  return new AppError(409, message || 'Offline action conflicts with newer server state', { code: 'SYNC_CONFLICT', ...(details || {}) });
}

async function requiredChecklistItemsForJob(tx, req, job) {
  const templates = await tx.jobChecklistTemplate.findMany({ where: { companyId: req.companyId, active: true } });
  const applicableTemplates = templates.filter((template) => template.requiredForCompletion !== false && (!template.serviceId || template.serviceId === job.serviceId) && (!template.contractId || template.contractId === job.contractId));
  const items = [];
  for (const template of applicableTemplates) {
    const templateItems = await tx.jobChecklistItem.findMany({ where: { companyId: req.companyId, templateId: template.id, active: true } });
    for (const item of templateItems.filter((entry) => entry.required || entry.photoRequired)) items.push({ ...item, templateId: template.id });
  }
  return items;
}

async function assertRequiredChecklistComplete(tx, req, job) {
  const requiredItems = await requiredChecklistItemsForJob(tx, req, job);
  if (!requiredItems.length) return;
  const answers = await tx.jobChecklistAnswer.findMany({ where: { companyId: req.companyId, jobId: job.id } });
  const missing = requiredItems.filter((item) => {
    const answer = answers.find((entry) => entry.itemId === item.id);
    if (!answer) return true;
    if (item.photoRequired && !answer.photoUrl) return true;
    if (item.required && (answer.answer == null || String(answer.answer).trim() === '') && answer.passed == null && !answer.photoUrl) return true;
    return false;
  });
  if (missing.length) throw new AppError(409, 'Required checklist is incomplete', { code: 'CHECKLIST_INCOMPLETE', missingItemIds: missing.map((item) => item.id) });
}

async function saveChecklistAnswers(tx, req, job, payload, meta) {
  const templateId = payload.templateId;
  if (!templateId) throw new AppError(400, 'templateId is required');
  const template = await tx.jobChecklistTemplate.findFirst({ where: { id: templateId, companyId: req.companyId, active: true } });
  if (!template) throw notFound('Checklist template not found');
  if (template.serviceId && template.serviceId !== job.serviceId) throw new AppError(409, 'Checklist template does not match job service');
  if (template.contractId && template.contractId !== job.contractId) throw new AppError(409, 'Checklist template does not match job contract');
  const answers = Array.isArray(payload.answers) ? payload.answers : [];
  const saved = [];
  for (const entry of answers) {
    if (!entry.itemId) throw new AppError(400, 'Checklist itemId is required');
    const item = await tx.jobChecklistItem.findFirst({ where: { id: entry.itemId, companyId: req.companyId, templateId, active: true } });
    if (!item) throw notFound('Checklist item not found');
    if (item.photoRequired && !entry.photoUrl) throw new AppError(409, 'Checklist item requires a photo');
    const data = {
      companyId: req.companyId,
      jobId: job.id,
      templateId,
      itemId: item.id,
      workerId: req.user.worker.id,
      capturedById: req.user.id,
      answer: entry.answer == null ? null : String(entry.answer),
      passed: entry.passed == null ? null : Boolean(entry.passed),
      note: entry.note,
      photoUrl: entry.photoUrl,
      capturedAt: meta.capturedAt || new Date(),
      offlineCreatedAt: meta.offlineCreatedAt,
      deviceId: meta.deviceId,
      syncId: meta.syncId
    };
    const existing = await tx.jobChecklistAnswer.findFirst({ where: { companyId: req.companyId, jobId: job.id, itemId: item.id } });
    const answer = existing ? await tx.jobChecklistAnswer.update({ where: { id: existing.id }, data }) : await tx.jobChecklistAnswer.create({ data });
    saved.push(answer);
  }
  await addJobActivity(tx, req, job, 'STATUS_CHANGED', payload.note || 'Checklist completed offline', { offline: true, checklistTemplateId: templateId, answerCount: saved.length }, meta);
  return { jobId: job.id, templateId, answerCount: saved.length };
}

async function processOfflineAction(tx, req, queue, action, device) {
  const payload = action.payload || {};
  const meta = safeSyncMeta(payload, device && device.deviceId, action.idempotencyKey);
  const jobId = payload.jobId;
  if (!jobId) throw new AppError(400, 'payload.jobId is required');
  const job = await tx.job.findFirst({ where: { id: jobId, companyId: req.companyId, workerId: req.user.worker.id } });
  if (!job) throw notFound('Job not found');
  const now = meta.capturedAt || new Date();
  const snapshot = parseSyncSnapshot(action, payload);
  if (isJobStale(job, snapshot)) throw conflictError('Job changed after offline snapshot', { jobId: job.id, serverUpdatedAt: job.updatedAt, snapshotUpdatedAt: snapshot.toISOString() });

  if (action.actionType === 'JOB_ARRIVE') {
    await tx.job.update({ where: { id: job.id }, data: { status: 'ARRIVED', arrivedAt: now } });
    await addJobActivity(tx, req, job, 'ARRIVED', payload.note, { offline: true }, meta);
    return { jobId: job.id };
  }
  if (action.actionType === 'JOB_START') {
    await tx.job.update({ where: { id: job.id }, data: { status: 'IN_PROGRESS', startedAt: now } });
    await addJobActivity(tx, req, job, 'STARTED', payload.note, { offline: true }, meta);
    return { jobId: job.id };
  }
  if (action.actionType === 'JOB_PAUSE') {
    await tx.job.update({ where: { id: job.id }, data: { status: 'PAUSED', pausedAt: now } });
    await addJobActivity(tx, req, job, 'PAUSED', payload.note, { offline: true }, meta);
    return { jobId: job.id };
  }
  if (action.actionType === 'JOB_RESUME') {
    await tx.job.update({ where: { id: job.id }, data: { status: 'IN_PROGRESS', resumedAt: now } });
    await addJobActivity(tx, req, job, 'RESUMED', payload.note, { offline: true }, meta);
    return { jobId: job.id };
  }
  if (action.actionType === 'JOB_COMPLETE') {
    if (job.status === 'COMPLETED') throw new AppError(409, 'Job is already completed');
    await assertRequiredChecklistComplete(tx, req, job);
    await tx.job.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: now, completedById: req.user.id, completionNotes: payload.completionNotes || payload.note || job.completionNotes } });
    await addJobActivity(tx, req, job, 'COMPLETED', payload.completionNotes || payload.note, { offline: true }, meta);
    return { jobId: job.id };
  }
  if (action.actionType === 'JOB_NOTE') {
    const activity = await addJobActivity(tx, req, job, 'STATUS_CHANGED', payload.note || 'Offline note', { offline: true, noteType: 'WORKER_NOTE' }, meta);
    return { jobId: job.id, activityId: activity.id };
  }
  if (action.actionType === 'LOCATION_CAPTURED' || action.actionType === 'GPS_CHECKPOINT') {
    if (payload.latitude == null || payload.longitude == null) throw new AppError(400, 'latitude and longitude are required');
    const location = await tx.jobCompletionLocation.upsert({
      where: { jobId: job.id },
      update: { capturedById: req.user.id, latitude: Number(payload.latitude), longitude: Number(payload.longitude), accuracy: payload.accuracy == null ? undefined : Number(payload.accuracy), source: payload.source || 'OFFLINE_SYNC', capturedAt: now, offlineCreatedAt: meta.offlineCreatedAt, deviceId: meta.deviceId, syncId: meta.syncId },
      create: { companyId: req.companyId, jobId: job.id, capturedById: req.user.id, latitude: Number(payload.latitude), longitude: Number(payload.longitude), accuracy: payload.accuracy == null ? undefined : Number(payload.accuracy), source: payload.source || 'OFFLINE_SYNC', capturedAt: now, offlineCreatedAt: meta.offlineCreatedAt, deviceId: meta.deviceId, syncId: meta.syncId }
    });
    await addJobActivity(tx, req, job, 'COMPLETION_LOCATION_CAPTURED', null, { offline: true, locationId: location.id }, meta);
    return { jobId: job.id, locationId: location.id };
  }
  if (action.actionType === 'PROOF_PHOTO_UPLOADED') {
    if (!payload.url) throw new AppError(400, 'proof photo url is required');
    const existingPhoto = await tx.jobProofPhoto.findFirst({ where: { companyId: req.companyId, jobId: job.id, syncId: meta.syncId } });
    if (existingPhoto) return { jobId: job.id, proofPhotoId: existingPhoto.id, duplicate: true };
    const photo = await tx.jobProofPhoto.create({ data: { companyId: req.companyId, jobId: job.id, workerId: req.user.worker.id, uploadedById: req.user.id, url: payload.url, filename: payload.filename || 'offline-proof.jpg', mimeType: payload.mimeType || 'image/jpeg', sizeBytes: Number(payload.sizeBytes || 0), category: payload.category || 'GENERAL', caption: payload.caption, capturedAt: meta.capturedAt, offlineCreatedAt: meta.offlineCreatedAt, deviceId: meta.deviceId, latitude: payload.latitude == null ? undefined : Number(payload.latitude), longitude: payload.longitude == null ? undefined : Number(payload.longitude), accuracy: payload.accuracy == null ? undefined : Number(payload.accuracy), syncId: meta.syncId } });
    await addJobActivity(tx, req, job, 'PROOF_PHOTO_ADDED', payload.caption, { offline: true, proofPhotoId: photo.id, category: photo.category }, meta);
    return { jobId: job.id, proofPhotoId: photo.id };
  }
  if (action.actionType === 'SIGNATURE_CAPTURED') {
    if (!payload.signatureUrl) throw new AppError(400, 'signatureUrl is required');
    const signature = await tx.jobSignature.upsert({
      where: { jobId: job.id },
      update: { capturedById: req.user.id, signerName: payload.signerName, signatureUrl: payload.signatureUrl, mimeType: payload.mimeType || 'image/png', sizeBytes: Number(payload.sizeBytes || 0), capturedAt: now, offlineCreatedAt: meta.offlineCreatedAt, deviceId: meta.deviceId, latitude: payload.latitude == null ? undefined : Number(payload.latitude), longitude: payload.longitude == null ? undefined : Number(payload.longitude), accuracy: payload.accuracy == null ? undefined : Number(payload.accuracy), syncId: meta.syncId },
      create: { companyId: req.companyId, jobId: job.id, capturedById: req.user.id, signerName: payload.signerName, signatureUrl: payload.signatureUrl, mimeType: payload.mimeType || 'image/png', sizeBytes: Number(payload.sizeBytes || 0), capturedAt: now, offlineCreatedAt: meta.offlineCreatedAt, deviceId: meta.deviceId, latitude: payload.latitude == null ? undefined : Number(payload.latitude), longitude: payload.longitude == null ? undefined : Number(payload.longitude), accuracy: payload.accuracy == null ? undefined : Number(payload.accuracy), syncId: meta.syncId }
    });
    await addJobActivity(tx, req, job, 'SIGNATURE_ADDED', payload.signerName, { offline: true, signatureId: signature.id }, meta);
    return { jobId: job.id, signatureId: signature.id };
  }
  if (action.actionType === 'CHECKLIST_COMPLETED') {
    return saveChecklistAnswers(tx, req, job, payload, meta);
  }
  if (action.actionType === 'ISSUE_NOTE') {
    const activity = await addJobActivity(tx, req, job, 'STATUS_CHANGED', payload.note || 'Issue reported offline', { offline: true, issue: true, severity: payload.severity || 'NORMAL', photoUrl: payload.photoUrl }, meta);
    return { jobId: job.id, activityId: activity.id };
  }
  if (action.actionType === 'CUSTOMER_UNAVAILABLE') {
    await tx.job.update({ where: { id: job.id }, data: { status: 'ON_HOLD' } });
    const activity = await addJobActivity(tx, req, job, 'STATUS_CHANGED', payload.note || 'Customer unavailable', { offline: true, customerUnavailable: true }, meta);
    return { jobId: job.id, activityId: activity.id };
  }
  if (action.actionType === 'PART_USED') {
    if (!payload.itemId || !payload.locationId || !payload.quantity) throw new AppError(400, 'itemId, locationId and quantity are required');
    await requireInventoryItem(req, payload.itemId);
    await requireStockLocation(req, payload.locationId);
    await applyStockChange(tx, req, { itemId: payload.itemId, locationId: payload.locationId, jobId: job.id, movementType: 'JOB_USED', quantity: Number(payload.quantity), reason: payload.notes || 'Offline parts used', onHandDelta: -Number(payload.quantity), reservedDelta: 0 });
    const part = await tx.jobPartUsage.create({ data: { companyId: req.companyId, jobId: job.id, itemId: payload.itemId, locationId: payload.locationId, workerId: req.user.worker.id, quantityUsed: Number(payload.quantity), notes: payload.notes, status: 'USED' } });
    return { jobId: job.id, partId: part.id };
  }
  if (action.actionType === 'PART_SHORTAGE') {
    if (!payload.itemId || !payload.quantity) throw new AppError(400, 'itemId and quantity are required');
    await requireInventoryItem(req, payload.itemId);
    const part = await tx.jobPartUsage.create({ data: { companyId: req.companyId, jobId: job.id, itemId: payload.itemId, workerId: req.user.worker.id, quantityPlanned: Number(payload.quantity), notes: payload.notes, status: 'SHORT' } });
    const request = await tx.purchaseRequest.create({ data: { companyId: req.companyId, jobId: job.id, requestedById: req.user.id, reason: payload.notes || 'Offline part shortage' } });
    return { jobId: job.id, partId: part.id, purchaseRequestId: request.id };
  }
  throw new AppError(400, 'Unsupported offline action type');
}

async function processQueuedOfflineAction(req, action, device) {
  const worker = workerRequired(req);
  const duplicate = await prisma.offlineActionQueue.findFirst({ where: { companyId: req.companyId, idempotencyKey: action.idempotencyKey } });
  if (duplicate) return { id: duplicate.id, idempotencyKey: action.idempotencyKey, actionType: action.actionType, status: 'DUPLICATE', originalStatus: duplicate.status, processedAt: duplicate.processedAt, error: duplicate.error || null };

  const queue = await prisma.offlineActionQueue.create({ data: { companyId: req.companyId, workerId: worker.id, userId: req.user.id, workerDeviceId: device && device.id, idempotencyKey: action.idempotencyKey, clientActionId: action.clientActionId, actionType: action.actionType, payload: action.payload, snapshotUpdatedAt: action.snapshotUpdatedAt || action.payload && (action.payload.snapshotUpdatedAt || action.payload.jobUpdatedAt) || null, status: 'RECEIVED' } });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const outcome = await processOfflineAction(tx, req, queue, action, device);
      const updated = await tx.offlineActionQueue.update({ where: { id: queue.id }, data: { status: 'PROCESSED', processedAt: new Date(), error: null, result: outcome } });
      await addAuditLog(tx, req, 'SYNC_PROCESSED', 'OfflineActionQueue', queue.id, { actionType: action.actionType, idempotencyKey: action.idempotencyKey });
      return { updated, outcome };
    });
    return { id: result.updated.id, idempotencyKey: action.idempotencyKey, actionType: action.actionType, status: result.updated.status, processedAt: result.updated.processedAt, result: result.outcome };
  } catch (error) {
    const isConflict = error && error.status === 409 && error.details && error.details.code === 'SYNC_CONFLICT';
    const status = isConflict ? 'CONFLICT' : error && (error.status === 403 || error.status === 404) ? 'REJECTED' : 'FAILED';
    const updated = await prisma.offlineActionQueue.update({ where: { id: queue.id }, data: { status, processedAt: new Date(), error: error.message || 'Sync action failed', conflictReason: isConflict ? error.message : undefined, result: error.details || undefined } });
    return { id: updated.id, idempotencyKey: action.idempotencyKey, actionType: action.actionType, status: updated.status, processedAt: updated.processedAt, error: updated.error };
  }
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
const bookingUploadDir = path.resolve(__dirname, '../../uploads/booking-requests');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(proofUploadDir, { recursive: true });
fs.mkdirSync(signatureUploadDir, { recursive: true });
fs.mkdirSync(bookingUploadDir, { recursive: true });

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
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new AppError(400, 'Only PNG, JPG, and WEBP logos are allowed')); 
    cb(null, true);
  }
});

const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!evidenceImageTypes.includes(file.mimetype)) return cb(new AppError(400, 'Only PNG, JPG, and WEBP proof photos are allowed'));
    cb(null, true);
  }
});

const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!evidenceImageTypes.includes(file.mimetype)) return cb(new AppError(400, 'Only PNG, JPG, and WEBP signatures are allowed'));
    cb(null, true);
  }
});

const bookingPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!evidenceImageTypes.includes(file.mimetype)) return cb(new AppError(400, 'Only PNG, JPG, and WEBP booking photos are allowed'));
    cb(null, true);
  }
});

function bookingPhotoUploadMiddleware(req, res, next) {
  if (!String(req.headers['content-type'] || '').startsWith('multipart/form-data')) return next();
  bookingPhotoUpload.array('photos', 5)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof AppError) return next(error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new AppError(400, 'Uploaded image is too large'));
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT') return next(new AppError(400, 'Too many photos uploaded'));
    return next(error);
  });
}

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
const invoiceInclude = { customer: true, service: true, job: true, quote: true, payments: true, receipts: true, paymentLinks: { orderBy: { createdAt: 'desc' } }, lineItems: { orderBy: { sortOrder: 'asc' } }, statusHistory: { orderBy: { createdAt: 'desc' } } };
const quoteDeleteRetentionDays = 30;

function quoteDeletedFilter(req) {
  return String(req.query && req.query.deleted || '').toLowerCase() === 'true' ? { deletedAt: { not: null } } : { deletedAt: null };
}

async function purgeExpiredDeletedQuotes(companyId) {
  await prisma.quote.deleteMany({ where: { companyId, deletedAt: { not: null }, deleteExpiresAt: { lte: new Date() } } });
}

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
  const data = {
    amount: totals.amount.toNumber(),
    subtotal: totals.subtotal.toNumber(),
    discountTotal: totals.discountTotal.toNumber(),
    taxTotal: totals.taxTotal.toNumber(),
    total: totals.total.toNumber(),
    balanceDue: balanceDue.toNumber()
  };
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
  const settings = await getCompanyFinanceSettings(companyId, tx);
  const prefix = settings.invoicePrefix || counter.prefix || 'INV';
  let nextNumber = counter.nextNumber;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const number = prefix + '-' + String(nextNumber).padStart(counter.padding, '0');
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
  const settings = await getCompanyFinanceSettings(payment.companyId, tx);
  const prefix = settings.receiptPrefix || 'RCT';
  return tx.receipt.create({ data: { companyId: payment.companyId, branchId: payment.branchId || invoice.branchId || null, invoiceId: invoice.id, paymentId: payment.id, receiptNumber: prefix + '-' + String(count + 1).padStart(4, '0'), amount: payment.amount } });
}

const scheduleInclude = { job: { include: { customer: true, service: true } }, worker: { include: SAFE_WORKER_INCLUDE } };
const activeScheduleStatuses = ['SCHEDULED', 'DISPATCHED', 'IN_PROGRESS'];
const scheduleStatusValues = ['SCHEDULED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'];
const conflictTypeValues = ['OVERLAP', 'TIME_OFF', 'OUTSIDE_AVAILABILITY', 'OUTSIDE_WORKING_HOURS', 'INVALID_TIME', 'JOB_NOT_SCHEDULABLE'];

const schedulingSettingsSchema = z.object({
  defaultJobDurationMinutes: z.coerce.number().int().positive().optional(),
  defaultTravelBufferMinutes: z.coerce.number().int().min(0).optional(),
  allowOverbooking: z.boolean().optional(),
  defaultJobStatus: z.enum(jobStatusValues).optional(),
  requireCompletionNotes: z.boolean().optional(),
  requireProofPhotos: z.boolean().optional(),
  requireBeforePhotos: z.boolean().optional(),
  requireAfterPhotos: z.boolean().optional(),
  requireLocation: z.boolean().optional(),
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
  return { defaultJobDurationMinutes: 60, defaultTravelBufferMinutes: 0, allowOverbooking: false, defaultJobStatus: 'NEW', requireCompletionNotes: true, requireProofPhotos: true, requireBeforePhotos: false, requireAfterPhotos: false, requireLocation: false, autoCreateScheduleOnAssign: false, timezone: 'UTC', workingDayStart: '08:00', workingDayEnd: '17:00' };
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

const companySecuritySettingsSchema = z.object({
  sessionLengthHours: z.coerce.number().int().min(1).max(24).default(8),
  passwordMinimum: z.coerce.number().int().min(8).max(128).default(8),
  twoFactorEnabled: z.boolean().default(false),
  twoFactorRequired: z.boolean().default(false)
});

const securityDefaults = () => ({
  sessionLengthHours: 8,
  passwordMinimum: 8,
  twoFactorEnabled: false,
  twoFactorRequired: false
});

async function ensureSecuritySettingsTable() {
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "CompanySecuritySettings" ("id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL UNIQUE, "sessionLengthHours" INTEGER NOT NULL DEFAULT 8, "passwordMinimum" INTEGER NOT NULL DEFAULT 8, "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false, "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)');
}

async function getCompanySecuritySettings(companyId) {
  await ensureSecuritySettingsTable();
  const rows = await prisma.$queryRaw`SELECT "sessionLengthHours", "passwordMinimum", "twoFactorEnabled", "twoFactorRequired" FROM "CompanySecuritySettings" WHERE "companyId" = ${companyId} LIMIT 1`;
  return rows[0] || securityDefaults();
}

async function saveCompanySecuritySettings(companyId, input) {
  await ensureSecuritySettingsTable();
  const id = crypto.randomUUID();
  const rows = await prisma.$queryRaw`
    INSERT INTO "CompanySecuritySettings" ("id", "companyId", "sessionLengthHours", "passwordMinimum", "twoFactorEnabled", "twoFactorRequired", "createdAt", "updatedAt")
    VALUES (${id}, ${companyId}, ${input.sessionLengthHours}, ${input.passwordMinimum}, ${input.twoFactorEnabled}, ${input.twoFactorRequired}, now(), now())
    ON CONFLICT ("companyId") DO UPDATE SET
      "sessionLengthHours" = EXCLUDED."sessionLengthHours",
      "passwordMinimum" = EXCLUDED."passwordMinimum",
      "twoFactorEnabled" = EXCLUDED."twoFactorEnabled",
      "twoFactorRequired" = EXCLUDED."twoFactorRequired",
      "updatedAt" = now()
    RETURNING "sessionLengthHours", "passwordMinimum", "twoFactorEnabled", "twoFactorRequired"`;
  return rows[0] || securityDefaults();
}

router.post('/auth/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const user = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: req.body.companyName } });
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    if (tx.companySubscription) {
      await tx.companySubscription.create({ data: { companyId: company.id, status: 'TRIALING', trialStartedAt, trialEndsAt, currentPeriodStart: trialStartedAt, currentPeriodEnd: trialEndsAt, provider: process.env.SAAS_BILLING_PROVIDER || null } });
    }
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
  clearClientAuthCookie(res);
  setAuthCookie(res, user);
  await audit({ companyId: user.companyId, user }, 'REGISTER', 'User', user.id, { companyName: user.company && user.company.name });
  sendData(res, publicUser(user), 201);
}));

router.post('/auth/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email }, select: SAFE_LOGIN_USER_SELECT });
  if (!user || !(await verifyPassword(req.body.password, user.passwordHash))) throw new AppError(401, 'Invalid email or password');
  clearClientAuthCookie(res);
  setAuthCookie(res, user);
  await audit({ companyId: user.companyId, user }, 'LOGIN', 'User', user.id);
  sendData(res, publicUser(user));
}));

router.post('/auth/logout', (req, res) => {
  clearAuthCookie(res);
  clearClientAuthCookie(res);
  sendData(res, { loggedOut: true });
});

router.get('/health', (req, res) => sendData(res, { service: 'fieldcore-api', ok: true }));
router.get('/auth/session', asyncHandler(async (req, res) => {
  if (req.cookies[CLIENT_COOKIE_NAME]) return sendData(res, null);
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

router.get('/company/security-settings', requireAuth, requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, normalize(await getCompanySecuritySettings(req.companyId)));
}));

router.patch('/company/security-settings', requireAuth, requireRole(...adminRoles), validate(companySecuritySettingsSchema), asyncHandler(async (req, res) => {
  const body = { ...req.body, twoFactorRequired: Boolean(req.body.twoFactorRequired), twoFactorEnabled: Boolean(req.body.twoFactorEnabled || req.body.twoFactorRequired) };
  const data = await saveCompanySecuritySettings(req.companyId, body);
  await audit(req, 'UPDATE', 'CompanySecuritySettings', req.companyId, { section: 'security' });
  sendData(res, normalize(data));
}));


const bookingRequestInclude = { customer: true, service: true, convertedJob: true, photos: true, clientAccount: { select: { id: true, name: true, email: true, phone: true, status: true } } };
const publicTimeWindow = z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANY_TIME']).optional().or(z.literal('')).transform((value) => value || undefined);
const publicBookingRequestSchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  customerEmail: optionalEmail,
  customerPhone: optionalText(60),
  address: z.string().trim().min(3).max(300),
  city: optionalText(120),
  propertyType: optionalText(80),
  accessNotes: optionalText(1000),
  serviceId: optionalText(120),
  serviceName: optionalText(160),
  preferredDate: optionalDate,
  preferredTimeWindow: publicTimeWindow,
  notes: optionalText(2000),
  photos: z.array(z.object({
    url: z.string().regex(/^\/uploads\/booking-requests\/[a-zA-Z0-9._-]+$/),
    filename: optionalText(240),
    originalName: optionalText(240),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']).default('image/jpeg'),
    sizeBytes: z.coerce.number().int().min(0).max(5 * 1024 * 1024).default(0),
    caption: optionalText(500)
  })).max(5).optional(),
  source: optionalText(80)
}).refine((data) => data.customerEmail || data.customerPhone, { message: 'Email or phone is required', path: ['customerEmail'] })
  .refine((data) => data.serviceId || data.serviceName, { message: 'Service is required', path: ['serviceId'] });
const publicTrackSchema = z.object({ reference: z.string().trim().min(4).max(40), contact: z.string().trim().min(3).max(160) });
const bookingRequestMessageSchema = z.object({ customerFacingMessage: optionalText(1000) });

async function publicBookingCompany() {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' }, include: { branding: true } });
  if (!company) throw notFound('Company not found');
  return company;
}

function publicCompanySummary(company, financeSettings) {
  const branding = publicBranding(company);
  return { brandName: branding.brandName, logoUrl: branding.logoUrl, primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor, accentColor: branding.accentColor, supportEmail: branding.supportEmail, supportPhone: branding.supportPhone, localization: financeLocalization(financeSettings || financeSettingsDefaults(company && company.id)) };
}

function contactKey(value) {
  return String(value || '').trim().toLowerCase();
}

function phoneKey(value) {
  return String(value || '').replace(/[^\d+]/g, '');
}

function phoneMatches(stored, provided) {
  const left = phoneKey(stored).replace(/^\+/, '');
  const right = phoneKey(provided).replace(/^\+/, '');
  if (!left || !right) return false;
  return left === right || left.endsWith(right) && right.length >= 7 || right.endsWith(left) && left.length >= 7;
}

function publicRequestStatus(request) {
  const status = request && request.status;
  if (/quote has been sent/i.test(String(request && request.customerFacingMessage || ''))) return { label: 'Quote Sent', nextStep: 'Review the quote sent by the company and follow the acceptance instructions.' };
  if (status === 'REVIEWED') return { label: 'Under Review', nextStep: 'The team is reviewing your request and will contact you with the next step.' };
  if (status === 'CONVERTED') return { label: 'Approved', nextStep: 'Your request has been approved. The team will follow up to quote or schedule the work.' };
  if (status === 'DECLINED' || status === 'CANCELLED') return { label: 'Rejected', nextStep: 'This request is not moving forward. Contact the company if you need more detail.' };
  return { label: 'Submitted', nextStep: 'Your request has been received. The team will review it and contact you shortly.' };
}

function publicTrackingResponse(request) {
  const state = publicRequestStatus(request);
  const serviceName = request.service && request.service.name || request.serviceName || 'Service request';
  return {
    reference: request.publicReference,
    status: state.label,
    service: { name: serviceName, description: request.service && request.service.description || null },
    submittedAt: request.createdAt,
    preferredDate: request.preferredDate,
    preferredTimeWindow: request.preferredTimeWindow,
    customerFacingMessage: request.customerFacingMessage || null,
    nextStep: request.customerFacingMessage || state.nextStep
  };
}

async function bookingPhotoData(companyId, bookingRequestId, file, extra = {}) {
  const stored = await storeUploadedFile({
    companyId,
    file,
    scope: 'booking-requests',
    relatedId: bookingRequestId,
    localSubdir: 'booking-requests',
    filenamePrefix: 'booking',
    bookingId: bookingRequestId,
    customerId: extra.customerId || null,
    uploadedById: extra.uploadedById || null
  });
  return {
    companyId,
    bookingRequestId,
    url: stored.url,
    filename: stored.filename,
    originalName: stored.originalName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes
  };
}

async function createPublicReference(tx, companyId) {
  const prefix = 'REQ';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const reference = prefix + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const existing = await tx.bookingRequest.findFirst({ where: { companyId, publicReference: reference } });
    if (!existing) return reference;
  }
  throw new AppError(409, 'Could not allocate request reference');
}

router.get('/public/company', asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  sendData(res, normalize(publicCompanySummary(company, await getCompanyFinanceSettings(company.id))));
}));

router.get('/public/services', asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  const finance = financeLocalization(await getCompanyFinanceSettings(company.id));
  const services = await prisma.service.findMany({ where: { companyId: company.id, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true, price: true } });
  sendData(res, normalize(services.map((service) => ({ id: service.id, name: service.name, description: service.description || null, basePrice: service.price, currency: finance.defaultCurrency, taxName: finance.taxName }))));
}));

router.post('/public/booking-requests', bookingPhotoUploadMiddleware, validate(publicBookingRequestSchema), asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  await requireFeature(company.id, 'publicBookingPortal');
  await requirePlanLimit(company.id, 'maxPublicBookingsPerMonth');
  let service = null;
  if (req.body.serviceId) {
    service = await prisma.service.findFirst({ where: { id: req.body.serviceId, companyId: company.id, active: true } });
    if (!service) throw notFound('Service not found');
  }
  const publicReference = await createPublicReference(prisma, company.id);
  const created = await prisma.bookingRequest.create({ data: { companyId: company.id, publicReference, status: 'NEW', customerName: req.body.customerName, customerEmail: req.body.customerEmail, customerPhone: req.body.customerPhone, address: req.body.address, city: req.body.city, propertyType: req.body.propertyType, accessNotes: req.body.accessNotes, serviceId: service && service.id, serviceName: service ? service.name : req.body.serviceName, preferredDate: req.body.preferredDate, preferredTimeWindow: req.body.preferredTimeWindow, notes: req.body.notes, source: req.body.source || 'public_booking' } });
  const uploaded = [];
  for (const file of (req.files || [])) uploaded.push(await bookingPhotoData(company.id, created.id, file));
  const provided = (req.body.photos || []).map((photo) => ({ companyId: company.id, bookingRequestId: created.id, url: photo.url, filename: photo.filename || path.basename(photo.url), originalName: photo.originalName, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes, caption: photo.caption }));
  for (const photo of uploaded.concat(provided).slice(0, 5)) await prisma.bookingRequestPhoto.create({ data: photo });
  const data = await prisma.bookingRequest.findFirst({ where: { id: created.id, companyId: company.id }, include: bookingRequestInclude });
  await notify('BOOKING_CREATED', { companyId: company.id, relatedType: 'BookingRequest', relatedId: data.id, record: { ...data, service } });
  sendData(res, normalize(data), 201);
}));

router.post('/public/booking-requests/track', validate(publicTrackSchema), asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  const request = await prisma.bookingRequest.findFirst({ where: { companyId: company.id, publicReference: req.body.reference }, include: { service: true } });
  const contact = req.body.contact;
  const matches = request && (
    request.customerEmail && contactKey(request.customerEmail) === contactKey(contact) ||
    phoneMatches(request.customerPhone, contact)
  );
  if (!matches) throw notFound('Request not found or details do not match.');
  sendData(res, normalize(publicTrackingResponse(request)));
}));

const CLIENT_COOKIE_NAME = process.env.CLIENT_COOKIE_NAME || "fieldcore_client_token";
const CLIENT_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 1000 * 60 * 60 * 8 };
const CLIENT_JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const clientEmailSchema = z.string().trim().email().transform(function(value) { return value.toLowerCase(); });
const clientPasswordSchema = z.string().min(8).max(200);
const clientRegisterSchema = z.object({ name: z.string().trim().min(2).max(160), email: clientEmailSchema, phone: optionalText(60), password: clientPasswordSchema });
const clientLoginSchema = z.object({ email: clientEmailSchema, password: z.string().min(1).max(200) });
const clientProfilePatchSchema = z.object({ name: z.string().trim().min(2).max(160).optional(), phone: optionalText(60) });
const clientChangePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: clientPasswordSchema });
const clientForgotPasswordSchema = z.object({ email: clientEmailSchema });
const clientVisibleQuoteStatuses = ["SENT", "ACCEPTED", "REJECTED", "EXPIRED"];
const clientVisibleInvoiceStatuses = ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"];

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
    const feature = await canUseFeature(account.companyId, 'clientPortal');
    if (!feature.allowed) throw new AppError(403, feature.reason, { code: 'FEATURE_NOT_AVAILABLE', feature: 'clientPortal' });
    req.clientAccount = account;
    req.companyId = account.companyId;
    next();
  } catch (error) {
    next(error.status ? error : new AppError(401, "Client authentication required"));
  }
}

function uniqueRequests(records) {
  const seen = new Set();
  return records.filter(function(record) { if (!record || seen.has(record.id)) return false; seen.add(record.id); return true; }).sort(function(a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
}

async function clientBookingRequests(account, extra) {
  const filters = [
    { clientAccountId: account.id },
    account.customerId ? { customerId: account.customerId } : null
  ].filter(Boolean);
  const lists = await Promise.all(filters.map(function(filter) {
    return prisma.bookingRequest.findMany({ where: { companyId: account.companyId, ...filter, ...(extra || {}) }, include: bookingRequestInclude, orderBy: { createdAt: "desc" } });
  }));
  return uniqueRequests([].concat.apply([], lists));
}

router.post("/client/auth/register", validate(clientRegisterSchema), asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  await requireFeature(company.id, 'clientPortal');
  await requirePlanLimit(company.id, 'maxClients');
  const existing = await prisma.clientAccount.findFirst({ where: { companyId: company.id, email: req.body.email } });
  if (existing) throw new AppError(409, "A client account already exists for this email");
  const account = await prisma.clientAccount.create({ data: { companyId: company.id, customerId: null, name: req.body.name, email: req.body.email, phone: req.body.phone, passwordHash: await hashPassword(req.body.password), status: "ACTIVE" } });
  clearAuthCookie(res);
  setClientAuthCookie(res, account);
  sendData(res, normalize(publicClientAccount(account)), 201);
}));

router.post("/client/auth/login", validate(clientLoginSchema), asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  await requireFeature(company.id, 'clientPortal');
  const account = await prisma.clientAccount.findFirst({ where: { companyId: company.id, email: req.body.email } });
  if (!account || !(await verifyPassword(req.body.password, account.passwordHash))) throw new AppError(401, "Invalid email or password");
  if (account.status === "DISABLED") throw new AppError(403, "Client account is disabled");
  const updated = await prisma.clientAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  clearAuthCookie(res);
  setClientAuthCookie(res, updated);
  sendData(res, normalize(publicClientAccount(updated)));
}));

router.post("/client/auth/logout", (req, res) => {
  clearAuthCookie(res);
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
  const quoteWhere = clientQuoteWhere(req.clientAccount);
  const invoiceWhere = clientInvoiceWhere(req.clientAccount);
  const now = new Date();
  const [quotes, jobs, invoices, profileCustomer] = customerWhere ? await Promise.all([
    quoteWhere ? prisma.quote.findMany({ where: quoteWhere, include: quoteInclude, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    prisma.job.findMany({ where: customerWhere, include: { customer: true, service: true, quotes: true, invoices: true, proofPhotos: true, signature: true, completionLocation: true }, orderBy: { createdAt: "desc" } }),
    invoiceWhere ? prisma.invoice.findMany({ where: invoiceWhere, include: invoiceInclude, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
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

router.post("/client/booking-requests", requireClientAuth, bookingPhotoUploadMiddleware, validate(publicBookingRequestSchema), asyncHandler(async (req, res) => {
  let service = null;
  if (req.body.serviceId) {
    service = await prisma.service.findFirst({ where: { id: req.body.serviceId, companyId: req.clientAccount.companyId, active: true } });
    if (!service) throw notFound("Service not found");
  }
  const publicReference = await createPublicReference(prisma, req.clientAccount.companyId);
  const created = await prisma.bookingRequest.create({ data: { companyId: req.clientAccount.companyId, publicReference, customerId: req.clientAccount.customerId, clientAccountId: req.clientAccount.id, status: "NEW", customerName: req.body.customerName, customerEmail: req.body.customerEmail || req.clientAccount.email, customerPhone: req.body.customerPhone || req.clientAccount.phone, address: req.body.address, city: req.body.city, propertyType: req.body.propertyType, accessNotes: req.body.accessNotes, serviceId: service && service.id, serviceName: service ? service.name : req.body.serviceName, preferredDate: req.body.preferredDate, preferredTimeWindow: req.body.preferredTimeWindow, notes: req.body.notes, source: "client_portal" } });
  const uploaded = [];
  for (const file of (req.files || [])) uploaded.push(await bookingPhotoData(req.clientAccount.companyId, created.id, file, { customerId: req.clientAccount.customerId }));
  const provided = (req.body.photos || []).map((photo) => ({ companyId: req.clientAccount.companyId, bookingRequestId: created.id, url: photo.url, filename: photo.filename || path.basename(photo.url), originalName: photo.originalName, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes, caption: photo.caption }));
  for (const photo of uploaded.concat(provided).slice(0, 5)) await prisma.bookingRequestPhoto.create({ data: photo });
  const data = await prisma.bookingRequest.findFirst({ where: { id: created.id, companyId: req.clientAccount.companyId }, include: bookingRequestInclude });
  await notify("BOOKING_CREATED", { companyId: req.clientAccount.companyId, relatedType: "BookingRequest", relatedId: data.id, record: { ...data, service, clientAccount: req.clientAccount } });
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

router.get("/client/storage/objects/:id", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const object = await getStorageObjectForCompany(req.clientAccount.companyId, req.params.id);
  if (!object) throw notFound("Stored file not found");
  let allowed = Boolean(object.customerId && req.clientAccount.customerId && object.customerId === req.clientAccount.customerId);
  if (!allowed && object.bookingId) {
    const request = await prisma.bookingRequest.findFirst({ where: { id: object.bookingId, companyId: req.clientAccount.companyId, clientAccountId: req.clientAccount.id } });
    allowed = Boolean(request);
  }
  if (!allowed && object.jobId && req.clientAccount.customerId) {
    const job = await prisma.job.findFirst({ where: { id: object.jobId, companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId }, select: { id: true } });
    allowed = Boolean(job);
  }
  if (!allowed) throw notFound("Stored file not found");
  return sendStorageObject(res, req.clientAccount.companyId, object.id);
}));

router.post("/client/auth/forgot-password", validate(clientForgotPasswordSchema), asyncHandler(async (req, res) => {
  const company = await publicBookingCompany();
  await prisma.clientAccount.findFirst({ where: { companyId: company.id, email: req.body.email } });
  sendData(res, { requested: true, message: "Password reset email delivery is not configured yet. Please contact the company to reset your password." });
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
function clientInvoice(invoice) { const paid = (invoice.payments || []).filter(function(p) { return p.status === "CONFIRMED"; }).reduce(function(sum, p) { return sum + Number(p.amount || 0); }, 0); return invoice && { id: invoice.id, invoiceNumber: invoice.number, number: invoice.number, status: invoice.status, customerId: invoice.customerId, quoteId: invoice.quoteId, jobId: invoice.jobId, service: invoice.service && { id: invoice.service.id, name: invoice.service.name }, customer: clientCustomer(invoice.customer), quote: invoice.quote && { id: invoice.quote.id, title: invoice.quote.title, status: invoice.quote.status }, job: clientJobSummary(invoice.job), createdAt: invoice.createdAt, updatedAt: invoice.updatedAt, dueDate: invoice.dueDate, subtotal: invoice.subtotal, tax: invoice.taxTotal, discount: invoice.discountTotal, total: invoice.total, amountPaid: paid, amountDue: invoice.balanceDue, balanceDue: invoice.balanceDue, lineItems: (invoice.lineItems || []).map(clientLine), paymentLinks: (invoice.paymentLinks || []).map((link) => ({ id: link.id, status: link.status, provider: link.provider, amount: link.amount, currency: link.currency, checkoutUrl: link.checkoutUrl, expiresAt: link.expiresAt })), payments: (invoice.payments || []).map(clientPayment), receipts: (invoice.receipts || []).map(clientReceipt) }; }
function clientAsset(asset) { return asset && { id: asset.id, customerId: asset.customerId, propertyId: asset.propertyId, serviceId: asset.serviceId, name: asset.name, assetType: asset.assetType, assetTag: asset.assetTag, serialNumber: asset.serialNumber, manufacturer: asset.manufacturer, modelNumber: asset.modelNumber, locationLabel: asset.locationLabel, installedAt: asset.installedAt, warrantyStartAt: asset.warrantyStartAt, warrantyEndAt: asset.warrantyEndAt, warrantyStatus: warrantyStatus(asset), status: asset.status, notes: asset.notes, service: asset.service && { id: asset.service.id, name: asset.service.name }, property: asset.property && { id: asset.property.id, label: asset.property.label, address: asset.property.address }, jobHistory: (asset.jobAssets || []).map((item) => clientJobSummary(item.job)).filter(Boolean) }; }
function clientContract(contract) { return contract && { id: contract.id, customerId: contract.customerId, propertyId: contract.propertyId, contractNumber: contract.contractNumber, name: contract.name, status: contract.status, startDate: contract.startDate, endDate: contract.endDate, currency: contract.currency, responseSlaHours: contract.responseSlaHours, completionSlaHours: contract.completionSlaHours, includedVisits: contract.includedVisits, notes: contract.notes, assets: (contract.assets || []).map((item) => clientAsset(item.asset)).filter(Boolean), serviceLines: (contract.serviceLines || []).map((line) => ({ id: line.id, title: line.title, service: line.service && { id: line.service.id, name: line.service.name }, frequency: line.frequency, interval: line.interval, visitsPerPeriod: line.visitsPerPeriod, nextDueAt: line.nextDueAt, defaultDurationMinutes: line.defaultDurationMinutes, requiresProofPhotos: line.requiresProofPhotos, requiresSignature: line.requiresSignature, requiresLocation: line.requiresLocation })), upcomingDueWork: contractDueItems(contract, new Date()) }; }
function clientJob(job) { return job && { id: job.id, title: job.title, description: job.description, status: job.status, customerId: job.customerId, quoteId: job.quotes && job.quotes[0] && job.quotes[0].id, invoiceId: job.invoices && job.invoices[0] && job.invoices[0].id, service: job.service && { id: job.service.id, name: job.service.name, description: job.service.description }, customer: clientCustomer(job.customer), scheduledStart: job.scheduledStart, scheduledEnd: job.scheduledEnd, address: job.customer && job.customer.address, arrivedAt: job.arrivedAt, startedAt: job.startedAt, pausedAt: job.pausedAt, resumedAt: job.resumedAt, completedAt: job.completedAt, completionNotes: job.completionNotes, requiresProofPhotos: job.requiresProofPhotos, minimumProofPhotos: job.minimumProofPhotos, requiresBeforePhotos: job.requiresBeforePhotos, requiresAfterPhotos: job.requiresAfterPhotos, requiresSignature: job.requiresSignature, requiresLocation: job.requiresLocation, proofCompletedAt: job.proofCompletedAt, signatureCompletedAt: job.signatureCompletedAt, contract: job.contract && { id: job.contract.id, contractNumber: job.contract.contractNumber, name: job.contract.name, status: job.contract.status }, responseDueAt: job.responseDueAt, completionDueAt: job.completionDueAt, slaStatus: job.slaStatus, slaBreachedAt: job.slaBreachedAt, assets: (job.jobAssets || []).map((item) => clientAsset(item.asset)).filter(Boolean), total: job.total, createdAt: job.createdAt, updatedAt: job.updatedAt, proofPhotos: (job.proofPhotos || []).map(clientProofPhoto), signature: clientSignature(job.signature), proofSummary: proofSummary(jobWithEvidenceStatus(job), true) }; }
function clientStorageUrl(url) { return String(url || '').replace(/^\/api\/storage\/objects\//, '/api/client/storage/objects/'); }
function clientProofPhoto(photo) { return photo && { id: photo.id, jobId: photo.jobId, url: clientStorageUrl(photo.url), category: photo.category || 'GENERAL', caption: photo.caption, createdAt: photo.createdAt }; }
function clientSignature(signature) { return signature && { id: signature.id, jobId: signature.jobId, signatureUrl: clientStorageUrl(signature.signatureUrl), signedByName: signature.signerName, createdAt: signature.createdAt }; }
async function sendStorageObject(res, companyId, id) {
  const result = await readStorageObject(companyId, id);
  if (!result) throw notFound('Stored file not found');
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.send(result.body);
}
function clientActivity(item) { const labels = { ASSIGNED: "Job scheduled", ARRIVED: "Worker arrived", STARTED: "Work started", PAUSED: "Work paused", RESUMED: "Work resumed", COMPLETED: "Work completed", PROOF_PHOTO_ADDED: "Proof uploaded", SIGNATURE_ADDED: "Signature collected" }; return labels[item.type] && { id: item.id, jobId: item.jobId, type: item.type, label: labels[item.type], note: item.type === "COMPLETED" ? item.note : undefined, createdAt: item.createdAt }; }
function clientQuoteWhere(account, extra) { return account.customerId ? { companyId: account.companyId, customerId: account.customerId, status: { in: clientVisibleQuoteStatuses }, deletedAt: null, ...(extra || {}) } : null; }
function clientInvoiceWhere(account, extra) { return account.customerId ? { companyId: account.companyId, customerId: account.customerId, status: { in: clientVisibleInvoiceStatuses }, ...(extra || {}) } : null; }
async function clientOwnedQuote(account, id) { const where = clientQuoteWhere(account, { id: id }); if (!where) return null; return prisma.quote.findFirst({ where, include: quoteInclude }); }
async function clientOwnedInvoice(account, id) { const where = clientInvoiceWhere(account, { id: id }); if (!where) return null; return prisma.invoice.findFirst({ where, include: invoiceInclude }); }
async function clientOwnedJob(account, id) { if (!account.customerId) return null; return prisma.job.findFirst({ where: { id: id, companyId: account.companyId, customerId: account.customerId }, include: { customer: true, service: true, contract: true, quotes: true, invoices: true, proofPhotos: { orderBy: { createdAt: "desc" } }, signature: true, completionLocation: true, jobAssets: { include: { asset: { include: { service: true, property: true } } } } } }); }
async function clientOwnedAsset(account, id) { if (!account.customerId) return null; return prisma.asset.findFirst({ where: { id: id, companyId: account.companyId, customerId: account.customerId }, include: assetInclude }); }
async function clientOwnedContract(account, id) { if (!account.customerId) return null; return prisma.serviceContract.findFirst({ where: { id: id, companyId: account.companyId, customerId: account.customerId }, include: contractInclude }); }
async function clientInvoiceIds(account) { const where = clientInvoiceWhere(account); if (!where) return []; const rows = await prisma.invoice.findMany({ where, select: { id: true } }); return rows.map(function(row) { return row.id; }); }
async function clientOwnedReceipt(account, id) { const invoiceIds = await clientInvoiceIds(account); if (!invoiceIds.length) return null; return prisma.receipt.findFirst({ where: { id: id, companyId: account.companyId, invoiceId: { in: invoiceIds } }, include: { invoice: true, payment: true } }); }

router.get("/client/assets", requireClientAuth, asyncHandler(async (req, res) => {
  if (!req.clientAccount.customerId) return sendData(res, []);
  const data = await prisma.asset.findMany({ where: { companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId, status: { not: 'RETIRED' } }, include: assetInclude, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(data.map(clientAsset)));
}));

router.get("/client/assets/:id", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const asset = await clientOwnedAsset(req.clientAccount, req.params.id);
  if (!asset) throw notFound("Asset not found");
  sendData(res, normalize(clientAsset(asset)));
}));

router.get("/client/service-contracts", requireClientAuth, asyncHandler(async (req, res) => {
  if (!req.clientAccount.customerId) return sendData(res, []);
  const data = await prisma.serviceContract.findMany({ where: { companyId: req.clientAccount.companyId, customerId: req.clientAccount.customerId, status: { in: ['ACTIVE', 'SUSPENDED', 'EXPIRED'] } }, include: contractInclude, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(data.map(clientContract)));
}));

router.get("/client/service-contracts/:id", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const contract = await clientOwnedContract(req.clientAccount, req.params.id);
  if (!contract || !['ACTIVE', 'SUSPENDED', 'EXPIRED'].includes(contract.status)) throw notFound("Service contract not found");
  sendData(res, normalize(clientContract(contract)));
}));

router.get("/client/quotes", requireClientAuth, asyncHandler(async (req, res) => {
  const where = clientQuoteWhere(req.clientAccount);
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
  const wasAccepted = quote.status === "ACCEPTED";
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
  if (!wasAccepted) await notify("QUOTE_ACCEPTED", { companyId: req.clientAccount.companyId, relatedType: "Quote", relatedId: data.id, record: data });
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
  await notify("QUOTE_REJECTED", { companyId: req.clientAccount.companyId, relatedType: "Quote", relatedId: data.id, record: data, context: { reason: req.body.reason } });
  sendData(res, normalize(clientQuote(data)));
}));

router.get("/client/invoices", requireClientAuth, asyncHandler(async (req, res) => {
  const where = clientInvoiceWhere(req.clientAccount);
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
  const data = await prisma.job.findMany({ where, include: { customer: true, service: true, contract: true, quotes: true, invoices: true, proofPhotos: { orderBy: { createdAt: "desc" } }, signature: true, completionLocation: true, jobAssets: { include: { asset: { include: { service: true, property: true } } } } }, orderBy: { createdAt: "desc" } });
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

router.get("/client/jobs/:id/proof-summary", requireClientAuth, validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await clientOwnedJob(req.clientAccount, req.params.id);
  if (!job) throw notFound("Job not found");
  sendData(res, normalize(proofSummary(job, true)));
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

router.use((req, res, next) => {
  if (req.cookies[CLIENT_COOKIE_NAME]) return next(new AppError(401, 'Admin authentication required'));
  return next();
});

router.post('/finance/webhooks/:provider/:companyId', validate(financeWebhookParam, 'params'), asyncHandler(async (req, res) => {
  const integration = await prisma.financeIntegration.findFirst({ where: { companyId: req.params.companyId, provider: req.params.provider } });
  if (!integration || integration.status === 'DISABLED') throw notFound('Finance integration not found');
  const signatureValid = validFinanceWebhookSignature(integration, req);
  if (!signatureValid) {
    await prisma.financeWebhookEvent.create({ data: { companyId: integration.companyId, integrationId: integration.id, provider: integration.provider, status: 'REJECTED', signatureValid: false, eventId: req.body && (req.body.eventId || req.body.id) || null, eventType: req.body && (req.body.eventType || req.body.type) || null, errorMessage: 'Invalid webhook signature' } });
    throw new AppError(401, 'Invalid webhook signature');
  }
  const provider = createFinanceProvider(integration.provider, { integration, tokens: {}, mapping: {} });
  const processed = await provider.handleWebhook(req.body || {});
  const event = await prisma.financeWebhookEvent.create({
    data: {
      companyId: integration.companyId,
      integrationId: integration.id,
      provider: integration.provider,
      eventId: processed.eventId || req.body && (req.body.eventId || req.body.id) || null,
      eventType: processed.eventType || req.body && (req.body.eventType || req.body.type) || null,
      status: 'PROCESSED',
      signatureValid: true,
      payload: req.body || {},
      processedAt: new Date()
    }
  });
  sendData(res, normalize({ received: true, event: safeFinanceWebhookEvent(event) }));
}));


router.post('/payment-webhooks/:provider/:companyId', validate(paymentWebhookParam, 'params'), asyncHandler(async (req, res) => {
  const connection = await prisma.paymentProviderConnection.findFirst({ where: { companyId: req.params.companyId, provider: req.params.provider } });
  if (!connection || connection.status === 'DISABLED') throw notFound('Payment provider connection not found');
  const signatureValid = verifySharedSecretWebhook(connection, req);
  const eventId = req.body && (req.body.eventId || req.body.id || req.body.providerPaymentId) || null;
  if (!signatureValid) {
    await prisma.paymentProviderEvent.create({ data: { companyId: connection.companyId, providerConnectionId: connection.id, provider: connection.provider, eventId, eventType: req.body && (req.body.eventType || req.body.type) || null, status: 'REJECTED', signatureValid: false, payload: req.body || {}, errorMessage: 'Invalid webhook signature' } });
    throw new AppError(401, 'Invalid payment webhook signature');
  }
  if (eventId) {
    const existingEvent = await prisma.paymentProviderEvent.findFirst({ where: { companyId: connection.companyId, provider: connection.provider, eventId } });
    if (existingEvent && existingEvent.status === 'PROCESSED') {
      const duplicate = await prisma.paymentProviderEvent.create({ data: { companyId: connection.companyId, providerConnectionId: connection.id, provider: connection.provider, eventId, eventType: req.body && (req.body.eventType || req.body.type) || 'duplicate', status: 'DUPLICATE', signatureValid: true, payload: req.body || {} } });
      return sendData(res, normalize({ duplicate: true, event: duplicate }));
    }
  }
  const provider = createPaymentProvider(connection.provider, { connection });
  const parsed = await provider.handleWebhookEvent(req.body || {});
  const reference = parsed.reference || (req.body && (req.body.reference || req.body.paymentReference));
  const link = reference ? await prisma.paymentLink.findFirst({ where: { companyId: connection.companyId, reference } }) : null;
  let payment = null;
  let invoice = null;
  let eventStatus = 'PROCESSED';
  if (!link) {
    await createOrFlagReconciliationItem({ companyId: connection.companyId, providerConnectionId: connection.id, provider: connection.provider, providerPaymentId: parsed.providerPaymentId || eventId, reference, amount: parsed.amount || 0, currency: parsed.currency || 'USD', paidAt: new Date(), raw: req.body || {}, status: 'UNMATCHED' });
  } else if (['CONFIRMED', 'PAID', 'SUCCESS', 'SUCCEEDED'].includes(String(parsed.status || '').toUpperCase())) {
    invoice = await prisma.invoice.findFirst({ where: { id: link.invoiceId, companyId: connection.companyId } });
    if (!invoice) throw notFound('Invoice not found');
    const duplicatePayment = parsed.providerPaymentId ? await prisma.payment.findFirst({ where: { companyId: connection.companyId, provider: connection.provider, providerPaymentId: parsed.providerPaymentId } }) : null;
    if (!duplicatePayment) {
      payment = await prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({ data: { companyId: connection.companyId, branchId: invoice.branchId || link.branchId || null, invoiceId: invoice.id, amount: parsed.amount || link.amount, method: link.provider === 'PAYFAST' ? 'PAYFAST' : link.provider === 'YOCO' ? 'YOCO' : link.provider === 'OZOW' ? 'OZOW' : link.provider === 'PAYNOW' ? 'PAYNOW' : 'EXTERNAL_PAYMENT_LINK', status: 'CONFIRMED', reference: link.reference, provider: link.provider, providerPaymentId: parsed.providerPaymentId || eventId || null, paymentLinkId: link.id, receivedAt: new Date(), confirmedAt: new Date(), notes: 'Confirmed by trusted payment provider webhook' } });
        await tx.paymentLink.update({ where: { id: link.id }, data: { status: 'PAID', paidAt: new Date(), externalId: parsed.providerPaymentId || link.externalId } });
        if (link.quoteId) await tx.quote.update({ where: { id: link.quoteId }, data: { depositPaidAt: new Date() } });
        await createReceiptForPayment(tx, created, invoice);
        await recalcInvoice(tx, connection.companyId, invoice.id);
        return created;
      });
    } else {
      eventStatus = 'DUPLICATE';
    }
  } else if (link) {
    await prisma.paymentLink.update({ where: { id: link.id }, data: { status: 'FAILED' } });
  }
  const event = await prisma.paymentProviderEvent.create({ data: { companyId: connection.companyId, providerConnectionId: connection.id, provider: connection.provider, eventId: parsed.eventId || eventId, eventType: parsed.eventType || req.body && (req.body.eventType || req.body.type) || 'payment.webhook', status: eventStatus, signatureValid: true, paymentLinkId: link && link.id || null, invoiceId: invoice && invoice.id || link && link.invoiceId || null, paymentId: payment && payment.id || null, payload: req.body || {}, processedAt: new Date() } });
  sendData(res, normalize({ received: true, event, payment }));
}));

router.use(requireAuth);

router.post('/worker/devices/register', requireRole('WORKER'), validate(workerDeviceRegisterSchema), asyncHandler(async (req, res) => {
  const device = await registerOrTouchWorkerDevice(req, req.body);
  await audit(req, 'REGISTER_DEVICE', 'WorkerDevice', device.id, { platform: device.platform, deviceId: device.deviceId });
  sendData(res, normalize(device), 201);
}));

router.post('/worker/sync/bootstrap', requireRole('WORKER'), validate(workerSyncBootstrapSchema), asyncHandler(async (req, res) => {
  const worker = workerRequired(req);
  let device = null;
  if (req.body.deviceId) device = await resolveWorkerDevice(req, req.body.deviceId);
  const jobs = await prisma.job.findMany({ where: { companyId: req.companyId, workerId: worker.id }, include: offlineJobInclude, orderBy: { scheduledStart: 'asc' } });
  sendData(res, normalize({ serverTime: new Date().toISOString(), syncCursor: new Date().toISOString(), device, jobs: jobs.map(offlineJob) }));
}));

router.get('/worker/mobile/config', requireRole('WORKER'), asyncHandler(async (req, res) => {
  workerRequired(req);
  sendData(res, normalize({ serverTime: new Date().toISOString(), supportedActionTypes: offlineActionTypeValues, supportedStatuses: offlineActionStatusValues, maxBatchSize: 100, requiresActiveDevice: true }));
}));

async function pullWorkerSync(req) {
  const worker = workerRequired(req);
  if (req.query.deviceId) await resolveWorkerDevice(req, req.query.deviceId);
  const where = { companyId: req.companyId, workerId: worker.id };
  if (req.query.since) where.updatedAt = { gte: req.query.since };
  const jobs = await prisma.job.findMany({ where, include: offlineJobInclude, orderBy: { scheduledStart: 'asc' } });
  const recentActions = await prisma.offlineActionQueue.findMany({ where: { companyId: req.companyId, workerId: worker.id, ...(req.query.since ? { updatedAt: { gte: req.query.since } } : {}) }, orderBy: { receivedAt: 'desc' }, take: Number(req.query.limit || 100) });
  return { serverTime: new Date().toISOString(), syncCursor: new Date().toISOString(), jobs: jobs.map(offlineJob), syncActions: recentActions };
}

router.get('/worker/sync/pull', requireRole('WORKER'), validate(workerSyncPullQuerySchema, 'query'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await pullWorkerSync(req)));
}));

router.get('/worker/sync/v2/pull', requireRole('WORKER'), validate(workerSyncPullQuerySchema, 'query'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await pullWorkerSync(req)));
}));

async function pushWorkerSync(req) {
  workerRequired(req);
  const device = req.body.deviceId ? await resolveWorkerDevice(req, req.body.deviceId) : null;
  const results = [];
  for (const action of req.body.actions) results.push(await processQueuedOfflineAction(req, action, device));
  if (device) await prisma.workerDevice.update({ where: { id: device.id }, data: { lastSyncedAt: new Date(), lastSeenAt: new Date() } });
  return { serverTime: new Date().toISOString(), syncCursor: new Date().toISOString(), partialSuccess: results.some((item) => item.status === 'PROCESSED') && results.some((item) => !['PROCESSED', 'DUPLICATE'].includes(item.status)), results };
}

router.post('/worker/sync/push', requireRole('WORKER'), validate(workerSyncPushSchema), asyncHandler(async (req, res) => {
  sendData(res, normalize(await pushWorkerSync(req)));
}));

router.post('/worker/sync/v2/push', requireRole('WORKER'), validate(workerSyncPushSchema), asyncHandler(async (req, res) => {
  sendData(res, normalize(await pushWorkerSync(req)));
}));

router.get('/worker/sync/status/:idempotencyKey', requireRole('WORKER'), validate(workerSyncStatusParam, 'params'), asyncHandler(async (req, res) => {
  const worker = workerRequired(req);
  const action = await prisma.offlineActionQueue.findFirst({ where: { companyId: req.companyId, workerId: worker.id, idempotencyKey: req.params.idempotencyKey } });
  if (!action) throw notFound('Sync action not found');
  sendData(res, normalize(action));
}));

router.get('/admin/worker-devices', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  await requirePermission(req, 'mobile.sync.manage');
  const devices = await prisma.workerDevice.findMany({ where: { companyId: req.companyId }, orderBy: { updatedAt: 'desc' } });
  sendData(res, normalize(devices));
}));

router.patch('/admin/worker-devices/:id/revoke', requireRole(...adminRoles), validate(workerDeviceIdParam, 'params'), validate(workerDeviceRevokeSchema), asyncHandler(async (req, res) => {
  await requirePermission(req, 'mobile.sync.manage');
  const device = await prisma.workerDevice.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
  if (!device) throw notFound('Worker device not found');
  const updated = await prisma.workerDevice.update({ where: { id: device.id }, data: { active: false, revokedAt: new Date(), revokedById: req.user.id, revokedReason: req.body.reason } });
  await audit(req, 'REVOKE_WORKER_DEVICE', 'WorkerDevice', device.id, { deviceId: device.deviceId, reason: req.body.reason });
  sendData(res, normalize(updated));
}));

router.get('/admin/offline-actions', requireRole(...adminRoles), validate(offlineActionAdminQuerySchema, 'query'), asyncHandler(async (req, res) => {
  await requirePermission(req, 'mobile.sync.manage');
  const where = { companyId: req.companyId };
  if (req.query.status) where.status = req.query.status;
  if (req.query.workerId) where.workerId = req.query.workerId;
  if (req.query.deviceId) where.workerDeviceId = req.query.deviceId;
  const actions = await prisma.offlineActionQueue.findMany({ where, orderBy: { receivedAt: 'desc' }, take: req.query.limit || 100 });
  sendData(res, normalize(actions));
}));

router.post('/admin/offline-actions/:id/resolve', requireRole(...adminRoles), validate(offlineActionIdParam, 'params'), validate(offlineActionResolveSchema), asyncHandler(async (req, res) => {
  await requirePermission(req, 'mobile.sync.manage');
  const action = await prisma.offlineActionQueue.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
  if (!action) throw notFound('Offline action not found');
  const updated = await prisma.offlineActionQueue.update({ where: { id: action.id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: req.user.id, resolutionNote: req.body.resolutionNote } });
  await audit(req, 'RESOLVE_OFFLINE_ACTION', 'OfflineActionQueue', action.id, { status: action.status, resolutionNote: req.body.resolutionNote });
  sendData(res, normalize(updated));
}));

router.get('/checklist-templates', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const templates = await prisma.jobChecklistTemplate.findMany({ where: { companyId: req.companyId }, orderBy: { sortOrder: 'asc' }, include: { items: true } });
  sendData(res, normalize(templates));
}));

router.post('/checklist-templates', requireRole(...adminRoles), validate(checklistTemplateSchema), asyncHandler(async (req, res) => {
  await requirePermission(req, 'mobile.sync.manage');
  if (req.body.serviceId) await requireService(req, req.body.serviceId);
  if (req.body.contractId) await requireServiceContract(req, req.body.contractId);
  const created = await prisma.$transaction(async (tx) => {
    const template = await tx.jobChecklistTemplate.create({ data: { companyId: req.companyId, serviceId: req.body.serviceId, contractId: req.body.contractId, name: req.body.name, description: req.body.description, active: req.body.active !== false, requiredForCompletion: req.body.requiredForCompletion !== false, sortOrder: req.body.sortOrder || 0 } });
    const items = [];
    for (const [index, item] of (req.body.items || []).entries()) {
      items.push(await tx.jobChecklistItem.create({ data: { companyId: req.companyId, templateId: template.id, label: item.label, helpText: item.helpText, answerType: item.answerType, required: !!item.required, photoRequired: !!item.photoRequired, passFail: !!item.passFail, sortOrder: item.sortOrder == null ? index : item.sortOrder, active: item.active !== false } }));
    }
    return { ...template, items };
  });
  sendData(res, normalize(created), 201);
}));

router.patch('/checklist-templates/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(checklistTemplateSchema.partial()), asyncHandler(async (req, res) => {
  await requirePermission(req, 'mobile.sync.manage');
  const existing = await prisma.jobChecklistTemplate.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
  if (!existing) throw notFound('Checklist template not found');
  const updated = await prisma.jobChecklistTemplate.update({ where: { id: existing.id }, data: { serviceId: req.body.serviceId, contractId: req.body.contractId, name: req.body.name, description: req.body.description, active: req.body.active, requiredForCompletion: req.body.requiredForCompletion, sortOrder: req.body.sortOrder } });
  sendData(res, normalize(updated));
}));

router.get('/storage/objects/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  return sendStorageObject(res, req.companyId, req.params.id);
}));

router.get('/company/profile', asyncHandler(async (req, res) => {
  const company = await getCompanyWithBranding(req.companyId);
  sendData(res, profileResponse(company));
}));


router.get('/company/finance-settings', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, normalize(financeLocalization(await getCompanyFinanceSettings(req.companyId))));
}));

router.get('/company/localization', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const [finance, scheduling] = await Promise.all([getCompanyFinanceSettings(req.companyId), getSchedulingSettings(req.companyId).catch(() => null)]);
  sendData(res, normalize({ ...financeLocalization(finance), schedulingTimezone: scheduling && scheduling.timezone || finance.timezone || 'Africa/Harare' }));
}));

router.get('/company/payment-methods', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const settings = financeLocalization(await getCompanyFinanceSettings(req.companyId));
  sendData(res, normalize({ methods: settings.allowedPaymentMethods, instructions: settings.paymentInstructions || null }));
}));

router.patch('/company/finance-settings', requireRole(...adminRoles), validate(financeSettingsSchema), asyncHandler(async (req, res) => {
  const update = { ...req.body };
  const data = await prisma.companyFinanceSettings.upsert({
    where: { companyId: req.companyId },
    update,
    create: { ...financeSettingsDefaults(req.companyId), ...update, id: undefined, createdAt: undefined, updatedAt: undefined }
  });
  if (update.timezone) {
    await prisma.companySchedulingSettings.upsert({ where: { companyId: req.companyId }, update: { timezone: update.timezone }, create: { ...schedulingDefaults(), companyId: req.companyId, timezone: update.timezone } });
  }
  await audit(req, 'UPDATE', 'CompanyFinanceSettings', data.id, { section: 'finance-localization' });
  sendData(res, normalize(financeLocalization(data)));
}));

router.get('/finance/integrations', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const data = await prisma.financeIntegration.findMany({ where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data.map(safeFinanceIntegration)));
}));

router.post('/finance/integrations', requireRole(...adminRoles), validate(financeIntegrationCreateSchema), asyncHandler(async (req, res) => {
  const data = await prisma.financeIntegration.upsert({
    where: { companyId_provider: { companyId: req.companyId, provider: req.body.provider } },
    update: { status: req.body.status || 'CONFIGURED', externalTenantId: req.body.externalTenantId, config: req.body.config || {} },
    create: { companyId: req.companyId, provider: req.body.provider, status: req.body.status || 'CONFIGURED', externalTenantId: req.body.externalTenantId, config: req.body.config || {} }
  });
  await audit(req, 'UPSERT', 'FinanceIntegration', data.id, { provider: data.provider });
  sendData(res, normalize(safeFinanceIntegration(data)), 201);
}));

router.patch('/finance/integrations/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(financeIntegrationPatchSchema), asyncHandler(async (req, res) => {
  const existing = await requireFinanceIntegration(req, req.params.id);
  const data = await prisma.financeIntegration.update({ where: { id: existing.id }, data: req.body });
  await audit(req, 'UPDATE', 'FinanceIntegration', data.id, { provider: data.provider });
  sendData(res, normalize(safeFinanceIntegration(data)));
}));

router.post('/finance/integrations/:id/connect', requireRole(...adminRoles), validate(idParam, 'params'), validate(financeConnectSchema), asyncHandler(async (req, res) => {
  const existing = await requireFinanceIntegration(req, req.params.id);
  if (!['XERO', 'SAGE', 'QUICKBOOKS'].includes(existing.provider)) throw new AppError(400, 'Provider does not support live accounting sync');
  const config = { ...(existing.config || {}) };
  if (req.body.mockMode !== undefined) config.mockMode = Boolean(req.body.mockMode);
  const data = await prisma.financeIntegration.update({
    where: { id: existing.id },
    data: { status: 'ACTIVE', externalTenantId: req.body.externalTenantId || existing.externalTenantId, config, connectedAt: new Date(), disconnectedAt: null, lastError: null }
  });
  if (req.body.tokens) await saveFinanceTokens(data, req.body.tokens);
  await audit(req, 'CONNECT', 'FinanceIntegration', data.id, { provider: data.provider, tokenStored: Boolean(req.body.tokens) });
  sendData(res, normalize({ integration: safeFinanceIntegration(data), connected: true }), 200);
}));

router.post('/finance/integrations/:id/disconnect', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const existing = await requireFinanceIntegration(req, req.params.id);
  const cleared = await clearFinanceTokens(existing);
  const data = await prisma.financeIntegration.update({ where: { id: existing.id }, data: { status: 'DISCONNECTED', connectedAt: null, disconnectedAt: new Date(), lastError: null } });
  await audit(req, 'DISCONNECT', 'FinanceIntegration', data.id, { provider: data.provider, clearedSecrets: cleared });
  sendData(res, normalize({ integration: safeFinanceIntegration(data), disconnected: true }));
}));

router.post('/finance/integrations/:id/test', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const existing = await requireFinanceIntegration(req, req.params.id);
  if (existing.provider !== 'MANUAL_CSV' && existing.status !== 'ACTIVE') {
    await audit(req, 'TEST_FAILED', 'FinanceIntegration', existing.id, { provider: existing.provider, errorCode: 'NOT_CONNECTED' });
    throw new AppError(409, 'Finance integration is not connected');
  }
  try {
    const test = existing.provider === 'MANUAL_CSV'
      ? { ok: true, verified: true, status: 'ACTIVE', message: 'Manual CSV export is available.' }
      : await testFinanceIntegration(existing);
    const data = await prisma.financeIntegration.findFirst({ where: { id: existing.id, companyId: req.companyId } });
    await audit(req, 'TEST', 'FinanceIntegration', existing.id, { provider: existing.provider, verified: Boolean(test.verified), mockMode: Boolean(test.mockMode) });
    sendData(res, normalize({ integration: safeFinanceIntegration(data || existing), test }));
  } catch (error) {
    const data = await prisma.financeIntegration.update({ where: { id: existing.id }, data: { status: 'ERROR', lastTestAt: new Date(), lastError: String(error.message || 'Test failed').slice(0, 500) } });
    await audit(req, 'TEST_FAILED', 'FinanceIntegration', existing.id, { provider: existing.provider, errorCode: error.code || 'TEST_FAILED' });
    throw new AppError(error.code === 'NOT_CONNECTED' ? 409 : 400, error.message);
  }
}));

router.get('/finance/mappings/:provider', requireRole(...adminRoles), validate(financeProviderParam, 'params'), asyncHandler(async (req, res) => {
  const mapping = await getFinanceMapping(req.companyId, req.params.provider);
  sendData(res, normalize(mapping));
}));

router.put('/finance/mappings/:provider', requireRole(...adminRoles), validate(financeProviderParam, 'params'), validate(financeMappingSchema), asyncHandler(async (req, res) => {
  let integrationId = req.body.integrationId || null;
  if (integrationId) await requireFinanceIntegration(req, integrationId);
  const mapping = await saveFinanceMapping(req.companyId, req.params.provider, { ...req.body, integrationId });
  await audit(req, 'UPSERT', 'FinanceMapping', mapping.id || req.params.provider, { provider: req.params.provider });
  sendData(res, normalize(mapping));
}));

router.post('/finance/integrations/:id/sync/invoices/:invoiceId', requireRole(...adminRoles), validate(financeInvoiceSyncParam, 'params'), asyncHandler(async (req, res) => {
  const integration = await requireFinanceIntegration(req, req.params.id);
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.invoiceId, companyId: req.companyId }, include: { customer: true, lineItems: true, payments: true } });
  if (!invoice) throw notFound('Invoice not found');
  try {
    const result = await syncFinanceRecord({ integration, localType: 'INVOICE', record: invoice, req });
    await audit(req, result.skipped ? 'SYNC_SKIPPED' : 'SYNC', 'Invoice', invoice.id, { provider: integration.provider, externalId: result.link && result.link.externalId });
    sendData(res, normalize(result), result.skipped ? 200 : 201);
  } catch (error) {
    if (error.code === 'NOT_CONNECTED') throw new AppError(409, error.message);
    if (error.syncLog) return sendData(res, normalize({ log: error.syncLog, error: { code: error.code || 'SYNC_FAILED', message: error.message } }), 502);
    throw error;
  }
}));

router.post('/finance/integrations/:id/sync/payments/:paymentId', requireRole(...adminRoles), validate(financePaymentSyncParam, 'params'), asyncHandler(async (req, res) => {
  const integration = await requireFinanceIntegration(req, req.params.id);
  const payment = await prisma.payment.findFirst({ where: { id: req.params.paymentId, companyId: req.companyId }, include: { receipt: true } });
  if (!payment) throw notFound('Payment not found');
  try {
    const result = await syncFinanceRecord({ integration, localType: 'PAYMENT', record: payment, req });
    await audit(req, result.skipped ? 'SYNC_SKIPPED' : 'SYNC', 'Payment', payment.id, { provider: integration.provider, externalId: result.link && result.link.externalId });
    sendData(res, normalize(result), result.skipped ? 200 : 201);
  } catch (error) {
    if (error.code === 'NOT_CONNECTED') throw new AppError(409, error.message);
    if (error.syncLog) return sendData(res, normalize({ log: error.syncLog, error: { code: error.code || 'SYNC_FAILED', message: error.message } }), 502);
    throw error;
  }
}));

router.post('/finance/integrations/:id/sync/batch', requireRole(...adminRoles), validate(idParam, 'params'), validate(financeBatchSyncSchema), asyncHandler(async (req, res) => {
  const integration = await requireFinanceIntegration(req, req.params.id);
  const results = [];
  for (const invoiceId of req.body.invoiceIds || []) {
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId: req.companyId }, include: { customer: true, lineItems: true, payments: true } });
    if (invoice) results.push({ localType: 'INVOICE', localId: invoiceId, ...(await syncFinanceRecord({ integration, localType: 'INVOICE', record: invoice, req })) });
  }
  for (const paymentId of req.body.paymentIds || []) {
    const payment = await prisma.payment.findFirst({ where: { id: paymentId, companyId: req.companyId }, include: { receipt: true } });
    if (payment) results.push({ localType: 'PAYMENT', localId: paymentId, ...(await syncFinanceRecord({ integration, localType: 'PAYMENT', record: payment, req })) });
  }
  await audit(req, 'BATCH_SYNC', 'FinanceIntegration', integration.id, { provider: integration.provider, count: results.length });
  sendData(res, normalize({ count: results.length, results }));
}));

router.get('/finance/sync-logs', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId };
  if (req.query.provider) where.provider = req.query.provider;
  if (req.query.status) where.status = req.query.status;
  if (req.query.localType) where.localType = req.query.localType;
  const result = await paged(prisma.financeSyncLog, req, { where, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data.map(safeFinanceSyncLog)), 200, result.meta);
}));

router.get('/finance/webhook-events', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.financeWebhookEvent, req, { where: { companyId: req.companyId }, orderBy: { receivedAt: 'desc' } });
  sendData(res, normalize(result.data.map(safeFinanceWebhookEvent)), 200, result.meta);
}));


router.get('/payment-providers', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const data = await prisma.paymentProviderConnection.findMany({ where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data.map(safePaymentProviderConnection)));
}));

router.post('/payment-providers', requireRole(...adminRoles), validate(paymentProviderConnectionSchema), asyncHandler(async (req, res) => {
  const data = await prisma.paymentProviderConnection.upsert({
    where: { companyId_provider: { companyId: req.companyId, provider: req.body.provider } },
    update: { displayName: req.body.displayName, status: req.body.status || 'CONFIGURED', config: req.body.config || {} },
    create: { companyId: req.companyId, provider: req.body.provider, displayName: req.body.displayName, status: req.body.status || 'CONFIGURED', config: req.body.config || {}, createdById: req.user.id }
  });
  if (req.body.secrets) await savePaymentProviderSecrets(data, req.body.secrets);
  await audit(req, 'UPSERT', 'PaymentProviderConnection', data.id, { provider: data.provider, secretsStored: Boolean(req.body.secrets) });
  sendData(res, normalize(safePaymentProviderConnection(data)), 201);
}));

router.patch('/payment-providers/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(paymentProviderPatchSchema), asyncHandler(async (req, res) => {
  const existing = await requirePaymentProviderConnection(req, req.params.id);
  const data = await prisma.paymentProviderConnection.update({ where: { id: existing.id }, data: { displayName: req.body.displayName, status: req.body.status, config: req.body.config } });
  if (req.body.secrets) await savePaymentProviderSecrets(data, req.body.secrets);
  await audit(req, 'UPDATE', 'PaymentProviderConnection', data.id, { provider: data.provider });
  sendData(res, normalize(safePaymentProviderConnection(data)));
}));

router.post('/payment-providers/:id/test', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const connection = await requirePaymentProviderConnection(req, req.params.id);
  const provider = createPaymentProvider(connection.provider, { connection });
  const result = await provider.testConnection();
  const data = await prisma.paymentProviderConnection.update({ where: { id: connection.id }, data: { lastTestedAt: new Date(), lastTestStatus: result.ok ? 'OK' : 'FAILED', lastTestError: result.ok ? null : result.message, status: result.ok ? connection.status : 'ERROR' } });
  if (!result.ok) throw new AppError(409, result.message || 'Payment provider is not configured');
  await audit(req, 'TEST', 'PaymentProviderConnection', data.id, { provider: data.provider, mockMode: Boolean(result.mockMode) });
  sendData(res, normalize({ connection: safePaymentProviderConnection(data), test: result }));
}));

router.get('/payment-links', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId };
  if (req.query.invoiceId) where.invoiceId = req.query.invoiceId;
  if (req.query.status) where.status = req.query.status;
  const result = await paged(prisma.paymentLink, req, { where, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data.map(safePaymentLink)), 200, result.meta);
}));

router.post('/invoices/:id/payment-links', requireRole(...adminRoles), validate(idParam, 'params'), validate(paymentLinkSchema), asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: { quote: true } });
  if (!invoice) throw notFound('Invoice not found');
  if (invoice.status === 'PAID' || invoice.status === 'VOID') throw new AppError(409, 'Payment links can only be generated for open invoices');
  const providerName = req.body.provider || 'MOCK';
  const connection = await requireActivePaymentProvider(req, providerName, req.body.providerConnectionId);
  const linkAmount = req.body.amount || invoice.balanceDue || invoice.total || invoice.amount;
  if (toDecimal(linkAmount).greaterThan(toDecimal(invoice.balanceDue || invoice.total || invoice.amount))) throw new AppError(400, 'Payment link amount exceeds invoice balance');
  const currency = req.body.currency || financeLocalization(await getCompanyFinanceSettings(req.companyId)).defaultCurrency;
  const reference = paymentReference(invoice.id);
  const provider = createPaymentProvider(connection.provider, { connection });
  const providerLink = await provider.createPaymentLink({ invoice, amount: linkAmount, currency, reference });
  const data = await prisma.paymentLink.create({ data: { companyId: req.companyId, branchId: invoice.branchId || null, invoiceId: invoice.id, quoteId: invoice.quoteId || null, providerConnectionId: connection.id, provider: connection.provider, status: req.body.sendNow ? 'SENT' : 'CREATED', amount: linkAmount, currency, reference, checkoutUrl: providerLink.checkoutUrl, externalId: providerLink.externalId, expiresAt: req.body.expiresAt || null, sentAt: req.body.sendNow ? new Date() : null, createdById: req.user.id } });
  await audit(req, 'CREATE', 'PaymentLink', data.id, { invoiceId: invoice.id, provider: data.provider });
  sendData(res, normalize(safePaymentLink(data)), 201);
}));

router.post('/invoices/:id/payment-promise', requireRole(...adminRoles), validate(idParam, 'params'), validate(promisePaymentSchema), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  const data = await prisma.invoice.update({ where: { id: invoice.id }, data: { promisedPaymentDate: req.body.promisedPaymentDate, paymentPlanNotes: req.body.paymentPlanNotes } });
  await audit(req, 'UPDATE_PAYMENT_PROMISE', 'Invoice', invoice.id, { promisedPaymentDate: req.body.promisedPaymentDate });
  sendData(res, normalize(data));
}));

router.get('/collections', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const now = new Date();
  const branch = branchFilterFromQuery(req);
  const invoices = await prisma.invoice.findMany({ where: { companyId: req.companyId, status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }, ...branch }, include: { customer: true, payments: true }, orderBy: { dueDate: 'asc' } });
  const buckets = { current: 0, days0to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  const rows = invoices.map((invoice) => {
    const due = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const daysOverdue = due ? Math.max(0, Math.floor((now - due) / 86400000)) : 0;
    const balance = Number(invoice.balanceDue || invoice.total || invoice.amount || 0);
    if (!due || due >= now) buckets.current += balance;
    else if (daysOverdue <= 30) buckets.days0to30 += balance;
    else if (daysOverdue <= 60) buckets.days31to60 += balance;
    else if (daysOverdue <= 90) buckets.days61to90 += balance;
    else buckets.days90plus += balance;
    return { id: invoice.id, number: invoice.number, customer: invoice.customer && invoice.customer.name, branchId: invoice.branchId || null, status: invoice.status, balanceDue: invoice.balanceDue, dueDate: invoice.dueDate, daysOverdue, promisedPaymentDate: invoice.promisedPaymentDate || null, lastReminderSentAt: invoice.lastReminderSentAt || null, nextReminderAt: invoice.nextReminderAt || null, riskLevel: daysOverdue > 90 ? 'HIGH' : daysOverdue > 30 ? 'MEDIUM' : 'LOW' };
  });
  sendData(res, normalize({ buckets, invoices: rows, totalOverdue: buckets.days0to30 + buckets.days31to60 + buckets.days61to90 + buckets.days90plus }));
}));

router.post('/collections/invoices/:id/reminders', requireRole(...adminRoles), validate(idParam, 'params'), validate(reminderSchema), asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: { customer: true } });
  if (!invoice) throw notFound('Invoice not found');
  if (['PAID', 'VOID'].includes(invoice.status)) throw new AppError(409, 'Paid or void invoices cannot receive collection reminders');
  const settings = financeLocalization(await getCompanyFinanceSettings(req.companyId));
  const last = await prisma.collectionReminderLog.findFirst({ where: { companyId: req.companyId, invoiceId: invoice.id, channel: req.body.channel, status: 'SENT' }, orderBy: { createdAt: 'desc' } });
  const nextAllowedAt = last && last.nextAllowedAt ? new Date(last.nextAllowedAt) : null;
  if (!req.body.force && nextAllowedAt && nextAllowedAt > new Date()) {
    const throttled = await prisma.collectionReminderLog.create({ data: { companyId: req.companyId, invoiceId: invoice.id, channel: req.body.channel, status: 'THROTTLED', reminderType: req.body.reminderType || 'collection', recipient: invoice.customer && (invoice.customer.email || invoice.customer.phone) || null, nextAllowedAt } });
    return sendData(res, normalize({ sent: false, throttled: true, reminder: throttled }), 202);
  }
  const allowedAt = new Date(Date.now() + settings.reminderThrottleHours * 3600000);
  const reminder = await prisma.collectionReminderLog.create({ data: { companyId: req.companyId, invoiceId: invoice.id, channel: req.body.channel, status: 'SENT', reminderType: req.body.reminderType || 'collection', recipient: invoice.customer && (invoice.customer.email || invoice.customer.phone) || null, sentAt: new Date(), nextAllowedAt: allowedAt } });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { lastReminderSentAt: new Date(), nextReminderAt: allowedAt } });
  await audit(req, 'SEND_COLLECTION_REMINDER', 'Invoice', invoice.id, { channel: req.body.channel });
  sendData(res, normalize({ sent: true, reminder }));
}));

router.get('/reconciliation/items', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId };
  if (req.query.status) where.status = req.query.status;
  if (req.query.provider) where.provider = req.query.provider;
  const result = await paged(prisma.paymentReconciliationItem, req, { where, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data.map(safeReconciliationItem)), 200, result.meta);
}));

router.post('/reconciliation/imports', requireRole(...adminRoles), validate(reconciliationImportSchema), asyncHandler(async (req, res) => {
  if (req.body.providerConnectionId) await requirePaymentProviderConnection(req, req.body.providerConnectionId);
  const item = await createOrFlagReconciliationItem({ companyId: req.companyId, branchId: null, providerConnectionId: req.body.providerConnectionId || null, provider: req.body.provider, providerPaymentId: req.body.providerPaymentId || null, reference: req.body.reference || null, payerName: req.body.payerName || null, payerEmail: req.body.payerEmail || null, amount: req.body.amount, currency: req.body.currency || 'USD', paidAt: req.body.paidAt || null, raw: req.body.raw || {}, status: 'UNMATCHED' });
  await audit(req, 'IMPORT_RECONCILIATION_ITEM', 'PaymentReconciliationItem', item.id, { provider: item.provider, status: item.status });
  sendData(res, normalize(safeReconciliationItem(item)), 201);
}));

router.post('/reconciliation/items/:id/match', requireRole(...adminRoles), validate(idParam, 'params'), validate(reconciliationMatchSchema), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.body.invoiceId);
  const result = await matchReconciliationItem({ companyId: req.companyId, itemId: req.params.id, invoice, userId: req.user.id, method: req.body.method });
  await createReceiptForPayment(prisma, result.payment, invoice);
  const updatedInvoice = await recalcInvoice(prisma, req.companyId, invoice.id);
  await audit(req, 'MATCH_RECONCILIATION_ITEM', 'PaymentReconciliationItem', req.params.id, { invoiceId: invoice.id, paymentId: result.payment.id });
  sendData(res, normalize({ item: safeReconciliationItem(result.item), payment: result.payment, invoice: updatedInvoice }));
}));

router.get('/finance/export/invoices.csv', requireRole(...adminRoles), validate(financeExportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const invoices = await prisma.invoice.findMany({ where: { companyId: req.companyId, ...financeDateWhere(req.query) }, include: { customer: true, service: true, job: true }, orderBy: { createdAt: 'desc' } });
  const headers = ['id', 'number', 'customer', 'service', 'status', 'subtotal', 'taxTotal', 'total', 'balanceDue', 'dueDate', 'createdAt'];
  const rows = invoices.map((item) => ({ id: item.id, number: item.number, customer: item.customer && item.customer.name || '', service: item.service && item.service.name || '', status: item.status, subtotal: item.subtotal || 0, taxTotal: item.taxTotal || 0, total: item.total || item.amount || 0, balanceDue: item.balanceDue || 0, dueDate: item.dueDate || '', createdAt: item.createdAt || '' }));
  return sendFinanceCsv(req, res, 'INVOICES', 'fieldcore-invoices.csv', headers, rows);
}));

router.get('/finance/export/payments.csv', requireRole(...adminRoles), validate(financeExportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const payments = await prisma.payment.findMany({ where: { companyId: req.companyId, ...financeDateWhere(req.query) }, orderBy: { createdAt: 'desc' } });
  const invoices = payments.length ? await prisma.invoice.findMany({ where: { companyId: req.companyId, id: { in: payments.map((item) => item.invoiceId) } }, include: { customer: true } }) : [];
  const invoiceMap = new Map(invoices.map((item) => [item.id, item]));
  const headers = ['id', 'invoiceNumber', 'customer', 'amount', 'method', 'status', 'reference', 'receivedAt', 'confirmedAt', 'createdAt'];
  const rows = payments.map((item) => { const invoice = invoiceMap.get(item.invoiceId) || {}; return { id: item.id, invoiceNumber: invoice.number || '', customer: invoice.customer && invoice.customer.name || '', amount: item.amount || 0, method: item.method, status: item.status, reference: item.reference || '', receivedAt: item.receivedAt || '', confirmedAt: item.confirmedAt || '', createdAt: item.createdAt || '' }; });
  return sendFinanceCsv(req, res, 'PAYMENTS', 'fieldcore-payments.csv', headers, rows);
}));

router.get('/finance/export/receipts.csv', requireRole(...adminRoles), validate(financeExportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const receipts = await prisma.receipt.findMany({ where: { companyId: req.companyId, ...financeDateWhere(req.query, 'issuedAt') }, orderBy: { issuedAt: 'desc' } });
  const invoices = receipts.length ? await prisma.invoice.findMany({ where: { companyId: req.companyId, id: { in: receipts.map((item) => item.invoiceId) } }, include: { customer: true } }) : [];
  const invoiceMap = new Map(invoices.map((item) => [item.id, item]));
  const headers = ['id', 'receiptNumber', 'invoiceNumber', 'customer', 'paymentId', 'amount', 'issuedAt'];
  const rows = receipts.map((item) => { const invoice = invoiceMap.get(item.invoiceId) || {}; return { id: item.id, receiptNumber: item.receiptNumber, invoiceNumber: invoice.number || '', customer: invoice.customer && invoice.customer.name || '', paymentId: item.paymentId, amount: item.amount || 0, issuedAt: item.issuedAt || '' }; });
  return sendFinanceCsv(req, res, 'RECEIPTS', 'fieldcore-receipts.csv', headers, rows);
}));

router.get('/finance/export/customers.csv', requireRole(...adminRoles), validate(financeExportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const customers = await prisma.customer.findMany({ where: { companyId: req.companyId, ...financeDateWhere(req.query) }, orderBy: { createdAt: 'desc' } });
  const headers = ['id', 'name', 'email', 'phone', 'address', 'createdAt'];
  const rows = customers.map((item) => ({ id: item.id, name: item.name, email: item.email || '', phone: item.phone || '', address: item.address || '', createdAt: item.createdAt || '' }));
  return sendFinanceCsv(req, res, 'CUSTOMERS', 'fieldcore-customers.csv', headers, rows);
}));

router.post('/finance/export/mark-exported', requireRole(...adminRoles), validate(financeMarkExportedSchema), asyncHandler(async (req, res) => {
  const syncedAt = req.body.exportedAt || new Date();
  const links = [];
  for (const localId of req.body.ids) {
    await requireFinanceLocalRecord(req, req.body.localType, localId);
    const externalId = req.body.externalIds && req.body.externalIds[localId] || [req.body.provider, req.body.localType, localId].join(':');
    const link = await prisma.externalRecordLink.upsert({
      where: { companyId_provider_localType_localId: { companyId: req.companyId, provider: req.body.provider, localType: req.body.localType, localId } },
      update: { externalId, lastSyncedAt: syncedAt },
      create: { companyId: req.companyId, provider: req.body.provider, localType: req.body.localType, localId, externalId, lastSyncedAt: syncedAt }
    });
    links.push(link);
  }
  await audit(req, 'MARK_EXPORTED', 'ExternalRecordLink', req.body.localType, { provider: req.body.provider, localType: req.body.localType, count: links.length });
  sendData(res, normalize({ marked: links.length, links }));
}));

router.get('/finance/export-logs', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.financeExportLog, req, { where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
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
  await requireFeature(req.companyId, 'customBranding');
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

    const stored = await storeUploadedFile({
      companyId: req.companyId,
      file: req.file,
      scope: 'logos',
      relatedId: 'branding',
      localSubdir: 'logos',
      filenamePrefix: req.companyId + '-logo',
      uploadedById: req.user.id,
      requirePublicUrl: true
    });
    const logoUrl = stored.url;

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


router.get('/branches', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.branch, req, { where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/branches', requireRole(...adminRoles), validate(branchSchema), asyncHandler(async (req, res) => {
  await requirePermission(req, 'branch.manage');
  const data = await prisma.branch.create({ data: { ...req.body, companyId: req.companyId, active: req.body.active !== false } });
  await audit(req, 'CREATE', 'Branch', data.id);
  sendData(res, normalize(data), 201);
}));

router.patch('/branches/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(branchSchema.partial()), asyncHandler(async (req, res) => {
  await requirePermission(req, 'branch.manage', { branchId: req.params.id });
  await requireBranch(req, req.params.id);
  const data = await prisma.branch.update({ where: { id: req.params.id }, data: req.body });
  await audit(req, 'UPDATE', 'Branch', data.id);
  sendData(res, normalize(data));
}));

router.get('/approval-policies', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.approvalPolicy, req, { where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/approval-policies', requireRole(...adminRoles), validate(approvalPolicySchema), asyncHandler(async (req, res) => {
  await requirePermission(req, 'approval.policy.manage', { branchId: req.body.branchId });
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  const data = await prisma.approvalPolicy.create({
    data: {
      ...req.body,
      companyId: req.companyId,
      requiredApproverRole: req.body.requiredApproverRole || 'ADMIN',
      active: req.body.active !== false,
      allowSelfApproval: req.body.allowSelfApproval !== false
    }
  });
  await audit(req, 'CREATE', 'ApprovalPolicy', data.id);
  sendData(res, normalize(data), 201);
}));

router.patch('/approval-policies/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(approvalPolicySchema.partial()), asyncHandler(async (req, res) => {
  const existing = await requireApprovalPolicy(req, req.params.id);
  await requirePermission(req, 'approval.policy.manage', { branchId: req.body.branchId || existing.branchId });
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  const data = await prisma.approvalPolicy.update({ where: { id: req.params.id }, data: req.body });
  await audit(req, 'UPDATE', 'ApprovalPolicy', data.id);
  sendData(res, normalize(data));
}));

router.get('/approvals', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const status = approvalStatusValues.includes(String(req.query.status || '')) ? String(req.query.status) : undefined;
  const result = await paged(prisma.approvalRequest, req, {
    where: { companyId: req.companyId, ...(status ? { status } : {}), ...branchFilterFromQuery(req) },
    include: { policy: true, requestedBy: { select: SAFE_USER_SELECT }, approvedBy: { select: SAFE_USER_SELECT } },
    orderBy: { createdAt: 'desc' }
  });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.get('/approvals/pending', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.approvalRequest, req, {
    where: { companyId: req.companyId, status: 'PENDING', ...branchFilterFromQuery(req) },
    include: { policy: true, requestedBy: { select: SAFE_USER_SELECT } },
    orderBy: { createdAt: 'desc' }
  });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/approvals', requireRole(...adminRoles), validate(approvalRequestSchema), asyncHandler(async (req, res) => {
  await requirePermission(req, 'approval.request.decide', { branchId: req.body.branchId });
  if (req.body.policyId) await requireApprovalPolicy(req, req.body.policyId);
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  const data = await prisma.approvalRequest.create({
    data: { ...req.body, actionPayload: safeAuditMetadata(req.body.actionPayload || {}), companyId: req.companyId, requestedById: req.user.id, status: 'PENDING' },
    include: { policy: true, requestedBy: { select: SAFE_USER_SELECT } }
  });
  await addEnterpriseAudit(req, 'CREATE', 'ApprovalRequest', data.id, { eventType: data.eventType, entityType: data.entityType, entityId: data.entityId, branchId: data.branchId });
  sendData(res, normalize(data), 201);
}));

router.post('/approvals/:id/approve', requireRole(...adminRoles), validate(idParam, 'params'), validate(approvalDecisionSchema), asyncHandler(async (req, res) => {
  const existing = await requireApprovalRequest(req, req.params.id);
  if (!(await canDecideApproval(req, existing))) throw new AppError(403, 'You cannot approve this request.');
  if (existing.status !== 'PENDING') throw new AppError(409, 'Approval request has already been decided.');
  if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) throw new AppError(409, 'Approval request has expired.');
  const data = await prisma.approvalRequest.update({
    where: { id: req.params.id },
    data: { status: 'APPROVED', approvedById: req.user.id, decisionNote: req.body.decisionNote, decidedAt: new Date() },
    include: { policy: true, requestedBy: { select: SAFE_USER_SELECT }, approvedBy: { select: SAFE_USER_SELECT } }
  });
  await audit(req, 'APPROVE', 'ApprovalRequest', data.id, { eventType: data.eventType, entityType: data.entityType, entityId: data.entityId });
  sendData(res, normalize(data));
}));

router.post('/approvals/:id/reject', requireRole(...adminRoles), validate(idParam, 'params'), validate(approvalDecisionSchema), asyncHandler(async (req, res) => {
  const existing = await requireApprovalRequest(req, req.params.id);
  if (!(await canDecideApproval(req, existing))) throw new AppError(403, 'You cannot reject this request.');
  if (existing.status !== 'PENDING') throw new AppError(409, 'Approval request has already been decided.');
  const data = await prisma.approvalRequest.update({
    where: { id: req.params.id },
    data: { status: 'REJECTED', approvedById: req.user.id, decisionNote: req.body.decisionNote, decidedAt: new Date() },
    include: { policy: true, requestedBy: { select: SAFE_USER_SELECT }, approvedBy: { select: SAFE_USER_SELECT } }
  });
  await audit(req, 'REJECT', 'ApprovalRequest', data.id, { eventType: data.eventType, entityType: data.entityType, entityId: data.entityId });
  sendData(res, normalize(data));
}));

router.post('/approvals/:id/execute', requireRole(...adminRoles), validate(idParam, 'params'), validate(approvalExecutionSchema), asyncHandler(async (req, res) => {
  const existing = await requireApprovalRequest(req, req.params.id);
  if (!(await canDecideApproval(req, existing))) throw new AppError(403, 'You cannot execute this request.');
  const data = await executeApprovedAction(req, existing, req.body.decisionNote);
  sendData(res, normalize(data));
}));

router.get('/permissions', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, { keys: permissionKeys, bundles: defaultPermissionBundles });
}));

router.get('/users/:id/permissions', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireCompanyUser(req, req.params.id);
  const [overrides, branchAccess] = await Promise.all([
    prisma.userPermissionOverride.findMany({ where: { companyId: req.companyId, userId: req.params.id }, orderBy: { createdAt: 'desc' } }),
    prisma.userBranchAccess.findMany({ where: { companyId: req.companyId, userId: req.params.id }, include: { branch: true }, orderBy: { createdAt: 'desc' } })
  ]);
  sendData(res, normalize({ overrides, branchAccess }));
}));

router.post('/users/:id/permissions', requireRole(...adminRoles), validate(idParam, 'params'), validate(permissionOverrideSchema), asyncHandler(async (req, res) => {
  await requireCompanyUser(req, req.params.id);
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  const data = await prisma.userPermissionOverride.upsert({
    where: { companyId_userId_permissionKey_branchId: { companyId: req.companyId, userId: req.params.id, permissionKey: req.body.permissionKey, branchId: req.body.branchId || null } },
    update: { allowed: req.body.allowed, branchId: req.body.branchId || null },
    create: { companyId: req.companyId, userId: req.params.id, permissionKey: req.body.permissionKey, allowed: req.body.allowed, branchId: req.body.branchId || null }
  });
  await addEnterpriseAudit(req, 'UPSERT_PERMISSION', 'User', req.params.id, { permissionKey: req.body.permissionKey, allowed: req.body.allowed, branchId: req.body.branchId });
  sendData(res, normalize(data), 201);
}));

router.post('/users/:id/branch-access', requireRole(...adminRoles), validate(idParam, 'params'), validate(branchAccessSchema), asyncHandler(async (req, res) => {
  await requireCompanyUser(req, req.params.id);
  await requireBranch(req, req.body.branchId);
  const data = await prisma.userBranchAccess.upsert({
    where: { companyId_userId_branchId: { companyId: req.companyId, userId: req.params.id, branchId: req.body.branchId } },
    update: { permissions: req.body.permissions || [], active: req.body.active !== false },
    create: { companyId: req.companyId, userId: req.params.id, branchId: req.body.branchId, permissions: req.body.permissions || [], active: req.body.active !== false }
  });
  await addEnterpriseAudit(req, 'UPSERT_BRANCH_ACCESS', 'User', req.params.id, { branchId: req.body.branchId, active: req.body.active !== false });
  sendData(res, normalize(data), 201);
}));

async function executeApprovedAction(req, approval, decisionNote) {
  if (approval.status === 'REJECTED') throw new AppError(409, 'Rejected approvals cannot be executed.');
  if (approval.executedAt) throw new AppError(409, 'Approval action has already been executed.');
  let decided = approval;
  if (approval.status === 'PENDING') {
    if (approval.expiresAt && new Date(approval.expiresAt) < new Date()) throw new AppError(409, 'Approval request has expired.');
    decided = await prisma.approvalRequest.update({ where: { id: approval.id }, data: { status: 'APPROVED', approvedById: req.user.id, decisionNote, decidedAt: new Date() } });
  }
  if (decided.status !== 'APPROVED') throw new AppError(409, 'Approval must be approved before execution.');
  const payload = decided.actionPayload || {};
  let result;
  if (decided.actionKey === 'invoice.void') {
    result = await transitionInvoice({ ...req, params: { id: decided.entityId } }, 'VOID', 'voidedAt', 'Invoice voided');
  } else if (decided.actionKey === 'payment.refund') {
    const payment = await prisma.payment.findFirst({ where: { id: decided.entityId, companyId: req.companyId } });
    if (!payment) throw notFound('Payment not found');
    result = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
    await recalcInvoice(prisma, req.companyId, payment.invoiceId);
  } else if (decided.actionKey === 'purchaseOrder.send') {
    await requirePurchaseOrder(req, decided.entityId);
    result = await prisma.purchaseOrder.update({ where: { id: decided.entityId }, data: { status: 'SENT' }, include: purchaseOrderInclude });
  } else if (decided.actionKey === 'stock.adjust') {
    await requireInventoryItem(req, payload.itemId);
    await requireStockLocation(req, payload.locationId);
    result = await prisma.$transaction(async (tx) => applyStockChange(tx, req, {
      itemId: payload.itemId,
      locationId: payload.locationId,
      movementType: payload.movementType,
      quantity: payload.quantity,
      unitCost: payload.unitCost,
      reason: payload.reason,
      onHandDelta: payload.movementType === 'ADJUSTMENT_IN' ? payload.quantity : -payload.quantity,
      reservedDelta: 0
    }));
  } else if (decided.actionKey === 'contract.cancel') {
    result = await setContractStatus({ ...req, params: { id: decided.entityId } }, 'CANCELLED', 'CANCEL');
  } else if (decided.actionKey === 'contract.sla.override') {
    const job = await requireJob(req, decided.entityId, { assignedOnly: false });
    result = await prisma.job.update({ where: { id: job.id }, data: { slaStatus: 'WAIVED', slaWaivedAt: new Date(), slaWaivedById: req.user.id, slaWaiverApprovalId: decided.id }, include: jobDetailInclude });
  } else if (decided.actionKey === 'job.reassign.after_dispatch') {
    await requireWorker(req, payload.workerId);
    const job = await requireJob(req, decided.entityId, { assignedOnly: false });
    result = await prisma.job.update({ where: { id: job.id }, data: { workerId: payload.workerId, status: 'SCHEDULED' } });
  } else {
    throw new AppError(400, 'Unsupported approved action');
  }
  const updated = await prisma.approvalRequest.update({ where: { id: decided.id }, data: { executedAt: new Date(), executionResult: safeAuditMetadata({ actionKey: decided.actionKey, resultId: result && result.id }) }, include: { policy: true, requestedBy: { select: SAFE_USER_SELECT }, approvedBy: { select: SAFE_USER_SELECT } } });
  await addEnterpriseAudit(req, 'EXECUTE_APPROVED_ACTION', decided.entityType, decided.entityId, { approvalRequestId: decided.id, actionKey: decided.actionKey, branchId: decided.branchId });
  return { approval: updated, result };
}

router.get('/dashboard', asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  if (req.query.branchId) await requireBranch(req, String(req.query.branchId));
  const branchWhere = branchFilterFromQuery(req);
  const jobWhere = { companyId, ...branchWhere, ...workerJobScope(req) };
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
    req.user.role === 'WORKER' ? Promise.resolve([]) : prisma.quote.groupBy({ by: ['status'], where: { companyId, deletedAt: null }, _count: true }),
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

router.get('/notification-logs', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.notificationLog, req, { where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.get('/admin/integrations', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, normalize(await listIntegrationConnections(req.companyId)));
}));

router.get('/admin/integrations/message-logs', requireRole(...adminRoles), validate(messageLogQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const where = {
    companyId: req.companyId,
    ...(req.query.channel ? { channel: req.query.channel } : {}),
    ...(req.query.provider ? { provider: req.query.provider } : {}),
    ...(req.query.status ? { status: req.query.status.toUpperCase() } : {})
  };
  const result = await paged(prisma.messageLog, req, { where, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.get('/admin/integrations/storage-usage', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const [usage, objects] = await Promise.all([
    prisma.storageUsageMonthly.findMany({ where: { companyId: req.companyId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
    prisma.storageObject.findMany({ where: { companyId: req.companyId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 25 })
  ]);
  sendData(res, normalize({ usage, objects }));
}));

router.get('/admin/integrations/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await getIntegrationConnection(req.companyId, req.params.id).then((connection) => ({
    id: connection.id,
    companyId: connection.companyId,
    provider: connection.provider,
    channel: connection.channel,
    displayName: connection.displayName,
    status: connection.status,
    configured: (connection.secrets || []).length > 0,
    configuredSecrets: (connection.secrets || []).map((secret) => secret.keyName),
    config: connection.config || {},
    lastTestedAt: connection.lastTestedAt,
    lastTestStatus: connection.lastTestStatus,
    lastTestError: connection.lastTestError,
    lastUsedAt: connection.lastUsedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  }))));
}));

router.post('/admin/integrations', requireRole(...adminRoles), validate(integrationCreateSchema), asyncHandler(async (req, res) => {
  const data = await saveIntegrationConnection({ companyId: req.companyId, userId: req.user.id, ...req.body });
  await audit(req, 'CREATE', 'IntegrationConnection', data.id, { provider: data.provider, channel: data.channel });
  sendData(res, normalize(data), 201);
}));

router.patch('/admin/integrations/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(integrationPatchSchema), asyncHandler(async (req, res) => {
  const data = await updateIntegrationConnection({ companyId: req.companyId, userId: req.user.id, id: req.params.id, ...req.body });
  await audit(req, 'UPDATE', 'IntegrationConnection', data.id, { provider: data.provider, channel: data.channel });
  sendData(res, normalize(data));
}));

router.post('/admin/integrations/:id/test', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await testIntegrationConnection(req.companyId, req.params.id);
  await audit(req, 'TEST', 'IntegrationConnection', data.id, { provider: data.provider, status: data.test.status });
  sendData(res, normalize(data));
}));

router.post('/admin/integrations/:id/disable', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await disableIntegrationConnection(req.companyId, req.params.id);
  await audit(req, 'DISABLE', 'IntegrationConnection', data.id, { provider: data.provider });
  sendData(res, normalize(data));
}));

router.get('/audit-logs', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.auditLog, req, { where: { companyId: req.companyId }, include: { user: { select: SAFE_USER_SELECT } }, orderBy: { createdAt: 'desc' } });
  const data = result.data.map((item) => ({
    id: item.id,
    action: item.action,
    entity: item.entity,
    entityId: item.entityId,
    actor: item.user ? publicUser(item.user) : null,
    message: [item.action, item.entity, item.entityId].filter(Boolean).join(' '),
    createdAt: item.createdAt
  }));
  sendData(res, normalize(data), 200, result.meta);
}));

router.get('/system/status', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, configStatus());
}));

const billingPlanSchema = z.object({ planId: z.string().min(1) });

router.get('/billing/plans', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, await listPlans());
}));

router.get('/billing/subscription', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, normalize(await billingSummary(req.companyId)));
}));

router.get('/billing/usage', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, normalize(await getUsage(req.companyId)));
}));

router.post('/billing/checkout', requireRole(...ownerRoles), validate(billingPlanSchema), asyncHandler(async (req, res) => {
  const data = await createCheckout(req.companyId, req.body.planId, req.user.id);
  await audit(req, 'CHECKOUT_STARTED', 'CompanySubscription', req.companyId, { planId: req.body.planId, provider: data.provider, mode: data.mode });
  sendData(res, normalize(data), 202);
}));

router.post('/billing/change-plan', requireRole(...ownerRoles), validate(billingPlanSchema), asyncHandler(async (req, res) => {
  const data = await changePlan(req.companyId, req.body.planId, req.user.id);
  await audit(req, 'CHANGE_PLAN', 'CompanySubscription', req.companyId, { planId: req.body.planId });
  sendData(res, normalize(data));
}));

router.post('/billing/cancel', requireRole(...ownerRoles), asyncHandler(async (req, res) => {
  const data = await cancelSubscription(req.companyId, req.user.id);
  await audit(req, 'CANCEL_SUBSCRIPTION', 'CompanySubscription', req.companyId);
  sendData(res, normalize(data));
}));

router.get('/reports', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  sendData(res, normalize(await reportData(req.companyId, req.query)));
}));


function dateRangeWhere(query, field = 'createdAt') {
  const where = {};
  if (query.startDate || query.endDate) {
    where[field] = {};
    if (query.startDate) where[field].gte = new Date(String(query.startDate));
    if (query.endDate) where[field].lte = new Date(String(query.endDate));
  }
  return where;
}

async function reportBranchWhere(req) {
  if (req.query.branchId) await requireBranch(req, String(req.query.branchId));
  return { companyId: req.companyId, ...branchFilterFromQuery(req) };
}

router.get('/reports/branch-performance', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = await reportBranchWhere(req);
  const [branches, jobs, invoices, payments] = await Promise.all([
    prisma.branch.findMany({ where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' } }),
    prisma.job.findMany({ where: { ...where, ...dateRangeWhere(req.query) } }),
    prisma.invoice.findMany({ where: { ...where, ...dateRangeWhere(req.query) } }),
    prisma.payment.findMany({ where: { companyId: req.companyId, ...branchFilterFromQuery(req), ...dateRangeWhere(req.query) } })
  ]);
  const byBranch = new Map(branches.map((branch) => [branch.id, { branch, jobs: 0, completedJobs: 0, revenue: 0, payments: 0 }]));
  if (!req.query.branchId) byBranch.set(null, { branch: null, jobs: 0, completedJobs: 0, revenue: 0, payments: 0 });
  for (const job of jobs) { const row = byBranch.get(job.branchId || null) || byBranch.get(null); if (row) { row.jobs += 1; if (job.status === 'COMPLETED') row.completedJobs += 1; } }
  for (const invoice of invoices) { const row = byBranch.get(invoice.branchId || null) || byBranch.get(null); if (row) row.revenue += Number(invoice.total || invoice.amount || 0); }
  for (const payment of payments) { const row = byBranch.get(payment.branchId || null) || byBranch.get(null); if (row) row.payments += Number(payment.amount || 0); }
  sendData(res, normalize(Array.from(byBranch.values()).filter((row) => req.query.branchId ? row.branch && row.branch.id === req.query.branchId : true)));
}));

router.get('/reports/service-profitability', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = await reportBranchWhere(req);
  const [jobs, parts] = await Promise.all([
    prisma.job.findMany({ where: { ...where, ...dateRangeWhere(req.query) }, include: { service: true } }),
    prisma.jobPartUsage.findMany({ where: { companyId: req.companyId }, include: { item: true } })
  ]);
  const partCostByJob = new Map();
  for (const part of parts) partCostByJob.set(part.jobId, (partCostByJob.get(part.jobId) || 0) + Number(part.quantityUsed || 0) * Number(part.unitCost || 0));
  const rows = new Map();
  for (const job of jobs) {
    const key = job.serviceId || 'unassigned';
    const row = rows.get(key) || { serviceId: job.serviceId, serviceName: job.service ? job.service.name : 'Unassigned', jobs: 0, revenue: 0, partsCost: 0, grossProfit: 0 };
    row.jobs += 1; row.revenue += Number(job.total || 0); row.partsCost += partCostByJob.get(job.id) || 0; row.grossProfit = row.revenue - row.partsCost; rows.set(key, row);
  }
  sendData(res, normalize(Array.from(rows.values())));
}));

router.get('/reports/technician-productivity', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = await reportBranchWhere(req);
  const jobs = await prisma.job.findMany({ where: { ...where, ...dateRangeWhere(req.query) }, include: { worker: { include: SAFE_WORKER_INCLUDE } } });
  const rows = new Map();
  for (const job of jobs) {
    const key = job.workerId || 'unassigned';
    const row = rows.get(key) || { workerId: job.workerId, workerName: job.worker && job.worker.user ? job.worker.user.name : 'Unassigned', jobs: 0, completedJobs: 0, revenue: 0 };
    row.jobs += 1; if (job.status === 'COMPLETED') row.completedJobs += 1; row.revenue += Number(job.total || 0); rows.set(key, row);
  }
  sendData(res, normalize(Array.from(rows.values())));
}));

router.get('/reports/sla-performance', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = await reportBranchWhere(req);
  const jobs = await prisma.job.findMany({ where: { ...where, ...dateRangeWhere(req.query) } });
  const rows = Object.fromEntries(slaStatusValues.map((status) => [status, 0]));
  for (const job of jobs) rows[job.slaStatus || 'NOT_APPLICABLE'] = (rows[job.slaStatus || 'NOT_APPLICABLE'] || 0) + 1;
  sendData(res, { total: jobs.length, byStatus: rows, breached: rows.BREACHED || 0, waived: rows.WAIVED || 0 });
}));

router.get('/reports/contract-profitability', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = await reportBranchWhere(req);
  const contracts = await prisma.serviceContract.findMany({ where: { companyId: req.companyId, ...branchFilterFromQuery(req) }, include: contractInclude });
  const jobs = await prisma.job.findMany({ where: { ...where, contractId: { not: null }, ...dateRangeWhere(req.query) }, include: { contract: true } });
  const parts = await prisma.jobPartUsage.findMany({ where: { companyId: req.companyId, jobId: { in: jobs.map((job) => job.id) } } });
  const partsCostByJob = new Map();
  for (const part of parts) partsCostByJob.set(part.jobId, (partsCostByJob.get(part.jobId) || 0) + Number(part.quantityUsed || 0) * Number(part.unitCost || 0));
  const rows = contracts.map((contract) => {
    const contractJobs = jobs.filter((job) => job.contractId === contract.id);
    const jobsDelivered = contractJobs.filter((job) => job.status === 'COMPLETED').length;
    const revenue = contractJobs.reduce((sum, job) => sum + (['BILLABLE', 'OVERAGE'].includes(job.contractBillingStatus) ? Number(job.total || 0) : 0), Number(contract.contractMonthlyValue || contract.contractValue || 0));
    const partsCost = contractJobs.reduce((sum, job) => sum + (partsCostByJob.get(job.id) || 0), 0);
    const breachCount = contractJobs.filter((job) => job.slaStatus === 'BREACHED').length;
    const overdueServiceCount = contract.serviceLines ? contract.serviceLines.filter((line) => line.nextDueAt && new Date(line.nextDueAt) < new Date()).length : 0;
    return { contractId: contract.id, contractNumber: contract.contractNumber, name: contract.name, customerId: contract.customerId, monthlyValue: Number(contract.contractMonthlyValue || 0), jobsDelivered, jobCount: contractJobs.length, includedJobs: contractJobs.filter((job) => job.contractBillingStatus === 'INCLUDED').length, billableJobs: contractJobs.filter((job) => ['BILLABLE', 'OVERAGE'].includes(job.contractBillingStatus)).length, partsCost, revenue, grossMarginEstimate: revenue - partsCost, overdueServiceCount, slaBreachCount: breachCount };
  });
  sendData(res, normalize({ rows, totalRevenue: rows.reduce((sum, row) => sum + row.revenue, 0), totalPartsCost: rows.reduce((sum, row) => sum + row.partsCost, 0), totalGrossMarginEstimate: rows.reduce((sum, row) => sum + row.grossMarginEstimate, 0) }));
}));

router.get('/reports/inventory-value', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const locationWhere = { companyId: req.companyId, ...branchFilterFromQuery(req) };
  if (req.query.branchId) await requireBranch(req, String(req.query.branchId));
  const locations = await prisma.stockLocation.findMany({ where: locationWhere });
  const stocks = await prisma.inventoryStock.findMany({ where: { companyId: req.companyId, locationId: { in: locations.map((loc) => loc.id) } }, include: { item: true, location: true } });
  const rows = stocks.map((stock) => ({ itemId: stock.itemId, itemName: stock.item && stock.item.name, locationId: stock.locationId, locationName: stock.location && stock.location.name, quantityOnHand: Number(stock.quantityOnHand || 0), unitCost: Number(stock.item && stock.item.unitCost || 0), value: Number(stock.quantityOnHand || 0) * Number(stock.item && stock.item.unitCost || 0) }));
  sendData(res, normalize({ totalValue: rows.reduce((sum, row) => sum + row.value, 0), rows }));
}));

router.get('/reports/purchase-spend', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId, ...branchFilterFromQuery(req), ...dateRangeWhere(req.query) };
  if (req.query.branchId) await requireBranch(req, String(req.query.branchId));
  const orders = await prisma.purchaseOrder.findMany({ where, include: { supplier: true, lines: { include: { item: true } } } });
  const rows = orders.map((order) => ({ id: order.id, orderNumber: order.orderNumber, supplierName: order.supplier && order.supplier.name, status: order.status, total: (order.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0) }));
  sendData(res, normalize({ totalSpend: rows.reduce((sum, row) => sum + row.total, 0), rows }));
}));

router.get('/reports/accounts-receivable-aging', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId, ...branchFilterFromQuery(req), status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } };
  if (req.query.branchId) await requireBranch(req, String(req.query.branchId));
  const invoices = await prisma.invoice.findMany({ where, include: { customer: true } });
  const now = Date.now();
  const buckets = { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, over90: 0 };
  const rows = invoices.map((invoice) => {
    const due = invoice.dueDate ? new Date(invoice.dueDate).getTime() : new Date(invoice.createdAt).getTime();
    const age = Math.max(0, Math.floor((now - due) / 86400000));
    const amount = Number(invoice.balanceDue || invoice.total || invoice.amount || 0);
    const bucket = age <= 0 ? 'current' : age <= 30 ? 'days1To30' : age <= 60 ? 'days31To60' : age <= 90 ? 'days61To90' : 'over90';
    buckets[bucket] += amount;
    return { id: invoice.id, number: invoice.number, customerName: invoice.customer && invoice.customer.name, ageDays: age, balanceDue: amount, bucket };
  });
  sendData(res, normalize({ buckets, rows }));
}));


async function analyticsBranchScope(req) {
  const branchId = req.query && req.query.branchId ? String(req.query.branchId).trim() : '';
  const accessRecords = req.user.role === 'OWNER' ? [] : await prisma.userBranchAccess.findMany({ where: { companyId: req.companyId, userId: req.user.id, active: true } });
  const scopedBranchIds = accessRecords.map((record) => record.branchId);
  if (branchId) {
    await requireBranch(req, branchId);
    if (scopedBranchIds.length && !scopedBranchIds.includes(branchId)) throw new AppError(403, 'Branch report access denied.');
    await requirePermission(req, 'report.enterprise.view', { branchId });
    return [branchId];
  }
  await requirePermission(req, 'report.enterprise.view');
  return scopedBranchIds.length ? scopedBranchIds : null;
}

async function analyticsPayload(req) {
  const branchIds = await analyticsBranchScope(req);
  return buildExecutiveAnalytics(req.companyId, req.query, { branchIds });
}

router.get('/reports/export', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const section = String(req.query.section || 'revenue');
  if (!['revenue', 'invoices', 'jobs'].includes(section)) throw new AppError(400, 'Unsupported report export section.');
  const data = await reportData(req.companyId, req.query);
  await audit(req, 'EXPORT', 'Report', section, { section, startDate: data.filters.startDate, endDate: data.filters.endDate });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fieldcore-${section}-report.csv"`);
  return res.status(200).send(reportCsv(section, data));
}));


router.get('/analytics/executive', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const data = await analyticsPayload(req);
  sendData(res, normalize({ filters: data.filters, definitions: data.definitions, overview: data.overview, accountsReceivable: data.accountsReceivable, generatedAt: data.generatedAt }));
}));

router.get('/analytics/branches', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const data = await analyticsPayload(req);
  sendData(res, normalize({ filters: data.filters, branchPerformance: data.branchPerformance, generatedAt: data.generatedAt }));
}));

router.get('/analytics/technicians', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const data = await analyticsPayload(req);
  sendData(res, normalize({ filters: data.filters, technicianProductivity: data.technicianProductivity, generatedAt: data.generatedAt }));
}));

router.get('/analytics/quote-to-cash', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const data = await analyticsPayload(req);
  sendData(res, normalize({ filters: data.filters, quoteToCash: data.quoteToCash, generatedAt: data.generatedAt }));
}));

router.get('/analytics/contracts-sla', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const data = await analyticsPayload(req);
  sendData(res, normalize({ filters: data.filters, contractsSla: data.contractsSla, generatedAt: data.generatedAt }));
}));

router.get('/analytics/inventory-procurement', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const data = await analyticsPayload(req);
  sendData(res, normalize({ filters: data.filters, inventoryProcurement: data.inventoryProcurement, generatedAt: data.generatedAt }));
}));

router.get('/analytics/export.csv', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const section = String(req.query.section || 'executive');
  if (!['executive', 'branches', 'technicians', 'quote-to-cash', 'inventory'].includes(section)) throw new AppError(400, 'Unsupported analytics export section.');
  const data = await analyticsPayload(req);
  await audit(req, 'EXPORT', 'EnterpriseAnalytics', section, { section, startDate: data.filters.startDate, endDate: data.filters.endDate, branchId: data.filters.branchId });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fieldcore-${section}-analytics.csv"`);
  return res.status(200).send(analyticsCsv(section, data));
}));

router.post('/analytics/report-schedules', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  await requirePermission(req, 'report.enterprise.view');
  const schedule = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    companyId: req.companyId,
    reportKey: String(req.body.reportKey || 'executive'),
    cadence: String(req.body.cadence || 'WEEKLY').toUpperCase(),
    recipients: Array.isArray(req.body.recipients) ? req.body.recipients.filter(Boolean).map(String) : [],
    filters: req.body.filters && typeof req.body.filters === 'object' ? req.body.filters : {},
    active: req.body.active !== false,
    deliveryStatus: 'CONFIGURED_NOT_SENT',
    createdAt: new Date().toISOString()
  };
  if (!['executive', 'branches', 'technicians', 'quote-to-cash', 'contracts-sla', 'inventory-procurement'].includes(schedule.reportKey)) throw new AppError(400, 'Unsupported scheduled report.');
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(schedule.cadence)) throw new AppError(400, 'Unsupported report cadence.');
  await audit(req, 'CREATE', 'ReportSchedule', schedule.id, { reportKey: schedule.reportKey, cadence: schedule.cadence, recipients: schedule.recipients.length, filters: schedule.filters });
  sendData(res, normalize(schedule), 201);
}));

const customerSchema = z.object({
  branchId: z.string().min(1).optional(),
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')).transform((v) => v || undefined),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional()
});

router.get('/customers', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  if (req.query.branchId) await requireBranch(req, String(req.query.branchId));
  const result = await paged(prisma.customer, req, { where: { companyId: req.companyId, ...branchFilterFromQuery(req) }, orderBy: { createdAt: 'desc' }, include: { jobs: true, invoices: true } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/customers', requireRole(...adminRoles), validate(customerSchema), asyncHandler(async (req, res) => {
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  const data = await prisma.customer.create({ data: { ...req.body, companyId: req.companyId } });
  await audit(req, 'CREATE', 'Customer', data.id);
  sendData(res, normalize(data), 201);
}));

router.get('/customers/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await requireCustomer(req, req.params.id)));
}));

router.patch('/customers/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(customerSchema.partial()), asyncHandler(async (req, res) => {
  await requireCustomer(req, req.params.id);
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
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

const assetSchema = z.object({
  branchId: z.string().min(1).optional(),
  customerId: z.string().min(1),
  propertyId: optionalText(80),
  serviceId: optionalText(80),
  name: z.string().trim().min(2).max(200),
  assetType: z.string().trim().min(2).max(120),
  assetTag: optionalText(120),
  serialNumber: optionalText(120),
  manufacturer: optionalText(120),
  modelNumber: optionalText(120),
  locationLabel: optionalText(200),
  installedAt: optionalDate,
  warrantyStartAt: optionalDate,
  warrantyEndAt: optionalDate,
  warrantyProvider: optionalText(200),
  warrantyNotes: optionalText(2000),
  lastServicedAt: optionalDate,
  nextServiceDueAt: optionalDate,
  complianceStatus: optionalText(120),
  status: z.enum(assetStatusValues).optional(),
  notes: optionalText(2000),
  customFields: z.record(z.any()).optional()
});

const contractSchema = z.object({
  branchId: z.string().min(1).optional(),
  customerId: z.string().min(1),
  propertyId: optionalText(80),
  contractNumber: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(200),
  status: z.enum(serviceContractStatusValues).optional(),
  startDate: z.coerce.date(),
  endDate: optionalDate,
  currency: z.string().trim().min(3).max(3).optional(),
  contractValue: amount.optional(),
  contractMonthlyValue: amount.optional(),
  overageBillingRate: amount.optional(),
  billingInterval: z.enum(billingIntervalValues).optional(),
  responseSlaHours: z.coerce.number().int().positive().max(8760).optional(),
  completionSlaHours: z.coerce.number().int().positive().max(8760).optional(),
  includedVisits: z.coerce.number().int().min(0).optional(),
  excludedServices: z.array(z.string().trim().min(1).max(120)).optional(),
  renewalDate: optionalDate,
  cancellationNoticeDays: z.coerce.number().int().min(0).max(365).optional(),
  autoGenerateJobs: z.boolean().optional(),
  reviewBeforeDispatch: z.boolean().optional(),
  serviceWindowStart: optionalText(20),
  serviceWindowEnd: optionalText(20),
  blackoutDates: z.array(z.string().trim().min(4).max(20)).optional(),
  notes: optionalText(2000)
});

const contractAssetSchema = z.object({ assetId: z.string().min(1) });
const contractServiceLineParam = z.object({ id: z.string().min(1), lineId: z.string().min(1) });
const contractAssetParam = z.object({ id: z.string().min(1), assetId: z.string().min(1) });
const jobAssetParam = z.object({ id: z.string().min(1), assetId: z.string().min(1) });
const jobAssetSchema = z.object({ assetId: z.string().min(1), primaryAsset: z.boolean().optional(), notes: optionalText(1000) });
const contractLineSchema = z.object({
  serviceId: optionalText(80),
  title: z.string().trim().min(2).max(200),
  frequency: z.enum(recurrenceValues),
  interval: z.coerce.number().int().positive().max(120).optional(),
  visitsPerPeriod: z.coerce.number().int().positive().max(365).optional(),
  nextDueAt: optionalDate,
  defaultDurationMinutes: z.coerce.number().int().positive().max(1440).optional(),
  requiresProofPhotos: z.boolean().optional(),
  requiresSignature: z.boolean().optional(),
  requiresLocation: z.boolean().optional(),
  notes: optionalText(2000),
  autoGenerate: z.boolean().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  serviceWindowStart: optionalText(20),
  serviceWindowEnd: optionalText(20),
  blackoutDates: z.array(z.string().trim().min(4).max(20)).optional(),
  preferredWorkerId: optionalText(80),
  preferredBranchId: optionalText(80),
  generatedJobStatus: z.enum(jobStatusValues).optional()
});
const dueWorkSchema = z.object({ through: optionalDate, limit: z.coerce.number().int().min(1).max(100).optional() });
const preventiveGenerateSchema = z.object({ through: optionalDate, limit: z.coerce.number().int().min(1).max(100).optional(), reviewBeforeDispatch: z.boolean().optional() });
const assetIncidentSchema = z.object({ jobId: optionalText(80), title: z.string().trim().min(2).max(200), description: optionalText(2000), severity: z.enum(assetIncidentSeverityValues).optional(), status: z.enum(assetIncidentStatusValues).optional(), occurredAt: optionalDate, technicianNotes: optionalText(2000) });
const assetComplianceDocumentSchema = z.object({ jobId: optionalText(80), documentType: z.enum(complianceDocumentTypeValues).optional(), title: z.string().trim().min(2).max(200), url: z.string().trim().min(1).max(2000), filename: optionalText(240), mimeType: optionalText(120), notes: optionalText(2000), capturedAt: optionalDate });
const contractEntitlementSchema = z.object({ jobId: optionalText(80), serviceId: optionalText(80), contractLineId: optionalText(80), warrantyRelated: z.boolean().optional() });
const slaEvaluateSchema = z.object({ now: optionalDate, atRiskHours: z.coerce.number().int().min(1).max(720).optional() });
const slaWaiveSchema = z.object({ reason: z.string().trim().min(2).max(1000) });
const warrantyFlagSchema = z.object({ warrantyRelated: z.boolean().default(true), warrantyBillingOverride: z.boolean().optional(), reason: optionalText(1000) });

async function validateAssetRelations(req, body) {
  await requireCustomer(req, body.customerId);
  if (body.propertyId) await requireCustomerProperty(req, body.propertyId, body.customerId);
  if (body.serviceId) await requireService(req, body.serviceId);
}

async function validateContractRelations(req, body) {
  await requireCustomer(req, body.customerId);
  if (body.propertyId) await requireCustomerProperty(req, body.propertyId, body.customerId);
}

async function validateContractLineRelations(req, body) {
  if (body.serviceId) await requireService(req, body.serviceId);
  if (body.preferredWorkerId) await requireWorker(req, body.preferredWorkerId);
  if (body.preferredBranchId) await requireBranch(req, body.preferredBranchId);
}

function addHours(date, hours) {
  return hours ? new Date(new Date(date).getTime() + hours * 60 * 60 * 1000) : null;
}

function advanceDueDate(date, frequency, interval = 1) {
  const next = new Date(date);
  if (frequency === 'DAILY') next.setDate(next.getDate() + interval);
  else if (frequency === 'WEEKLY') next.setDate(next.getDate() + 7 * interval);
  else if (frequency === 'BIWEEKLY') next.setDate(next.getDate() + 14 * interval);
  else if (frequency === 'MONTHLY') next.setMonth(next.getMonth() + interval);
  else if (frequency === 'QUARTERLY') next.setMonth(next.getMonth() + 3 * interval);
  else if (frequency === 'YEARLY') next.setFullYear(next.getFullYear() + interval);
  return next;
}

function warrantyStatus(asset) {
  const today = new Date();
  if (asset.warrantyEndAt && new Date(asset.warrantyEndAt) < today) return 'EXPIRED';
  if (asset.warrantyStartAt && new Date(asset.warrantyStartAt) > today) return 'PENDING';
  if (asset.warrantyEndAt) return 'ACTIVE';
  return 'UNKNOWN';
}

function assetResponse(asset) {
  return asset && { ...asset, warrantyStatus: warrantyStatus(asset), history: (asset.jobAssets || []).map((item) => item.job).filter(Boolean) };
}

function contractDueItems(contract, through = new Date(), limit = 50) {
  const until = new Date(through);
  return (contract.serviceLines || [])
    .filter((line) => line.nextDueAt && new Date(line.nextDueAt) <= until)
    .slice(0, limit)
    .map((line) => ({
      contractId: contract.id,
      lineId: line.id,
      title: line.title,
      service: line.service || null,
      nextDueAt: line.nextDueAt,
      defaultDurationMinutes: line.defaultDurationMinutes,
      requiresProofPhotos: line.requiresProofPhotos,
      requiresSignature: line.requiresSignature,
      requiresLocation: line.requiresLocation
    }));
}


function contractPeriod(date = new Date(), interval = 'MONTHLY') {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  if (interval === 'ANNUAL') start.setMonth(0, 1);
  else if (interval === 'QUARTERLY') start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  else if (interval === 'SEMIANNUAL') start.setMonth(start.getMonth() < 6 ? 0 : 6, 1);
  else start.setDate(1);
  const end = new Date(start);
  if (interval === 'ANNUAL') end.setFullYear(end.getFullYear() + 1);
  else if (interval === 'QUARTERLY') end.setMonth(end.getMonth() + 3);
  else if (interval === 'SEMIANNUAL') end.setMonth(end.getMonth() + 6);
  else end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function parseBlackoutDates(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
  }
  return [];
}

function isBlackoutDate(date, ...blackoutSources) {
  const key = new Date(date).toISOString().slice(0, 10);
  return blackoutSources.flatMap(parseBlackoutDates).includes(key);
}

async function assessContractEntitlement(req, options = {}) {
  const contract = options.contract || (options.contractId ? await requireServiceContract(req, options.contractId) : null);
  if (!contract) return { billingStatus: 'UNKNOWN', billable: true, reason: 'No contract selected.' };
  if (contract.status !== 'ACTIVE') return { billingStatus: 'BILLABLE', billable: true, reason: 'Contract is not active.' };
  if (options.warrantyRelated) return { billingStatus: 'WARRANTY', billable: false, reason: 'Warranty-related work is protected from accidental billing.' };

  let line = options.line || null;
  if (!line && options.contractLineId) line = await requireContractServiceLine(req, contract.id, options.contractLineId);
  if (!line && options.serviceId) line = await prisma.contractServiceLine.findFirst({ where: { companyId: req.companyId, contractId: contract.id, serviceId: options.serviceId } });

  const excluded = Array.isArray(contract.excludedServices) ? contract.excludedServices : [];
  if (options.serviceId && excluded.includes(options.serviceId)) return { billingStatus: 'BILLABLE', billable: true, reason: 'Service is excluded from this contract.', contractLineId: line && line.id };
  if (!line) return { billingStatus: 'BILLABLE', billable: true, reason: 'No covered service line matched this job.' };

  const visitsAllowed = Number(line.visitsPerPeriod || contract.includedVisits || 0);
  if (!visitsAllowed) return { billingStatus: 'INCLUDED', billable: false, reason: 'Covered service line has no visit cap.', contractLineId: line.id };
  const period = contractPeriod(new Date(), contract.billingInterval || 'MONTHLY');
  const used = await prisma.contractVisitUsage.count({ where: { companyId: req.companyId, contractId: contract.id, contractLineId: line.id, countedVisit: true, billingStatus: 'INCLUDED', periodStart: { gte: period.start, lt: period.end } } });
  if (used < visitsAllowed) return { billingStatus: 'INCLUDED', billable: false, reason: `${used + 1}/${visitsAllowed} included visit(s) for this period.`, contractLineId: line.id, used, visitsAllowed, periodStart: period.start, periodEnd: period.end };
  return { billingStatus: 'OVERAGE', billable: true, reason: `Included visits exhausted (${used}/${visitsAllowed}).`, contractLineId: line.id, used, visitsAllowed, periodStart: period.start, periodEnd: period.end };
}

async function recordContractVisit(tx, req, job, entitlement) {
  if (!job.contractId || !entitlement || !entitlement.contractLineId) return null;
  const period = contractPeriod(new Date(), job.contract && job.contract.billingInterval || 'MONTHLY');
  return tx.contractVisitUsage.upsert({
    where: { companyId_contractId_jobId: { companyId: req.companyId, contractId: job.contractId, jobId: job.id } },
    update: { contractLineId: entitlement.contractLineId, billingStatus: entitlement.billingStatus, countedVisit: entitlement.billingStatus === 'INCLUDED' },
    create: { companyId: req.companyId, contractId: job.contractId, contractLineId: entitlement.contractLineId, jobId: job.id, periodStart: period.start, periodEnd: period.end, billingStatus: entitlement.billingStatus, countedVisit: entitlement.billingStatus === 'INCLUDED' }
  }).catch(() => null);
}

function calculateSlaStatus(job, now = new Date(), atRiskHours = 4) {
  if (job.slaStatus === 'WAIVED') return 'WAIVED';
  if (job.status === 'COMPLETED') return 'MET';
  const due = job.completionDueAt || job.responseDueAt;
  if (!due) return 'NOT_APPLICABLE';
  const dueAt = new Date(due).getTime();
  const current = new Date(now).getTime();
  if (current > dueAt) return 'BREACHED';
  if ((dueAt - current) <= atRiskHours * 60 * 60 * 1000) return 'AT_RISK';
  return 'ON_TRACK';
}

async function updateAssetServiceDates(tx, req, job) {
  const links = await tx.jobAsset.findMany({ where: { companyId: req.companyId, jobId: job.id } });
  const servedAt = job.completedAt || job.scheduledStart || new Date();
  for (const link of links) {
    await tx.asset.update({ where: { id: link.assetId }, data: { lastServicedAt: servedAt } }).catch(() => null);
  }
}

router.get('/assets', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId };
  if (req.query.customerId) where.customerId = String(req.query.customerId);
  if (req.query.status) where.status = String(req.query.status);
  const result = await paged(prisma.asset, req, { where, include: assetInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data.map(assetResponse)), 200, result.meta);
}));

router.post('/assets', requireRole(...adminRoles), validate(assetSchema), asyncHandler(async (req, res) => {
  await validateAssetRelations(req, req.body);
  const data = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({ data: { ...req.body, status: req.body.status || 'ACTIVE', companyId: req.companyId }, include: assetInclude });
    await addAuditLog(tx, req, 'CREATE', 'Asset', asset.id, { customerId: asset.customerId, assetType: asset.assetType });
    return asset;
  });
  sendData(res, normalize(assetResponse(data)), 201);
}));

router.get('/assets/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireAsset(req, req.params.id);
  const data = await prisma.asset.findUnique({ where: { id: req.params.id }, include: assetInclude });
  sendData(res, normalize(assetResponse(data)));
}));

router.patch('/assets/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(assetSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await requireAsset(req, req.params.id);
  const body = { ...req.body, customerId: req.body.customerId || existing.customerId };
  await validateAssetRelations(req, body);
  const data = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.update({ where: { id: existing.id }, data: req.body, include: assetInclude });
    await addAuditLog(tx, req, 'UPDATE', 'Asset', asset.id, { status: asset.status });
    return asset;
  });
  sendData(res, normalize(assetResponse(data)));
}));

router.post('/assets/:id/retire', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const existing = await requireAsset(req, req.params.id);
  const data = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.update({ where: { id: existing.id }, data: { status: 'RETIRED' }, include: assetInclude });
    await addAuditLog(tx, req, 'RETIRE', 'Asset', asset.id, { fromStatus: existing.status });
    return asset;
  });
  sendData(res, normalize(assetResponse(data)));
}));

router.delete('/assets/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const existing = await requireAsset(req, req.params.id);
  const data = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.update({ where: { id: existing.id }, data: { status: 'RETIRED' }, include: assetInclude });
    await addAuditLog(tx, req, 'RETIRE', 'Asset', asset.id, { fromStatus: existing.status, via: 'DELETE' });
    return asset;
  });
  sendData(res, normalize(assetResponse(data)));
}));

router.get('/assets/:id/history', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: assetInclude });
  if (!asset) throw notFound('Asset not found');
  const history = (asset.jobAssets || []).map((item) => item.job).filter(Boolean);
  const [incidents, complianceDocuments, parts] = await Promise.all([
    prisma.assetIncident.findMany({ where: { companyId: req.companyId, assetId: asset.id }, orderBy: { createdAt: 'desc' } }),
    prisma.assetComplianceDocument.findMany({ where: { companyId: req.companyId, assetId: asset.id }, orderBy: { createdAt: 'desc' } }),
    prisma.jobPartUsage.findMany({ where: { companyId: req.companyId, jobId: { in: history.map((job) => job.id) } }, include: { item: true }, orderBy: { createdAt: 'desc' } })
  ]);
  sendData(res, normalize({
    asset: assetResponse(asset),
    jobs: history,
    proofPhotos: history.flatMap((job) => job.proofPhotos || []),
    invoices: history.flatMap((job) => job.invoices || []),
    incidents,
    complianceDocuments,
    partsUsed: parts,
    serviceSummary: {
      lastServicedAt: asset.lastServicedAt || (history[0] && (history[0].completedAt || history[0].scheduledStart)),
      nextServiceDueAt: asset.nextServiceDueAt,
      openIncidentCount: incidents.filter((item) => item.status === 'OPEN').length,
      complianceDocumentCount: complianceDocuments.length
    }
  }));
}));

router.post('/assets/:id/incidents', requireRole(...adminRoles), validate(idParam, 'params'), validate(assetIncidentSchema), asyncHandler(async (req, res) => {
  const asset = await requireAsset(req, req.params.id);
  if (req.body.jobId) await requireJob(req, req.body.jobId, { assignedOnly: false });
  const data = await prisma.$transaction(async (tx) => {
    const incident = await tx.assetIncident.create({ data: { ...req.body, companyId: req.companyId, assetId: asset.id, severity: req.body.severity || 'MEDIUM', status: req.body.status || 'OPEN', createdById: req.user.id } });
    await addAuditLog(tx, req, 'CREATE', 'AssetIncident', incident.id, { assetId: asset.id, severity: incident.severity, status: incident.status });
    return incident;
  });
  sendData(res, normalize(data), 201);
}));

router.post('/assets/:id/compliance-documents', requireRole(...adminRoles), validate(idParam, 'params'), validate(assetComplianceDocumentSchema), asyncHandler(async (req, res) => {
  const asset = await requireAsset(req, req.params.id);
  if (req.body.jobId) await requireJob(req, req.body.jobId, { assignedOnly: false });
  const data = await prisma.$transaction(async (tx) => {
    const document = await tx.assetComplianceDocument.create({ data: { ...req.body, companyId: req.companyId, assetId: asset.id, documentType: req.body.documentType || 'DOCUMENT', createdById: req.user.id } });
    await addAuditLog(tx, req, 'CREATE', 'AssetComplianceDocument', document.id, { assetId: asset.id, documentType: document.documentType });
    return document;
  });
  sendData(res, normalize(data), 201);
}));

router.get('/service-contracts', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId };
  if (req.query.customerId) where.customerId = String(req.query.customerId);
  if (req.query.status) where.status = String(req.query.status);
  const result = await paged(prisma.serviceContract, req, { where, include: contractInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data.map((contract) => ({ ...contract, upcomingDueWork: contractDueItems(contract, req.query.through || new Date()) }))), 200, result.meta);
}));

router.post('/service-contracts', requireRole(...adminRoles), validate(contractSchema), asyncHandler(async (req, res) => {
  await validateContractRelations(req, req.body);
  const data = await prisma.$transaction(async (tx) => {
    const contract = await tx.serviceContract.create({ data: { ...req.body, status: req.body.status || 'DRAFT', currency: req.body.currency || 'USD', companyId: req.companyId }, include: contractInclude });
    await addAuditLog(tx, req, 'CREATE', 'ServiceContract', contract.id, { customerId: contract.customerId, contractNumber: contract.contractNumber });
    return contract;
  });
  sendData(res, normalize(data), 201);
}));

router.get('/service-contracts/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireServiceContract(req, req.params.id);
  const data = await prisma.serviceContract.findUnique({ where: { id: req.params.id }, include: contractInclude });
  sendData(res, normalize({ ...data, upcomingDueWork: contractDueItems(data, req.query.through || new Date()) }));
}));

router.patch('/service-contracts/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(contractSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await requireServiceContract(req, req.params.id);
  const body = { ...req.body, customerId: req.body.customerId || existing.customerId };
  await validateContractRelations(req, body);
  const data = await prisma.$transaction(async (tx) => {
    const contract = await tx.serviceContract.update({ where: { id: existing.id }, data: req.body, include: contractInclude });
    await addAuditLog(tx, req, 'UPDATE', 'ServiceContract', contract.id, { status: contract.status });
    return contract;
  });
  sendData(res, normalize(data));
}));

async function setContractStatus(req, status, action) {
  const existing = await requireServiceContract(req, req.params.id);
  const data = await prisma.$transaction(async (tx) => {
    const contract = await tx.serviceContract.update({ where: { id: existing.id }, data: { status }, include: contractInclude });
    await addAuditLog(tx, req, action, 'ServiceContract', contract.id, { fromStatus: existing.status, toStatus: status });
    return contract;
  });
  return data;
}

router.post('/service-contracts/:id/activate', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await setContractStatus(req, 'ACTIVE', 'ACTIVATE')));
}));

router.post('/service-contracts/:id/suspend', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  sendData(res, normalize(await setContractStatus(req, 'SUSPENDED', 'SUSPEND')));
}));

router.post('/service-contracts/:id/cancel', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const contract = await requireServiceContract(req, req.params.id);
  const approval = await requireApprovalOrProceed(req, { eventType: 'CONTRACT_CANCEL', actionKey: 'contract.cancel', entityType: 'ServiceContract', entityId: contract.id, branchId: contract.branchId, reason: req.body && req.body.reason });
  if (approval) return sendData(res, approvalRequiredPayload(approval), 202);
  sendData(res, normalize(await setContractStatus(req, 'CANCELLED', 'CANCEL')));
}));

router.get('/service-contracts/:id/assets', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const contract = await requireServiceContract(req, req.params.id);
  const data = await prisma.serviceContractAsset.findMany({ where: { companyId: req.companyId, contractId: contract.id }, include: { asset: true }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
}));

router.post('/service-contracts/:id/assets', requireRole(...adminRoles), validate(idParam, 'params'), validate(contractAssetSchema), asyncHandler(async (req, res) => {
  const contract = await requireServiceContract(req, req.params.id);
  const asset = await requireAsset(req, req.body.assetId);
  if (asset.customerId !== contract.customerId) throw new AppError(409, 'Asset must belong to the contract customer');
  const data = await prisma.$transaction(async (tx) => {
    const link = await tx.serviceContractAsset.upsert({ where: { companyId_contractId_assetId: { companyId: req.companyId, contractId: contract.id, assetId: asset.id } }, update: {}, create: { companyId: req.companyId, contractId: contract.id, assetId: asset.id }, include: { asset: true } });
    await addAuditLog(tx, req, 'LINK_ASSET', 'ServiceContract', contract.id, { assetId: asset.id });
    return link;
  });
  sendData(res, normalize(data), 201);
}));

router.delete('/service-contracts/:id/assets/:assetId', requireRole(...adminRoles), validate(contractAssetParam, 'params'), asyncHandler(async (req, res) => {
  const contract = await requireServiceContract(req, req.params.id);
  const asset = await requireAsset(req, req.params.assetId);
  await prisma.$transaction(async (tx) => {
    await tx.serviceContractAsset.deleteMany({ where: { companyId: req.companyId, contractId: contract.id, assetId: asset.id } });
    await addAuditLog(tx, req, 'UNLINK_ASSET', 'ServiceContract', contract.id, { assetId: asset.id });
  });
  sendData(res, { deleted: true });
}));

router.get('/service-contracts/:id/service-lines', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const contract = await requireServiceContract(req, req.params.id);
  const data = await prisma.contractServiceLine.findMany({ where: { companyId: req.companyId, contractId: contract.id }, include: { service: true }, orderBy: { nextDueAt: 'asc' } });
  sendData(res, normalize(data));
}));

router.post('/service-contracts/:id/service-lines', requireRole(...adminRoles), validate(idParam, 'params'), validate(contractLineSchema), asyncHandler(async (req, res) => {
  const contract = await requireServiceContract(req, req.params.id);
  await validateContractLineRelations(req, req.body);
  const data = await prisma.$transaction(async (tx) => {
    const line = await tx.contractServiceLine.create({ data: { ...req.body, interval: req.body.interval || 1, companyId: req.companyId, contractId: contract.id }, include: { service: true } });
    await addAuditLog(tx, req, 'CREATE', 'ContractServiceLine', line.id, { contractId: contract.id });
    return line;
  });
  sendData(res, normalize(data), 201);
}));

router.patch('/service-contracts/:id/service-lines/:lineId', requireRole(...adminRoles), validate(contractServiceLineParam, 'params'), validate(contractLineSchema.partial()), asyncHandler(async (req, res) => {
  const contract = await requireServiceContract(req, req.params.id);
  const line = await requireContractServiceLine(req, contract.id, req.params.lineId);
  await validateContractLineRelations(req, req.body);
  const data = await prisma.$transaction(async (tx) => {
    const updated = await tx.contractServiceLine.update({ where: { id: line.id }, data: req.body, include: { service: true } });
    await addAuditLog(tx, req, 'UPDATE', 'ContractServiceLine', updated.id, { contractId: contract.id });
    return updated;
  });
  sendData(res, normalize(data));
}));

router.delete('/service-contracts/:id/service-lines/:lineId', requireRole(...adminRoles), validate(contractServiceLineParam, 'params'), asyncHandler(async (req, res) => {
  const contract = await requireServiceContract(req, req.params.id);
  const line = await requireContractServiceLine(req, contract.id, req.params.lineId);
  await prisma.$transaction(async (tx) => {
    await tx.contractServiceLine.delete({ where: { id: line.id } });
    await addAuditLog(tx, req, 'DELETE', 'ContractServiceLine', line.id, { contractId: contract.id });
  });
  sendData(res, { deleted: true });
}));

router.post('/service-contracts/:id/preview-jobs', requireRole(...adminRoles), validate(idParam, 'params'), validate(dueWorkSchema), asyncHandler(async (req, res) => {
  await requireServiceContract(req, req.params.id);
  const contract = await prisma.serviceContract.findUnique({ where: { id: req.params.id }, include: contractInclude });
  sendData(res, normalize({ contractId: contract.id, dueWork: contractDueItems(contract, req.body.through || new Date(), req.body.limit || 50) }));
}));

router.post('/service-contracts/:id/generate-due-jobs', requireRole(...adminRoles), validate(idParam, 'params'), validate(dueWorkSchema), asyncHandler(async (req, res) => {
  await requireServiceContract(req, req.params.id);
  const contract = await prisma.serviceContract.findUnique({ where: { id: req.params.id }, include: contractInclude });
  if (contract.status !== 'ACTIVE') throw new AppError(409, 'Only active contracts can generate due jobs');
  const dueWork = contractDueItems(contract, req.body.through || new Date(), req.body.limit || 50);
  const generated = await prisma.$transaction(async (tx) => {
    const jobs = [];
    for (const item of dueWork) {
      const dueAt = new Date(item.nextDueAt);
      const job = await tx.job.create({
        data: {
          companyId: req.companyId,
          customerId: contract.customerId,
          serviceId: item.service && item.service.id || undefined,
          contractId: contract.id,
          title: item.title,
          description: 'Generated from service contract ' + contract.contractNumber,
          status: 'NEW',
          scheduledStart: dueAt,
          durationMinutes: item.defaultDurationMinutes || 60,
          responseDueAt: addHours(new Date(), contract.responseSlaHours),
          completionDueAt: addHours(dueAt, contract.completionSlaHours),
          slaStatus: contract.responseSlaHours || contract.completionSlaHours ? 'ON_TRACK' : 'NOT_APPLICABLE',
          requiresProofPhotos: Boolean(item.requiresProofPhotos),
          requiresSignature: Boolean(item.requiresSignature),
          requiresLocation: Boolean(item.requiresLocation)
        }
      });
      for (const [assetIndex, link] of (contract.assets || []).entries()) {
        await tx.jobAsset.create({ data: { companyId: req.companyId, jobId: job.id, assetId: link.assetId, primaryAsset: assetIndex === 0 } }).catch(() => null);
      }
      await tx.contractServiceLine.update({ where: { id: item.lineId }, data: { lastGeneratedJobAt: new Date(), nextDueAt: advanceDueDate(dueAt, contract.serviceLines.find((line) => line.id === item.lineId).frequency, contract.serviceLines.find((line) => line.id === item.lineId).interval || 1) } });
      await addAuditLog(tx, req, 'GENERATE_DUE_JOB', 'ServiceContract', contract.id, { jobId: job.id, lineId: item.lineId });
      jobs.push(job);
    }
    return jobs;
  });
  sendData(res, normalize({ generated }), 201);
}));

router.post('/service-contracts/:id/evaluate-entitlement', requireRole(...adminRoles), validate(idParam, 'params'), validate(contractEntitlementSchema), asyncHandler(async (req, res) => {
  const contract = await requireServiceContract(req, req.params.id);
  if (req.body.jobId) {
    const job = await requireJob(req, req.body.jobId, { assignedOnly: false });
    req.body.serviceId = req.body.serviceId || job.serviceId;
    req.body.contractLineId = req.body.contractLineId || job.contractLineId;
  }
  const entitlement = await assessContractEntitlement(req, { contract, serviceId: req.body.serviceId, contractLineId: req.body.contractLineId, warrantyRelated: req.body.warrantyRelated });
  sendData(res, normalize({ contractId: contract.id, ...entitlement }));
}));

router.post('/service-contracts/:id/generate-planned-jobs', requireRole(...adminRoles), validate(idParam, 'params'), validate(preventiveGenerateSchema), asyncHandler(async (req, res) => {
  const contract = await prisma.serviceContract.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: contractInclude });
  if (!contract) throw notFound('Service contract not found');
  if (contract.status !== 'ACTIVE') throw new AppError(409, 'Only active contracts can generate planned maintenance jobs.');
  if (contract.autoGenerateJobs === false) throw new AppError(409, 'Auto-generation is disabled for this contract.');
  const dueWork = contractDueItems(contract, req.body.through || new Date(), req.body.limit || 50)
    .filter((item) => {
      const line = contract.serviceLines.find((candidate) => candidate.id === item.lineId);
      return !line || line.autoGenerate !== false;
    });
  const generated = await prisma.$transaction(async (tx) => {
    const jobs = [];
    for (const item of dueWork) {
      const line = contract.serviceLines.find((candidate) => candidate.id === item.lineId) || {};
      const dueAt = new Date(item.nextDueAt);
      if (isBlackoutDate(dueAt, contract.blackoutDates, line.blackoutDates)) {
        await tx.preventiveMaintenanceRun.upsert({ where: { companyId_contractLineId_dueAt: { companyId: req.companyId, contractLineId: item.lineId, dueAt } }, update: { status: 'SKIPPED', skippedReason: 'Blackout date' }, create: { companyId: req.companyId, contractId: contract.id, contractLineId: item.lineId, dueAt, status: 'SKIPPED', skippedReason: 'Blackout date' } }).catch(() => null);
        continue;
      }
      const entitlement = await assessContractEntitlement(req, { contract, line, serviceId: item.service && item.service.id });
      const run = await tx.preventiveMaintenanceRun.upsert({ where: { companyId_contractLineId_dueAt: { companyId: req.companyId, contractLineId: item.lineId, dueAt } }, update: { status: 'PLANNED' }, create: { companyId: req.companyId, contractId: contract.id, contractLineId: item.lineId, dueAt, status: contract.reviewBeforeDispatch || req.body.reviewBeforeDispatch ? 'REVIEW_REQUIRED' : 'PLANNED' } });
      const job = await tx.job.create({
        data: {
          companyId: req.companyId,
          branchId: line.preferredBranchId || contract.branchId || null,
          customerId: contract.customerId,
          serviceId: item.service && item.service.id || undefined,
          workerId: line.preferredWorkerId || undefined,
          contractId: contract.id,
          contractLineId: item.lineId,
          preventiveMaintenanceRunId: run.id,
          title: item.title,
          description: 'Preventive maintenance generated from service contract ' + contract.contractNumber,
          status: contract.reviewBeforeDispatch || req.body.reviewBeforeDispatch ? 'NEW' : (line.generatedJobStatus || 'NEW'),
          scheduledStart: dueAt,
          durationMinutes: item.defaultDurationMinutes || 60,
          responseDueAt: addHours(new Date(), contract.responseSlaHours),
          completionDueAt: addHours(dueAt, contract.completionSlaHours),
          slaStatus: contract.responseSlaHours || contract.completionSlaHours ? 'ON_TRACK' : 'NOT_APPLICABLE',
          requiresProofPhotos: Boolean(item.requiresProofPhotos),
          requiresSignature: Boolean(item.requiresSignature),
          requiresLocation: Boolean(item.requiresLocation),
          contractBillingStatus: entitlement.billingStatus,
          total: entitlement.billable ? Number(contract.overageBillingRate || 0) : 0
        }
      });
      for (const [assetIndex, link] of (contract.assets || []).entries()) {
        await tx.jobAsset.create({ data: { companyId: req.companyId, jobId: job.id, assetId: link.assetId, primaryAsset: assetIndex === 0 } }).catch(() => null);
      }
      await tx.preventiveMaintenanceRun.update({ where: { id: run.id }, data: { status: 'GENERATED', generatedJobId: job.id, generatedAt: new Date() } });
      await tx.contractServiceLine.update({ where: { id: item.lineId }, data: { lastGeneratedJobAt: new Date(), nextDueAt: advanceDueDate(dueAt, line.frequency, line.interval || 1) } });
      await recordContractVisit(tx, req, { ...job, contract }, entitlement);
      await addAuditLog(tx, req, 'GENERATE_PREVENTIVE_JOB', 'ServiceContract', contract.id, { jobId: job.id, lineId: item.lineId, billingStatus: entitlement.billingStatus });
      jobs.push({ ...job, entitlement });
    }
    return jobs;
  });
  sendData(res, normalize({ generated }), 201);
}));

router.get('/jobs/:id/assets', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === 'WORKER' });
  const data = await prisma.jobAsset.findMany({ where: { companyId: req.companyId, jobId: job.id }, include: { asset: true }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/assets', requireRole(...adminRoles), validate(idParam, 'params'), validate(jobAssetSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  const asset = await requireAsset(req, req.body.assetId);
  if (asset.customerId !== job.customerId) throw new AppError(409, 'Asset must belong to the job customer');
  const data = await prisma.$transaction(async (tx) => {
    if (req.body.primaryAsset) await tx.jobAsset.updateMany({ where: { companyId: req.companyId, jobId: job.id }, data: { primaryAsset: false } });
    const link = await tx.jobAsset.upsert({ where: { companyId_jobId_assetId: { companyId: req.companyId, jobId: job.id, assetId: asset.id } }, update: { primaryAsset: Boolean(req.body.primaryAsset), notes: req.body.notes }, create: { companyId: req.companyId, jobId: job.id, assetId: asset.id, primaryAsset: Boolean(req.body.primaryAsset), notes: req.body.notes }, include: { asset: true } });
    await addAuditLog(tx, req, 'LINK_ASSET', 'Job', job.id, { assetId: asset.id });
    return link;
  });
  sendData(res, normalize(data), 201);
}));

router.delete('/jobs/:id/assets/:assetId', requireRole(...adminRoles), validate(jobAssetParam, 'params'), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  const asset = await requireAsset(req, req.params.assetId);
  await prisma.$transaction(async (tx) => {
    await tx.jobAsset.deleteMany({ where: { companyId: req.companyId, jobId: job.id, assetId: asset.id } });
    await addAuditLog(tx, req, 'UNLINK_ASSET', 'Job', job.id, { assetId: asset.id });
  });
  sendData(res, { deleted: true });
}));

router.get('/worker/jobs/:id/assets', requireRole('WORKER'), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: true });
  const data = await prisma.jobAsset.findMany({ where: { companyId: req.companyId, jobId: job.id }, include: { asset: true }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
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
  return [
    request.notes,
    request.address ? 'Address: ' + request.address : null,
    request.city ? 'City/Suburb: ' + request.city : null,
    request.propertyType ? 'Property type: ' + request.propertyType : null,
    request.accessNotes ? 'Access notes: ' + request.accessNotes : null,
    request.preferredDate ? 'Preferred date: ' + new Date(request.preferredDate).toISOString().slice(0, 10) : null,
    request.preferredTimeWindow ? 'Preferred time: ' + String(request.preferredTimeWindow).replace(/_/g, ' ') : null
  ].filter(Boolean).join('\n');
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
  const parsed = bookingRequestMessageSchema.safeParse(req.body || {});
  if (!parsed.success) throw parsed.error;
  const existing = await requireBookingRequest(req, req.params.id);
  if (existing.status === 'CONVERTED') throw new AppError(409, 'Converted booking requests cannot be changed');
  const data = await prisma.bookingRequest.update({ where: { id: existing.id }, data: { status: 'DECLINED', customerFacingMessage: parsed.data.customerFacingMessage }, include: bookingRequestInclude });
  await audit(req, 'DECLINE', 'BookingRequest', existing.id, { fromStatus: existing.status, toStatus: 'DECLINED' });
  sendData(res, normalize(data));
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

router.post('/booking-requests/:id/create-quote', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const existing = await requireBookingRequest(req, req.params.id);
  if (['DECLINED', 'CANCELLED'].includes(existing.status)) throw new AppError(409, 'Declined or cancelled booking requests cannot be quoted');
  const customer = await findOrCreateBookingCustomer(prisma, req, existing);
  const amountValue = existing.service && existing.service.price || 0;
  const title = bookingJobTitle(existing);
  const description = bookingJobDescription(existing);
  const existingQuote = await prisma.quote.findFirst({
    where: {
      companyId: req.companyId,
      customerId: customer.id,
      serviceId: existing.serviceId,
      title,
      description,
      deletedAt: null
    },
    include: quoteInclude,
    orderBy: { createdAt: 'desc' }
  });
  if (existingQuote) {
    await prisma.bookingRequest.update({ where: { id: existing.id }, data: { customerId: customer.id, status: 'REVIEWED', customerFacingMessage: 'A quote has been sent for your request.' } });
    return sendData(res, normalize(existingQuote));
  }
  const data = await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.create({ data: { companyId: req.companyId, customerId: customer.id, serviceId: existing.serviceId, jobId: existing.convertedJobId, title, description, status: 'DRAFT' } });
    await tx.quoteLineItem.create({ data: { companyId: req.companyId, quoteId: quote.id, serviceId: existing.serviceId, description: existing.serviceName || quote.title, quantity: 1, unitPrice: amountValue, discountAmount: 0, taxAmount: 0, ...moneyLine({ quantity: 1, unitPrice: amountValue, discountAmount: 0, taxAmount: 0 }), sortOrder: 0 } });
    await addQuoteStatusHistory(tx, req, { ...quote, status: null }, 'DRAFT', 'Quote created from booking request');
    const draft = await recalcQuote(tx, req.companyId, quote.id);
    await addQuoteStatusHistory(tx, req, draft, 'SENT', 'Quote sent from booking request');
    await tx.bookingRequest.update({ where: { id: existing.id }, data: { customerId: customer.id, status: 'REVIEWED', customerFacingMessage: 'A quote has been sent for your request.' } });
    return tx.quote.update({ where: { id: draft.id }, data: { status: 'SENT', sentAt: new Date() }, include: quoteInclude });
  });
  await audit(req, 'CREATE_QUOTE', 'BookingRequest', existing.id, { quoteId: data.id, customerId: customer.id });
  await notify('QUOTE_SENT', { companyId: req.companyId, relatedType: 'Quote', relatedId: data.id, record: data });
  sendData(res, normalize(data), 201);
}));
const workerCreateSchema = z.object({
  branchId: z.string().min(1).optional(),
  name: z.string().min(2),
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
  roleId: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  active: z.boolean().optional()
});
const workerPatchSchema = z.object({ branchId: z.string().min(1).nullable().optional(), roleId: z.string().nullable().optional(), title: z.string().optional(), phone: z.string().optional(), active: z.boolean().optional() });

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
  await requirePlanLimit(req.companyId, 'maxUsers');
  await requirePlanLimit(req.companyId, 'maxWorkers');
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
  if (body.branchId) await requireBranch(req, body.branchId);
  const data = await prisma.workerProfile.update({ where: { id: req.params.id }, data: body, include: SAFE_WORKER_INCLUDE });
  await audit(req, 'UPDATE', 'WorkerProfile', data.id);
  sendData(res, normalize({ ...data, user: publicUser(data.user) }));
}));


const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: optionalEmail,
  phone: optionalText(40),
  address: optionalText(500),
  taxNumber: optionalText(80),
  leadTimeDays: z.coerce.number().int().nonnegative().optional(),
  notes: optionalText(2000),
  active: z.boolean().optional()
});

const stockLocationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(stockLocationTypeValues).default('WAREHOUSE'),
  branchId: optionalText(80),
  address: optionalText(500),
  workerId: z.string().min(1).optional(),
  vehicleIdentifier: optionalText(120),
  active: z.boolean().optional()
});

const inventoryItemSchema = z.object({
  sku: optionalText(80),
  name: z.string().trim().min(2).max(160),
  description: optionalText(2000),
  category: optionalText(120),
  itemCategory: optionalText(120),
  unitOfMeasure: z.string().trim().min(1).max(40).default('each'),
  unitCost: amount.optional(),
  salePrice: amount.optional(),
  minStockLevel: optionalQuantity,
  reorderPoint: optionalQuantity,
  preferredSupplierId: z.string().min(1).optional(),
  supplierLeadTimeDays: z.coerce.number().int().nonnegative().optional(),
  serialTracked: z.boolean().optional(),
  serialNumberRequired: z.boolean().optional(),
  active: z.boolean().optional()
});

const stockAdjustmentSchema = z.object({
  itemId: z.string().min(1),
  locationId: z.string().min(1),
  movementType: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: positiveQuantity,
  unitCost: amount.optional(),
  reason: z.string().trim().min(2).max(500)
});

const stockTransferSchema = z.object({
  itemId: z.string().min(1),
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  quantity: positiveQuantity,
  reason: optionalText(500)
});

const jobPartParam = z.object({ id: z.string().min(1), partId: z.string().min(1) });
const jobPartSchema = z.object({
  itemId: z.string().min(1),
  locationId: z.string().min(1).optional(),
  workerId: z.string().min(1).optional(),
  quantityPlanned: positiveQuantity.optional(),
  quantityUsed: optionalQuantity,
  unitCost: amount.optional(),
  notes: optionalText(2000),
  status: z.enum(jobPartStatusValues).optional()
});
const jobPartUpdateSchema = jobPartSchema.partial();
const jobPartUseSchema = z.object({ quantity: positiveQuantity, locationId: z.string().min(1).optional(), notes: optionalText(2000) });
const workerPartUsedSchema = z.object({ itemId: z.string().min(1), locationId: z.string().min(1), quantity: positiveQuantity, notes: optionalText(2000) });
const workerPartShortageSchema = z.object({ itemId: z.string().min(1), quantity: positiveQuantity, notes: optionalText(2000) });

const purchaseRequestLineSchema = z.object({ itemId: z.string().min(1), quantity: positiveQuantity, estimatedUnitCost: amount.optional(), notes: optionalText(1000) });
const purchaseRequestSchema = z.object({
  branchId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  assetId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  source: optionalText(80),
  status: z.enum(purchaseRequestStatusValues).optional(),
  reason: optionalText(2000),
  lines: z.array(purchaseRequestLineSchema).default([])
});
const purchaseRequestPatchSchema = z.object({ status: z.enum(purchaseRequestStatusValues).optional(), reason: optionalText(2000), rejectionReason: optionalText(2000) });

const purchaseOrderLineSchema = z.object({ itemId: z.string().min(1), quantity: positiveQuantity, unitCost: amount.optional() });
const purchaseOrderSchema = z.object({
  branchId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
  purchaseRequestId: z.string().min(1).optional(),
  assetId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  orderNumber: optionalText(80),
  expectedAt: optionalDate,
  supplierInvoiceRef: optionalText(120),
  notes: optionalText(2000),
  lines: z.array(purchaseOrderLineSchema).min(1).default([])
});
const purchaseOrderPatchSchema = z.object({ branchId: z.string().min(1).optional(), supplierId: z.string().min(1).optional(), expectedAt: optionalDate, supplierInvoiceRef: optionalText(120), notes: optionalText(2000), status: z.enum(purchaseOrderStatusValues).optional() });
const purchaseOrderReceiveSchema = z.object({
  locationId: z.string().min(1),
  lines: z.array(z.object({ lineId: z.string().min(1), receivedQuantity: positiveQuantity })).min(1)
});

const inventoryItemInclude = { stocks: { include: { location: true } } };
const jobPartInclude = { item: true, location: true, worker: { include: SAFE_WORKER_INCLUDE } };
const purchaseRequestInclude = { job: true, asset: true, contract: true, requestedBy: { select: SAFE_USER_SELECT }, approvedBy: { select: SAFE_USER_SELECT }, rejectedBy: { select: SAFE_USER_SELECT }, lines: { include: { item: true } }, purchaseOrders: true };
const purchaseOrderInclude = { supplier: true, purchaseRequest: true, asset: true, contract: true, approvedBy: { select: SAFE_USER_SELECT }, lines: { include: { item: true } } };

router.get('/suppliers', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.supplier, req, { where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/suppliers', requireRole(...adminRoles), validate(supplierSchema), asyncHandler(async (req, res) => {
  const data = await prisma.supplier.create({ data: { ...req.body, companyId: req.companyId, active: req.body.active !== false } });
  await audit(req, 'CREATE', 'Supplier', data.id);
  sendData(res, normalize(data), 201);
}));

router.patch('/suppliers/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(supplierSchema.partial()), asyncHandler(async (req, res) => {
  await requireSupplier(req, req.params.id);
  const data = await prisma.supplier.update({ where: { id: req.params.id }, data: req.body });
  await audit(req, 'UPDATE', 'Supplier', data.id);
  sendData(res, normalize(data));
}));

router.get('/stock-locations', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.stockLocation, req, { where: { companyId: req.companyId }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/stock-locations', requireRole(...adminRoles), validate(stockLocationSchema), asyncHandler(async (req, res) => {
  if (req.body.workerId) await requireWorker(req, req.body.workerId);
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  const data = await prisma.stockLocation.create({ data: { ...req.body, companyId: req.companyId, active: req.body.active !== false } });
  await audit(req, 'CREATE', 'StockLocation', data.id);
  sendData(res, normalize(data), 201);
}));

router.patch('/stock-locations/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(stockLocationSchema.partial()), asyncHandler(async (req, res) => {
  await requireStockLocation(req, req.params.id);
  if (req.body.workerId) await requireWorker(req, req.body.workerId);
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  const data = await prisma.stockLocation.update({ where: { id: req.params.id }, data: req.body });
  await audit(req, 'UPDATE', 'StockLocation', data.id);
  sendData(res, normalize(data));
}));

router.get('/inventory/items', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.inventoryItem, req, { where: { companyId: req.companyId }, include: inventoryItemInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/inventory/items', requireRole(...adminRoles), validate(inventoryItemSchema), asyncHandler(async (req, res) => {
  if (req.body.preferredSupplierId) await requireSupplier(req, req.body.preferredSupplierId);
  const data = await prisma.inventoryItem.create({ data: { ...req.body, companyId: req.companyId, active: req.body.active !== false }, include: inventoryItemInclude });
  await audit(req, 'CREATE', 'InventoryItem', data.id);
  sendData(res, normalize(data), 201);
}));

router.get('/inventory/low-stock', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const items = await prisma.inventoryItem.findMany({ where: { companyId: req.companyId, active: true }, include: inventoryItemInclude, orderBy: { createdAt: 'desc' } });
  const data = items.filter((item) => item.reorderPoint !== null && item.reorderPoint !== undefined).map((item) => {
    const onHand = (item.stocks || []).reduce((sum, stock) => sum + decimalNumber(stock.quantityOnHand), 0);
    const reserved = (item.stocks || []).reduce((sum, stock) => sum + decimalNumber(stock.quantityReserved), 0);
    return { ...item, availableQuantity: onHand - reserved };
  }).filter((item) => item.availableQuantity <= decimalNumber(item.reorderPoint));
  sendData(res, normalize(data));
}));


router.get('/inventory/vehicle-stock', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const locations = await prisma.stockLocation.findMany({ where: { companyId: req.companyId, type: { in: ['VEHICLE', 'TECHNICIAN'] } } });
  const stocks = await prisma.inventoryStock.findMany({ where: { companyId: req.companyId, locationId: { in: locations.map((location) => location.id) } }, include: { item: true, location: true } });
  sendData(res, normalize(stocks));
}));

router.post('/inventory/low-stock/:id/purchase-request', requireRole(...adminRoles), validate(idParam, 'params'), validate(z.object({ branchId: z.string().min(1).optional(), quantity: positiveQuantity.optional(), reason: optionalText(2000) })), asyncHandler(async (req, res) => {
  const item = await requireInventoryItem(req, req.params.id);
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  const quantity = req.body.quantity || Math.max(decimalNumber(item.reorderPoint || item.minStockLevel || 1), 1);
  const data = await prisma.$transaction(async (tx) => {
    const request = await tx.purchaseRequest.create({ data: { companyId: req.companyId, branchId: req.body.branchId, requestedById: req.user.id, source: 'LOW_STOCK', status: 'REQUESTED', reason: req.body.reason || `Low stock replenishment for ${item.name}`, estimatedTotal: quantity * decimalNumber(item.unitCost || 0) } });
    await tx.purchaseRequestLine.create({ data: { companyId: req.companyId, purchaseRequestId: request.id, branchId: req.body.branchId, itemId: item.id, quantity, estimatedUnitCost: item.unitCost, notes: 'Created from low-stock alert' } });
    return tx.purchaseRequest.findUnique({ where: { id: request.id }, include: { lines: { include: { item: true } }, job: true, requestedBy: { select: SAFE_USER_SELECT }, purchaseOrders: true } });
  });
  await audit(req, 'CREATE', 'PurchaseRequest', data.id, { source: 'LOW_STOCK', itemId: item.id });
  sendData(res, normalize(data), 201);
}));

router.get('/inventory/items/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireInventoryItem(req, req.params.id);
  const data = await prisma.inventoryItem.findUnique({ where: { id: req.params.id }, include: inventoryItemInclude });
  sendData(res, normalize(data));
}));

router.patch('/inventory/items/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(inventoryItemSchema.partial()), asyncHandler(async (req, res) => {
  await requireInventoryItem(req, req.params.id);
  if (req.body.preferredSupplierId) await requireSupplier(req, req.body.preferredSupplierId);
  const data = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: req.body, include: inventoryItemInclude });
  await audit(req, 'UPDATE', 'InventoryItem', data.id);
  sendData(res, normalize(data));
}));

router.get('/inventory/items/:id/stock', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireInventoryItem(req, req.params.id);
  const data = await prisma.inventoryStock.findMany({ where: { companyId: req.companyId, itemId: req.params.id }, include: { location: true }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
}));

router.post('/inventory/adjustments', requireRole(...adminRoles), validate(stockAdjustmentSchema), asyncHandler(async (req, res) => {
  await requireInventoryItem(req, req.body.itemId);
  const location = await requireStockLocation(req, req.body.locationId);
  const approvalAmount = Number(req.body.quantity || 0) * Number(req.body.unitCost || 1);
  const approval = await requireApprovalOrProceed(req, { eventType: 'STOCK_ADJUSTMENT', actionKey: 'stock.adjust', entityType: 'InventoryStock', entityId: req.body.itemId, branchId: location && location.branchId, amount: approvalAmount, reason: req.body.reason, actionPayload: req.body });
  if (approval) return sendData(res, approvalRequiredPayload(approval), 202);
  const data = await prisma.$transaction(async (tx) => applyStockChange(tx, req, {
    itemId: req.body.itemId,
    locationId: req.body.locationId,
    movementType: req.body.movementType,
    quantity: req.body.quantity,
    unitCost: req.body.unitCost,
    reason: req.body.reason,
    onHandDelta: req.body.movementType === 'ADJUSTMENT_IN' ? req.body.quantity : -req.body.quantity,
    reservedDelta: 0
  }));
  await audit(req, 'STOCK_ADJUSTMENT', 'InventoryStock', data.id, { itemId: req.body.itemId, locationId: req.body.locationId, movementType: req.body.movementType, quantity: req.body.quantity });
  sendData(res, normalize(data), 201);
}));

router.post('/inventory/transfers', requireRole(...adminRoles), validate(stockTransferSchema), asyncHandler(async (req, res) => {
  if (req.body.fromLocationId === req.body.toLocationId) throw new AppError(400, 'Transfer locations must be different');
  await requireInventoryItem(req, req.body.itemId);
  await requireStockLocation(req, req.body.fromLocationId);
  await requireStockLocation(req, req.body.toLocationId);
  const data = await prisma.$transaction(async (tx) => {
    const out = await applyStockChange(tx, req, { itemId: req.body.itemId, locationId: req.body.fromLocationId, movementType: 'TRANSFER_OUT', quantity: req.body.quantity, reason: req.body.reason || 'Stock transfer out', onHandDelta: -req.body.quantity, reservedDelta: 0 });
    const into = await applyStockChange(tx, req, { itemId: req.body.itemId, locationId: req.body.toLocationId, movementType: 'TRANSFER_IN', quantity: req.body.quantity, reason: req.body.reason || 'Stock transfer in', onHandDelta: req.body.quantity, reservedDelta: 0 });
    return { from: out, to: into };
  });
  await audit(req, 'STOCK_TRANSFER', 'InventoryItem', req.body.itemId, { fromLocationId: req.body.fromLocationId, toLocationId: req.body.toLocationId, quantity: req.body.quantity });
  sendData(res, normalize(data), 201);
}));

router.get('/inventory/movements', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId };
  if (req.query.itemId) where.itemId = String(req.query.itemId);
  if (req.query.locationId) where.locationId = String(req.query.locationId);
  if (req.query.movementType && stockMovementTypeValues.includes(String(req.query.movementType))) where.movementType = String(req.query.movementType);
  const result = await paged(prisma.stockMovement, req, { where, include: { item: true, location: true, job: true, purchaseOrder: true, createdBy: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.get('/reports/inventory/valuation', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const stocks = await prisma.inventoryStock.findMany({ where: { companyId: req.companyId }, include: { item: true, location: true } });
  const data = stocks.map((stock) => ({ itemId: stock.itemId, itemName: stock.item && stock.item.name, locationId: stock.locationId, locationName: stock.location && stock.location.name, branchId: stock.location && stock.location.branchId, quantityOnHand: decimalNumber(stock.quantityOnHand), unitCost: decimalNumber(stock.item && stock.item.unitCost), stockValue: decimalNumber(stock.quantityOnHand) * decimalNumber(stock.item && stock.item.unitCost) }));
  sendData(res, normalize({ totalValue: data.reduce((sum, row) => sum + row.stockValue, 0), rows: data }));
}));

router.get('/reports/inventory/low-stock', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const items = await prisma.inventoryItem.findMany({ where: { companyId: req.companyId, active: true }, include: inventoryItemInclude });
  const data = items.map((item) => {
    const onHand = (item.stocks || []).reduce((sum, stock) => sum + decimalNumber(stock.quantityOnHand), 0);
    const threshold = decimalNumber(item.reorderPoint || item.minStockLevel || 0);
    return { ...item, quantityOnHand: onHand, threshold, lowStock: threshold > 0 && onHand <= threshold };
  }).filter((item) => item.lowStock);
  sendData(res, normalize(data));
}));

router.get('/reports/inventory/stock-adjustments', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const data = await prisma.stockMovement.findMany({ where: { companyId: req.companyId, movementType: { in: ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] } }, include: { item: true, location: true, createdBy: { select: SAFE_USER_SELECT } }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
}));

router.get('/reports/inventory/parts-used', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const where = { companyId: req.companyId };
  if (req.query.jobId) where.jobId = String(req.query.jobId);
  const data = await prisma.jobPartUsage.findMany({ where, include: jobPartInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
}));

router.get('/reports/suppliers/performance', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const suppliers = await prisma.supplier.findMany({ where: { companyId: req.companyId } });
  const orders = await prisma.purchaseOrder.findMany({ where: { companyId: req.companyId }, include: purchaseOrderInclude });
  const data = suppliers.map((supplier) => {
    const supplierOrders = orders.filter((order) => order.supplierId === supplier.id);
    const receivedOrders = supplierOrders.filter((order) => order.receivedAt);
    const cancelledOrders = supplierOrders.filter((order) => order.status === 'CANCELLED').length;
    const partialDeliveries = supplierOrders.filter((order) => order.status === 'PARTIALLY_RECEIVED').length;
    const spend = supplierOrders.reduce((sum, order) => sum + (order.lines || []).reduce((lineSum, line) => lineSum + purchaseOrderLineTotal(line), 0), 0);
    const leadTimes = receivedOrders.filter((order) => order.createdAt && order.receivedAt).map((order) => (new Date(order.receivedAt).getTime() - new Date(order.createdAt).getTime()) / 86400000);
    const averageLeadTimeDays = leadTimes.length ? Math.round((leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length) * 10) / 10 : null;
    const onTimeDeliveries = receivedOrders.filter((order) => order.expectedAt && new Date(order.receivedAt) <= new Date(order.expectedAt)).length;
    return { supplierId: supplier.id, supplierName: supplier.name, orderCount: supplierOrders.length, cancelledOrders, partialDeliveries, spend, averageLeadTimeDays, onTimeDeliveryRate: receivedOrders.length ? Math.round((onTimeDeliveries / receivedOrders.length) * 10000) / 100 : null };
  });
  sendData(res, normalize(data));
}));

router.get('/jobs/:id/costing', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const data = await calculateJobCosting(req, req.params.id);
  sendData(res, normalize(data));
}));

router.get('/jobs/:id/parts', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id, { assignedOnly: false });
  const data = await prisma.jobPartUsage.findMany({ where: { companyId: req.companyId, jobId: req.params.id }, include: jobPartInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/parts', requireRole(...adminRoles), validate(idParam, 'params'), validate(jobPartSchema), asyncHandler(async (req, res) => {
  await requireJob(req, req.params.id, { assignedOnly: false });
  await requireInventoryItem(req, req.body.itemId);
  if (req.body.locationId) await requireStockLocation(req, req.body.locationId);
  if (req.body.workerId) await requireWorker(req, req.body.workerId);
  const data = await prisma.jobPartUsage.create({ data: { ...req.body, companyId: req.companyId, jobId: req.params.id, status: req.body.status || 'PLANNED' }, include: jobPartInclude });
  await audit(req, 'CREATE', 'JobPartUsage', data.id, { jobId: req.params.id, itemId: req.body.itemId });
  sendData(res, normalize(data), 201);
}));

router.patch('/jobs/:id/parts/:partId', requireRole(...adminRoles), validate(jobPartParam, 'params'), validate(jobPartUpdateSchema), asyncHandler(async (req, res) => {
  await requireJobPart(req, req.params.id, req.params.partId);
  if (req.body.itemId) await requireInventoryItem(req, req.body.itemId);
  if (req.body.locationId) await requireStockLocation(req, req.body.locationId);
  if (req.body.workerId) await requireWorker(req, req.body.workerId);
  const data = await prisma.jobPartUsage.update({ where: { id: req.params.partId }, data: req.body, include: jobPartInclude });
  await audit(req, 'UPDATE', 'JobPartUsage', data.id);
  sendData(res, normalize(data));
}));

router.delete('/jobs/:id/parts/:partId', requireRole(...adminRoles), validate(jobPartParam, 'params'), asyncHandler(async (req, res) => {
  await requireJobPart(req, req.params.id, req.params.partId);
  const data = await prisma.jobPartUsage.update({ where: { id: req.params.partId }, data: { status: 'CANCELLED' }, include: jobPartInclude });
  await audit(req, 'CANCEL', 'JobPartUsage', data.id);
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/parts/:partId/reserve', requireRole(...adminRoles), validate(jobPartParam, 'params'), asyncHandler(async (req, res) => {
  const part = await requireJobPart(req, req.params.id, req.params.partId);
  const locationId = part.locationId;
  if (!locationId) throw new AppError(400, 'Location is required before reserving stock');
  const quantity = decimalNumber(part.quantityPlanned) || 1;
  const data = await prisma.$transaction(async (tx) => {
    await applyStockChange(tx, req, { itemId: part.itemId, locationId, jobId: part.jobId, movementType: 'RESERVED', quantity, reason: 'Reserved for job', onHandDelta: 0, reservedDelta: quantity });
    return tx.jobPartUsage.update({ where: { id: part.id }, data: { status: 'RESERVED' }, include: jobPartInclude });
  });
  await audit(req, 'RESERVE', 'JobPartUsage', data.id, { quantity });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/parts/:partId/use', requireRole(...adminRoles), validate(jobPartParam, 'params'), validate(jobPartUseSchema), asyncHandler(async (req, res) => {
  const part = await requireJobPart(req, req.params.id, req.params.partId);
  const locationId = req.body.locationId || part.locationId;
  if (!locationId) throw new AppError(400, 'Location is required to use stock');
  await requireStockLocation(req, locationId);
  const quantity = req.body.quantity;
  const data = await prisma.$transaction(async (tx) => {
    const reservedDelta = part.status === 'RESERVED' ? -Math.min(quantity, decimalNumber(part.quantityPlanned) || quantity) : 0;
    await applyStockChange(tx, req, { itemId: part.itemId, locationId, jobId: part.jobId, movementType: 'JOB_USED', quantity, unitCost: part.unitCost, reason: req.body.notes || 'Used on job', onHandDelta: -quantity, reservedDelta });
    return tx.jobPartUsage.update({ where: { id: part.id }, data: { quantityUsed: decimalNumber(part.quantityUsed) + quantity, locationId, status: 'USED', notes: req.body.notes || part.notes }, include: jobPartInclude });
  });
  await audit(req, 'USE', 'JobPartUsage', data.id, { quantity });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/parts/:partId/return', requireRole(...adminRoles), validate(jobPartParam, 'params'), validate(jobPartUseSchema), asyncHandler(async (req, res) => {
  const part = await requireJobPart(req, req.params.id, req.params.partId);
  const locationId = req.body.locationId || part.locationId;
  if (!locationId) throw new AppError(400, 'Location is required to return stock');
  await requireStockLocation(req, locationId);
  const quantity = req.body.quantity;
  const data = await prisma.$transaction(async (tx) => {
    await applyStockChange(tx, req, { itemId: part.itemId, locationId, jobId: part.jobId, movementType: 'JOB_RETURNED', quantity, unitCost: part.unitCost, reason: req.body.notes || 'Returned from job', onHandDelta: quantity, reservedDelta: 0 });
    return tx.jobPartUsage.update({ where: { id: part.id }, data: { quantityUsed: Math.max(0, decimalNumber(part.quantityUsed) - quantity), locationId, status: 'RETURNED', notes: req.body.notes || part.notes }, include: jobPartInclude });
  });
  await audit(req, 'RETURN', 'JobPartUsage', data.id, { quantity });
  sendData(res, normalize(data));
}));

router.get('/purchase-requests', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.purchaseRequest, req, { where: { companyId: req.companyId }, include: purchaseRequestInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/purchase-requests', requireRole(...adminRoles), validate(purchaseRequestSchema), asyncHandler(async (req, res) => {
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  if (req.body.jobId) await requireJob(req, req.body.jobId, { assignedOnly: false });
  if (req.body.assetId) await requireAsset(req, req.body.assetId);
  if (req.body.contractId) await requireServiceContract(req, req.body.contractId);
  for (const line of req.body.lines) await requireInventoryItem(req, line.itemId);
  const estimatedTotal = req.body.lines.reduce((sum, line) => sum + requestLineTotal(line), 0);
  const data = await prisma.$transaction(async (tx) => {
    const request = await tx.purchaseRequest.create({ data: { companyId: req.companyId, branchId: req.body.branchId, requestedById: req.user.id, jobId: req.body.jobId, assetId: req.body.assetId, contractId: req.body.contractId, source: req.body.source || 'MANUAL', status: req.body.status || 'REQUESTED', reason: req.body.reason, estimatedTotal } });
    for (const line of req.body.lines) await tx.purchaseRequestLine.create({ data: { companyId: req.companyId, purchaseRequestId: request.id, branchId: req.body.branchId, itemId: line.itemId, quantity: line.quantity, estimatedUnitCost: line.estimatedUnitCost, notes: line.notes } });
    return tx.purchaseRequest.findUnique({ where: { id: request.id }, include: purchaseRequestInclude });
  });
  await audit(req, 'CREATE', 'PurchaseRequest', data.id, { estimatedTotal });
  sendData(res, normalize(data), 201);
}));

router.patch('/purchase-requests/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(purchaseRequestPatchSchema), asyncHandler(async (req, res) => {
  await requirePurchaseRequest(req, req.params.id);
  const data = await prisma.purchaseRequest.update({ where: { id: req.params.id }, data: req.body, include: purchaseRequestInclude });
  await audit(req, 'UPDATE', 'PurchaseRequest', data.id);
  sendData(res, normalize(data));
}));

router.post('/purchase-requests/:id/approve', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const request = await prisma.purchaseRequest.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: purchaseRequestInclude });
  if (!request) throw notFound('Purchase request not found');
  const threshold = await companyThreshold(req, 'purchaseRequestApprovalThreshold', 1000);
  const amount = decimalNumber(request.estimatedTotal);
  if (amount > threshold) {
    const approval = await requireApprovalOrProceed(req, { eventType: 'PURCHASE_REQUEST_APPROVE', actionKey: 'purchaseRequest.approve', entityType: 'PurchaseRequest', entityId: request.id, branchId: request.branchId, amount, reason: request.reason, actionPayload: { purchaseRequestId: request.id } });
    if (approval) return sendData(res, approvalRequiredPayload(approval), 202);
  }
  const data = await prisma.purchaseRequest.update({ where: { id: req.params.id }, data: { status: 'APPROVED', approvedAt: new Date(), approvedById: req.user.id }, include: purchaseRequestInclude });
  await audit(req, 'APPROVE', 'PurchaseRequest', data.id, { amount });
  sendData(res, normalize(data));
}));

router.post('/purchase-requests/:id/reject', requireRole(...adminRoles), validate(idParam, 'params'), validate(z.object({ reason: z.string().trim().min(2).max(2000) })), asyncHandler(async (req, res) => {
  await requirePurchaseRequest(req, req.params.id);
  const data = await prisma.purchaseRequest.update({ where: { id: req.params.id }, data: { status: 'REJECTED', rejectionReason: req.body.reason, rejectedAt: new Date(), rejectedById: req.user.id }, include: purchaseRequestInclude });
  await audit(req, 'REJECT', 'PurchaseRequest', data.id, { reason: req.body.reason });
  sendData(res, normalize(data));
}));

router.post('/purchase-requests/:id/convert-to-po', requireRole(...adminRoles), validate(idParam, 'params'), validate(z.object({ supplierId: z.string().min(1).optional(), orderNumber: optionalText(80), expectedAt: optionalDate, notes: optionalText(2000) })), asyncHandler(async (req, res) => {
  const request = await prisma.purchaseRequest.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: purchaseRequestInclude });
  if (!request) throw notFound('Purchase request not found');
  if (request.status !== 'APPROVED') throw new AppError(409, 'Purchase request must be approved before conversion');
  if (req.body.supplierId) await requireSupplier(req, req.body.supplierId);
  const data = await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.create({ data: { companyId: req.companyId, branchId: request.branchId, supplierId: req.body.supplierId, purchaseRequestId: request.id, assetId: request.assetId, contractId: request.contractId, orderNumber: req.body.orderNumber || `PO-${Date.now()}`, expectedAt: req.body.expectedAt, notes: req.body.notes, status: 'DRAFT', lines: { create: (request.lines || []).map((line) => ({ companyId: req.companyId, itemId: line.itemId, quantity: line.quantity, unitCost: line.estimatedUnitCost, receivedQuantity: 0, backorderQuantity: line.quantity })) } }, include: purchaseOrderInclude });
    await tx.purchaseRequest.update({ where: { id: request.id }, data: { status: 'ORDERED' } });
    return order;
  });
  await audit(req, 'CONVERT', 'PurchaseRequest', request.id, { purchaseOrderId: data.id });
  sendData(res, normalize(data), 201);
}));

router.get('/purchase-orders', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  const result = await paged(prisma.purchaseOrder, req, { where: { companyId: req.companyId }, include: purchaseOrderInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/purchase-orders', requireRole(...adminRoles), validate(purchaseOrderSchema), asyncHandler(async (req, res) => {
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  if (req.body.supplierId) await requireSupplier(req, req.body.supplierId);
  if (req.body.purchaseRequestId) await requirePurchaseRequest(req, req.body.purchaseRequestId);
  if (req.body.assetId) await requireAsset(req, req.body.assetId);
  if (req.body.contractId) await requireServiceContract(req, req.body.contractId);
  for (const line of req.body.lines) await requireInventoryItem(req, line.itemId);
  const orderTotal = req.body.lines.reduce((sum, line) => sum + purchaseOrderLineTotal(line), 0);
  const threshold = await companyThreshold(req, 'purchaseOrderApprovalThreshold', 2500);
  const data = await prisma.purchaseOrder.create({
    data: {
      companyId: req.companyId,
      branchId: req.body.branchId,
      supplierId: req.body.supplierId,
      purchaseRequestId: req.body.purchaseRequestId,
      assetId: req.body.assetId,
      contractId: req.body.contractId,
      orderNumber: req.body.orderNumber || `PO-${Date.now()}`,
      expectedAt: req.body.expectedAt,
      supplierInvoiceRef: req.body.supplierInvoiceRef,
      notes: req.body.notes,
      status: orderTotal > threshold ? 'APPROVAL_REQUIRED' : 'DRAFT',
      lines: { create: req.body.lines.map((line) => ({ companyId: req.companyId, itemId: line.itemId, quantity: line.quantity, unitCost: line.unitCost, receivedQuantity: 0, backorderQuantity: line.quantity })) }
    },
    include: purchaseOrderInclude
  });
  await audit(req, 'CREATE', 'PurchaseOrder', data.id, { orderTotal });
  sendData(res, normalize(data), 201);
}));

router.get('/purchase-orders/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requirePurchaseOrder(req, req.params.id);
  const data = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: purchaseOrderInclude });
  sendData(res, normalize(data));
}));

router.patch('/purchase-orders/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(purchaseOrderPatchSchema), asyncHandler(async (req, res) => {
  await requirePurchaseOrder(req, req.params.id);
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  if (req.body.supplierId) await requireSupplier(req, req.body.supplierId);
  const data = await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: req.body, include: purchaseOrderInclude });
  await audit(req, 'UPDATE', 'PurchaseOrder', data.id);
  sendData(res, normalize(data));
}));

router.post('/purchase-orders/:id/approve', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const order = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: purchaseOrderInclude });
  if (!order) throw notFound('Purchase order not found');
  const orderTotal = (order.lines || []).reduce((sum, line) => sum + purchaseOrderLineTotal(line), 0);
  const approval = await requireApprovalOrProceed(req, { eventType: 'PURCHASE_ORDER_APPROVE', actionKey: 'purchaseOrder.approve', entityType: 'PurchaseOrder', entityId: order.id, branchId: order.branchId, amount: orderTotal, reason: req.body && req.body.reason, actionPayload: { purchaseOrderId: order.id } });
  if (approval) return sendData(res, approvalRequiredPayload(approval), 202);
  const data = await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: { status: 'APPROVED', approvedAt: new Date(), approvedById: req.user.id }, include: purchaseOrderInclude });
  await audit(req, 'APPROVE', 'PurchaseOrder', data.id, { orderTotal });
  sendData(res, normalize(data));
}));

router.post('/purchase-orders/:id/send', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const order = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: purchaseOrderInclude });
  if (!order) throw notFound('Purchase order not found');
  if (order.status === 'APPROVAL_REQUIRED') throw new AppError(409, 'Purchase order requires approval before it can be sent');
  const orderTotal = (order.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0);
  const approval = await requireApprovalOrProceed(req, { eventType: 'PURCHASE_ORDER_SEND', actionKey: 'purchaseOrder.send', entityType: 'PurchaseOrder', entityId: order.id, branchId: order.branchId, amount: orderTotal, reason: req.body && req.body.reason });
  if (approval) return sendData(res, approvalRequiredPayload(approval), 202);
  const data = await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: { status: 'SENT' }, include: purchaseOrderInclude });
  await audit(req, 'SEND', 'PurchaseOrder', data.id);
  sendData(res, normalize(data));
}));

router.post('/purchase-orders/:id/cancel', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requirePurchaseOrder(req, req.params.id);
  const data = await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' }, include: purchaseOrderInclude });
  await audit(req, 'CANCEL', 'PurchaseOrder', data.id);
  sendData(res, normalize(data));
}));

router.post('/purchase-orders/:id/receive', requireRole(...adminRoles), validate(idParam, 'params'), validate(purchaseOrderReceiveSchema), asyncHandler(async (req, res) => {
  const po = await requirePurchaseOrder(req, req.params.id);
  if (po.status === 'CANCELLED') throw new AppError(400, 'Cancelled purchase orders cannot be received');
  await requireStockLocation(req, req.body.locationId);
  const data = await prisma.$transaction(async (tx) => {
    for (const received of req.body.lines) {
      const line = await tx.purchaseOrderLine.findFirst({ where: { id: received.lineId, companyId: req.companyId, purchaseOrderId: po.id } });
      if (!line) throw notFound('Purchase order line not found');
      const newReceived = decimalNumber(line.receivedQuantity) + received.receivedQuantity;
      if (newReceived > decimalNumber(line.quantity)) throw new AppError(400, 'Received quantity cannot exceed ordered quantity');
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQuantity: newReceived, backorderQuantity: Math.max(decimalNumber(line.quantity) - newReceived, 0) } });
      await applyStockChange(tx, req, { itemId: line.itemId, locationId: req.body.locationId, purchaseOrderId: po.id, movementType: 'PURCHASE_RECEIVED', quantity: received.receivedQuantity, unitCost: line.unitCost, reason: `Received ${po.orderNumber}`, onHandDelta: received.receivedQuantity, reservedDelta: 0 });
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { companyId: req.companyId, purchaseOrderId: po.id } });
    const allReceived = lines.every((line) => decimalNumber(line.receivedQuantity) >= decimalNumber(line.quantity));
    const anyReceived = lines.some((line) => decimalNumber(line.receivedQuantity) > 0);
    return tx.purchaseOrder.update({ where: { id: po.id }, data: { status: allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status, receivedAt: allReceived ? new Date() : po.receivedAt }, include: purchaseOrderInclude });
  });
  await audit(req, 'RECEIVE', 'PurchaseOrder', data.id);
  sendData(res, normalize(data));
}));

router.get('/worker/vehicle-stock', requireRole('WORKER'), asyncHandler(async (req, res) => {
  if (!req.user.worker) throw notFound('Worker not found');
  const locations = await prisma.stockLocation.findMany({ where: { companyId: req.companyId, workerId: req.user.worker.id, type: { in: ['VEHICLE', 'TECHNICIAN'] }, active: true } });
  const data = await prisma.inventoryStock.findMany({ where: { companyId: req.companyId, locationId: { in: locations.map((location) => location.id) } }, include: { item: true, location: true }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
}));

router.post('/worker/stock/replenishment-requests', requireRole('WORKER'), validate(z.object({ itemId: z.string().min(1), quantity: positiveQuantity, locationId: z.string().min(1).optional(), jobId: z.string().min(1).optional(), notes: optionalText(2000) })), asyncHandler(async (req, res) => {
  if (!req.user.worker) throw notFound('Worker not found');
  const item = await requireInventoryItem(req, req.body.itemId);
  if (req.body.locationId) {
    const location = await requireStockLocation(req, req.body.locationId);
    await ensureWorkerCanUseStockLocation(req, location);
  }
  if (req.body.jobId) await requireAssignedWorkerJob(req, req.body.jobId);
  const data = await prisma.$transaction(async (tx) => {
    const request = await tx.purchaseRequest.create({ data: { companyId: req.companyId, requestedById: req.user.id, jobId: req.body.jobId, source: 'VEHICLE_REPLENISHMENT', status: 'REQUESTED', reason: req.body.notes || `Vehicle replenishment for ${item.name}`, estimatedTotal: req.body.quantity * decimalNumber(item.unitCost || 0) } });
    await tx.purchaseRequestLine.create({ data: { companyId: req.companyId, purchaseRequestId: request.id, itemId: item.id, quantity: req.body.quantity, estimatedUnitCost: item.unitCost, notes: req.body.notes } });
    return tx.purchaseRequest.findUnique({ where: { id: request.id }, include: purchaseRequestInclude });
  });
  await audit(req, 'CREATE', 'PurchaseRequest', data.id, { source: 'VEHICLE_REPLENISHMENT', workerId: req.user.worker.id });
  sendData(res, normalize(data), 201);
}));

router.get('/worker/jobs/:id/parts', requireRole('WORKER'), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireAssignedWorkerJob(req, req.params.id);
  const data = await prisma.jobPartUsage.findMany({ where: { companyId: req.companyId, jobId: req.params.id }, include: { item: true, location: true }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data.map(safeWorkerPart)));
}));

router.post('/worker/jobs/:id/parts-used', requireRole('WORKER'), validate(idParam, 'params'), validate(workerPartUsedSchema), asyncHandler(async (req, res) => {
  const job = await requireAssignedWorkerJob(req, req.params.id);
  await requireInventoryItem(req, req.body.itemId);
  const location = await requireStockLocation(req, req.body.locationId);
  await ensureWorkerCanUseStockLocation(req, location);
  const data = await prisma.$transaction(async (tx) => {
    await applyStockChange(tx, req, { itemId: req.body.itemId, locationId: req.body.locationId, jobId: job.id, movementType: 'JOB_USED', quantity: req.body.quantity, reason: req.body.notes || 'Worker recorded parts used', onHandDelta: -req.body.quantity, reservedDelta: 0 });
    return tx.jobPartUsage.create({ data: { companyId: req.companyId, jobId: job.id, itemId: req.body.itemId, locationId: req.body.locationId, workerId: req.user.worker.id, quantityUsed: req.body.quantity, notes: req.body.notes, status: 'USED' }, include: { item: true, location: true } });
  });
  await audit(req, 'USE', 'JobPartUsage', data.id, { workerId: req.user.worker.id });
  sendData(res, normalize(safeWorkerPart(data)), 201);
}));

router.post('/worker/jobs/:id/part-shortage', requireRole('WORKER'), validate(idParam, 'params'), validate(workerPartShortageSchema), asyncHandler(async (req, res) => {
  const job = await requireAssignedWorkerJob(req, req.params.id);
  await requireInventoryItem(req, req.body.itemId);
  const data = await prisma.$transaction(async (tx) => {
    const part = await tx.jobPartUsage.create({ data: { companyId: req.companyId, jobId: job.id, itemId: req.body.itemId, workerId: req.user.worker.id, quantityPlanned: req.body.quantity, notes: req.body.notes, status: 'SHORT' }, include: { item: true } });
    const request = await tx.purchaseRequest.create({ data: { companyId: req.companyId, requestedById: req.user.id, jobId: job.id, status: 'REQUESTED', reason: req.body.notes || `Shortage reported for ${req.body.quantity} item(s)` } });
    return { part, purchaseRequest: request };
  });
  await audit(req, 'SHORTAGE', 'JobPartUsage', data.part.id, { workerId: req.user.worker.id, purchaseRequestId: data.purchaseRequest.id });
  sendData(res, normalize({ ...safeWorkerPart(data.part), purchaseRequest: data.purchaseRequest }), 201);
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
  branchId: z.string().min(1).optional(),
  customerId: z.string().min(1),
  serviceId: z.string().optional(),
  workerId: z.string().optional(),
  contractId: z.string().optional(),
  title: z.string().min(2),
  description: z.string().optional(),
  status: z.enum(jobStatusValues).optional(),
  scheduledStart: optionalDate,
  scheduledEnd: optionalDate,
  responseDueAt: optionalDate,
  completionDueAt: optionalDate,
  slaStatus: z.enum(slaStatusValues).optional(),
  slaBreachedAt: optionalDate,
  durationMinutes: z.coerce.number().int().positive().optional(),
  travelBufferMinutes: z.coerce.number().int().min(0).optional(),
  requiresProofPhotos: z.boolean().optional(),
  minimumProofPhotos: z.coerce.number().int().min(0).max(20).optional(),
  requiresBeforePhotos: z.boolean().optional(),
  requiresAfterPhotos: z.boolean().optional(),
  requiresSignature: z.boolean().optional(),
  requiresLocation: z.boolean().optional(),
  adminOverride: z.boolean().optional(),
  contractLineId: optionalText(80),
  warrantyRelated: z.boolean().optional(),
  warrantyBillingOverride: z.boolean().optional(),
  warrantyOverrideReason: optionalText(1000),
  contractBillingStatus: z.enum(contractBillingStatusValues).optional()
});

router.get('/jobs', asyncHandler(async (req, res) => {
  if (req.query.branchId) await requireBranch(req, String(req.query.branchId));
  const result = await paged(prisma.job, req, { where: { companyId: req.companyId, ...branchFilterFromQuery(req), ...workerJobScope(req) }, include: jobInclude, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.get('/worker/jobs', requireRole('WORKER'), asyncHandler(async (req, res) => {
  const result = await paged(prisma.job, req, { where: { companyId: req.companyId, ...workerJobScope(req) }, include: jobInclude, orderBy: { scheduledStart: 'asc' } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.post('/jobs', requireRole(...adminRoles), validate(jobSchema), asyncHandler(async (req, res) => {
  await requirePlanLimit(req.companyId, 'maxJobsPerMonth');
  const settings = await getSchedulingSettings(req.companyId);
  const proofDefaults = {
    requiresProofPhotos: req.body.requiresProofPhotos ?? settings.requireProofPhotos,
    requiresBeforePhotos: req.body.requiresBeforePhotos ?? settings.requireBeforePhotos,
    requiresAfterPhotos: req.body.requiresAfterPhotos ?? settings.requireAfterPhotos,
    requiresLocation: req.body.requiresLocation ?? settings.requireLocation,
    minimumProofPhotos: req.body.minimumProofPhotos ?? (settings.requireProofPhotos ? 1 : 0)
  };
  if (proofDefaults.requiresProofPhotos || proofDefaults.requiresBeforePhotos || proofDefaults.requiresAfterPhotos || req.body.requiresSignature || proofDefaults.requiresLocation || Number(proofDefaults.minimumProofPhotos || 0) > 0) {
    await requireFeature(req.companyId, 'proofOfWork');
  }
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  await validateJobRelations(req, req.body);
  const trustedService = req.body.serviceId ? await requireService(req, req.body.serviceId) : null;
  const selectedContract = req.body.contractId ? await requireServiceContract(req, req.body.contractId) : null;
  const entitlement = selectedContract ? await assessContractEntitlement(req, { contract: selectedContract, serviceId: req.body.serviceId, contractLineId: req.body.contractLineId, warrantyRelated: req.body.warrantyRelated }) : null;
  const trustedJobTotal = req.body.warrantyRelated && !req.body.warrantyBillingOverride ? 0 : (entitlement && !entitlement.billable ? 0 : (trustedService ? trustedService.price : 0));
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
      ...proofDefaults,
      durationMinutes: jobData.durationMinutes || settings.defaultJobDurationMinutes,
      travelBufferMinutes: jobData.travelBufferMinutes ?? settings.defaultTravelBufferMinutes,
      total: trustedJobTotal,
      contractBillingStatus: req.body.warrantyRelated && !req.body.warrantyBillingOverride ? 'WARRANTY' : (entitlement ? entitlement.billingStatus : (jobData.contractBillingStatus || 'UNKNOWN')),
      contractLineId: entitlement && entitlement.contractLineId || jobData.contractLineId,
      warrantyRelated: Boolean(req.body.warrantyRelated),
      warrantyBillingOverride: Boolean(req.body.warrantyBillingOverride),
      warrantyOverrideReason: req.body.warrantyOverrideReason,
      companyId: req.companyId,
      status: wantsSchedule ? 'NEW' : (jobData.status || settings.defaultJobStatus || 'NEW')
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

    if (entitlement) {
      await prisma.$transaction(async (tx) => {
        await recordContractVisit(tx, req, { ...scheduled.job, contract: selectedContract }, entitlement);
      });
    }
    await audit(req, 'CREATE', 'Job', data.id, { scheduled: true, scheduleItemId: scheduled.schedule.id });
    await notify('JOB_SCHEDULED', { companyId: req.companyId, relatedType: 'Job', relatedId: scheduled.job.id });

    return sendData(res, normalize({
      ...scheduled.job,
      customer: data.customer,
      service: data.service,
      worker: scheduled.schedule.worker
    }), 201);
  }

  if (entitlement) {
    await prisma.$transaction(async (tx) => {
      await recordContractVisit(tx, req, { ...data, contract: selectedContract }, entitlement);
    });
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

router.post('/jobs/:id/sla/evaluate', requireRole(...adminRoles), validate(idParam, 'params'), validate(slaEvaluateSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  const status = calculateSlaStatus(job, req.body.now || new Date(), req.body.atRiskHours || 4);
  const data = await prisma.$transaction(async (tx) => {
    const updated = await tx.job.update({ where: { id: job.id }, data: { slaStatus: status, slaBreachedAt: status === 'BREACHED' ? (job.slaBreachedAt || new Date()) : job.slaBreachedAt }, include: jobDetailInclude });
    await addAuditLog(tx, req, 'EVALUATE_SLA', 'Job', job.id, { fromStatus: job.slaStatus, toStatus: status });
    return updated;
  });
  if (status === 'AT_RISK') await notify('SLA_AT_RISK', { companyId: req.companyId, relatedType: 'Job', relatedId: job.id }).catch(() => null);
  if (status === 'BREACHED') await notify('SLA_BREACHED', { companyId: req.companyId, relatedType: 'Job', relatedId: job.id }).catch(() => null);
  sendData(res, normalize(jobWithEvidenceStatus(data)));
}));

router.post('/jobs/:id/sla/waive', requireRole(...adminRoles), validate(idParam, 'params'), validate(slaWaiveSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  const approval = await requireApprovalOrProceed(req, { eventType: 'SLA_WAIVE', actionKey: 'contract.sla.override', entityType: 'Job', entityId: job.id, branchId: job.branchId, reason: req.body.reason, actionPayload: { fromStatus: job.slaStatus } });
  if (approval) return sendData(res, approvalRequiredPayload(approval), 202);
  const data = await prisma.$transaction(async (tx) => {
    const updated = await tx.job.update({ where: { id: job.id }, data: { slaStatus: 'WAIVED', slaWaivedAt: new Date(), slaWaivedById: req.user.id }, include: jobDetailInclude });
    await addAuditLog(tx, req, 'WAIVE_SLA', 'Job', job.id, { reason: req.body.reason });
    return updated;
  });
  sendData(res, normalize(jobWithEvidenceStatus(data)));
}));

router.post('/jobs/:id/warranty', requireRole(...adminRoles), validate(idParam, 'params'), validate(warrantyFlagSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  if (req.body.warrantyRelated && req.body.warrantyBillingOverride) {
    const approval = await requireApprovalOrProceed(req, { eventType: 'INVOICE_DISCOUNT', actionKey: 'invoice.discount.approve', entityType: 'Job', entityId: job.id, branchId: job.branchId, reason: req.body.reason || 'Override warranty billing protection', amount: Number(job.total || 0), actionPayload: { warrantyBillingOverride: true } });
    if (approval) return sendData(res, approvalRequiredPayload(approval), 202);
  }
  const data = await prisma.job.update({ where: { id: job.id }, data: { warrantyRelated: req.body.warrantyRelated, warrantyBillingOverride: Boolean(req.body.warrantyBillingOverride), warrantyOverrideReason: req.body.reason, contractBillingStatus: req.body.warrantyRelated && !req.body.warrantyBillingOverride ? 'WARRANTY' : job.contractBillingStatus, total: req.body.warrantyRelated && !req.body.warrantyBillingOverride ? 0 : job.total }, include: jobDetailInclude });
  await audit(req, 'UPDATE_WARRANTY', 'Job', job.id, { warrantyRelated: req.body.warrantyRelated, warrantyBillingOverride: Boolean(req.body.warrantyBillingOverride) });
  sendData(res, normalize(jobWithEvidenceStatus(data)));
}));

router.patch('/jobs/:id', requireRole(...adminRoles), validate(idParam, 'params'), validate(jobSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await requireJob(req, req.params.id, { assignedOnly: false });
  await validateJobRelations(req, { ...req.body, customerId: req.body.customerId || existing.customerId });
  const data = await prisma.job.update({ where: { id: req.params.id }, data: req.body, include: jobDetailInclude });
  await audit(req, 'UPDATE', 'Job', data.id);
  sendData(res, normalize(jobWithEvidenceStatus(data)));
}));

router.post('/jobs/:id/assign-worker', requireRole(...adminRoles), validate(idParam, 'params'), validate(z.object({ workerId: z.string().min(1), reason: optionalText(1000) })), asyncHandler(async (req, res) => {
  const existing = await requireJob(req, req.params.id, { assignedOnly: false });
  await requireWorker(req, req.body.workerId);
  if (existing.workerId && existing.workerId !== req.body.workerId && ['DISPATCHED', 'ARRIVED', 'IN_PROGRESS', 'PAUSED'].includes(existing.status)) {
    const approval = await requireApprovalOrProceed(req, { eventType: 'JOB_REASSIGN_AFTER_DISPATCH', actionKey: 'job.reassign.after_dispatch', entityType: 'Job', entityId: existing.id, branchId: existing.branchId, reason: req.body.reason, actionPayload: { workerId: req.body.workerId, fromWorkerId: existing.workerId } });
    if (approval) return sendData(res, approvalRequiredPayload(approval), 202);
  }
  const data = await prisma.$transaction(async (tx) => {
    const updated = await tx.job.update({ where: { id: req.params.id }, data: { workerId: req.body.workerId, status: 'SCHEDULED' } });
    await addJobActivity(tx, req, updated, 'ASSIGNED', null, { workerId: req.body.workerId });
    await addAuditLog(tx, req, 'ASSIGN_WORKER', 'Job', updated.id, { workerId: req.body.workerId });
    return updated;
  });
  if (existing.workerId !== req.body.workerId) await notify('WORKER_ASSIGNED', { companyId: req.companyId, relatedType: 'Job', relatedId: data.id });
  sendData(res, normalize(data));
}));

const noteActivitySchema = z.object({ note: z.string().trim().min(1).max(2000), metadata: z.record(z.any()).optional() });
const completionLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy: z.coerce.number().min(0).max(100000).optional(),
  capturedAt: optionalDate,
  offlineCreatedAt: optionalDate,
  deviceId: optionalText(180),
  syncId: optionalText(180),
  source: z.enum(['WORKER_BROWSER', 'WORKER_DEVICE', 'MANUAL_NOT_AVAILABLE', 'OFFLINE_SYNC']).optional()
});
const completeJobSchema = z.object({ completionNotes: z.string().trim().min(1).max(2000).optional(), adminOverride: z.boolean().optional(), customerSignatureUrl: z.string().url().optional(), proofPhotoIds: z.array(z.string().min(1)).optional(), location: completionLocationSchema.optional() });

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
  const settings = await getSchedulingSettings(req.companyId);
  if (job.status === "COMPLETED") {
    const existing = await prisma.job.findFirst({ where: { id: job.id, companyId: req.companyId }, include: jobDetailInclude });
    return sendData(res, normalize(jobWithEvidenceStatus(existing)));
  }
  assertNotCancelled(job, "completed");
  const isAdmin = adminRoles.includes(req.user.role);
  if (req.body.adminOverride && !isAdmin) throw new AppError(403, "Only admins can use completion override");
  if (settings.requireCompletionNotes !== false && !req.body.completionNotes && !req.body.adminOverride) throw new AppError(400, "Completion notes are required");
  if (!["IN_PROGRESS", "PAUSED"].includes(job.status) && !(isAdmin && req.body.adminOverride)) assertTransition(job, ["IN_PROGRESS", "PAUSED"], "COMPLETED");
  const [proofPhotos, signature, existingLocation] = await Promise.all([
    prisma.jobProofPhoto.findMany({ where: { companyId: req.companyId, jobId: job.id } }),
    prisma.jobSignature.findFirst({ where: { companyId: req.companyId, jobId: job.id } }),
    prisma.jobCompletionLocation.findFirst({ where: { companyId: req.companyId, jobId: job.id } })
  ]);
  const proofPhotoCount = proofPhotos.length;
  const beforePhotoCount = proofPhotos.filter((photo) => photo.category === 'BEFORE').length;
  const afterPhotoCount = proofPhotos.filter((photo) => photo.category === 'AFTER').length;
  const locationProvided = Boolean(req.body.location);
  const missing = {
    proofPhotos: Boolean(job.requiresProofPhotos) && proofPhotoCount < 1,
    beforePhotos: Boolean(job.requiresBeforePhotos) && beforePhotoCount < 1,
    afterPhotos: Boolean(job.requiresAfterPhotos) && afterPhotoCount < 1,
    signature: Boolean(job.requiresSignature) && !signature,
    location: Boolean(job.requiresLocation) && !existingLocation && !locationProvided
  };
  if ((missing.proofPhotos || missing.beforePhotos || missing.afterPhotos || missing.signature || missing.location) && !req.body.adminOverride) {
    throw new AppError(409, "Completion evidence is required", {
      proofPhotos: { required: Boolean(job.requiresProofPhotos), minimum: Boolean(job.requiresProofPhotos) ? 1 : 0, count: proofPhotoCount, satisfied: !missing.proofPhotos },
      beforePhotos: { required: Boolean(job.requiresBeforePhotos), minimum: Boolean(job.requiresBeforePhotos) ? 1 : 0, count: beforePhotoCount, satisfied: !missing.beforePhotos },
      afterPhotos: { required: Boolean(job.requiresAfterPhotos), minimum: Boolean(job.requiresAfterPhotos) ? 1 : 0, count: afterPhotoCount, satisfied: !missing.afterPhotos },
      signature: { required: Boolean(job.requiresSignature), captured: Boolean(signature), satisfied: !missing.signature },
      location: { required: Boolean(job.requiresLocation), captured: Boolean(existingLocation || locationProvided), satisfied: !missing.location }
    });
  }
  const now = new Date();
  const updateData = {
    status: "COMPLETED",
    completedAt: now,
    completedById: req.user.id,
    completionNotes: req.body.completionNotes || job.completionNotes
  };
  if (proofPhotoCount > 0 && !job.proofCompletedAt) updateData.proofCompletedAt = now;
  if (signature && !job.signatureCompletedAt) updateData.signatureCompletedAt = now;
  const data = await prisma.$transaction(async (tx) => {
    if (req.body.location) {
      await tx.jobCompletionLocation.upsert({
        where: { jobId: job.id },
        update: { capturedById: req.user.id, latitude: req.body.location.latitude, longitude: req.body.location.longitude, accuracy: req.body.location.accuracy, source: req.body.location.source || 'WORKER_BROWSER', capturedAt: req.body.location.capturedAt || now },
        create: { companyId: req.companyId, jobId: job.id, capturedById: req.user.id, latitude: req.body.location.latitude, longitude: req.body.location.longitude, accuracy: req.body.location.accuracy, source: req.body.location.source || 'WORKER_BROWSER', capturedAt: req.body.location.capturedAt || now }
      });
      await addJobActivity(tx, req, job, "COMPLETION_LOCATION_CAPTURED", null, { source: req.body.location.source || 'WORKER_BROWSER', accuracy: req.body.location.accuracy });
    }
    const updated = await tx.job.update({ where: { id: job.id }, data: updateData, include: jobDetailInclude });
    await addJobActivity(tx, req, job, "COMPLETED", req.body.completionNotes, { fromStatus: job.status, toStatus: "COMPLETED", adminOverride: Boolean(req.body.adminOverride) });
    await addAuditLog(tx, req, req.body.adminOverride ? "COMPLETE_ADMIN_OVERRIDE" : "COMPLETE", "Job", job.id, { fromStatus: job.status, toStatus: "COMPLETED", proofPhotoCount, signatureCaptured: Boolean(signature) });
    return updated;
  });
  await notify("JOB_COMPLETED", { companyId: req.companyId, relatedType: "Job", relatedId: data.id, record: data });
  sendData(res, normalize(jobWithEvidenceStatus(data)));
}));

const proofPhotoBodySchema = z.object({
  caption: optionalText(500),
  category: z.enum(proofCategoryValues).default('GENERAL'),
  capturedAt: optionalDate,
  offlineCreatedAt: optionalDate,
  deviceId: optionalText(180),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).max(100000).optional(),
  syncId: optionalText(180)
});
const signatureBodySchema = z.object({
  signerName: optionalText(160),
  capturedAt: optionalDate,
  offlineCreatedAt: optionalDate,
  deviceId: optionalText(180),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).max(100000).optional(),
  syncId: optionalText(180)
});
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
  return file.url || "/uploads/jobs/" + kind + "/" + file.filename;
}

router.get("/jobs/:id/proof-photos", validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  const result = await paged(prisma.jobProofPhoto, req, { where: { companyId: req.companyId, jobId: job.id }, orderBy: { createdAt: "desc" } });
  sendData(res, normalize(result.data), 200, result.meta);
}));

router.get("/jobs/:id/proof-summary", validate(idParam, "params"), asyncHandler(async (req, res) => {
  const job = await prisma.job.findFirst({ where: { id: req.params.id, companyId: req.companyId, ...(req.user.role === "WORKER" ? workerJobScope(req) : {}) }, include: jobDetailInclude });
  if (!job) throw notFound("Job not found");
  sendData(res, normalize(proofSummary(job, false)));
}));

router.post("/jobs/:id/completion-location", validate(idParam, "params"), validate(completionLocationSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  const data = await prisma.$transaction(async (tx) => {
    const captured = await tx.jobCompletionLocation.upsert({
      where: { jobId: job.id },
      update: { capturedById: req.user.id, latitude: req.body.latitude, longitude: req.body.longitude, accuracy: req.body.accuracy, source: req.body.source || 'WORKER_BROWSER', capturedAt: req.body.capturedAt || new Date(), offlineCreatedAt: req.body.offlineCreatedAt, deviceId: req.body.deviceId, syncId: req.body.syncId },
      create: { companyId: req.companyId, jobId: job.id, capturedById: req.user.id, latitude: req.body.latitude, longitude: req.body.longitude, accuracy: req.body.accuracy, source: req.body.source || 'WORKER_BROWSER', capturedAt: req.body.capturedAt || new Date(), offlineCreatedAt: req.body.offlineCreatedAt, deviceId: req.body.deviceId, syncId: req.body.syncId }
    });
    await addJobActivity(tx, req, job, "COMPLETION_LOCATION_CAPTURED", null, { source: captured.source, accuracy: captured.accuracy });
    await addAuditLog(tx, req, "CAPTURE_LOCATION", "Job", job.id, { locationId: captured.id });
    return captured;
  });
  sendData(res, normalize(data), 201);
}));

router.post("/jobs/:id/proof-photos", validate(idParam, "params"), loadEvidenceJob, singleUpload(proofUpload, "photo"), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, "Proof photo is required");
  const parsed = proofPhotoBodySchema.safeParse(req.body);
  if (!parsed.success) throw parsed.error;
  const job = req.evidenceJob;
  const stored = await storeUploadedFile({ companyId: req.companyId, file: req.file, scope: 'jobs', relatedId: job.id, localSubdir: 'jobs/proof', filenamePrefix: req.companyId + '-proof', jobId: job.id, customerId: job.customerId, uploadedById: req.user.id });
  const data = await prisma.$transaction(async (tx) => {
    const photo = await tx.jobProofPhoto.create({ data: { companyId: req.companyId, jobId: job.id, workerId: evidenceWorkerId(req, job), uploadedById: req.user.id, url: stored.url, filename: stored.filename, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, category: parsed.data.category, caption: parsed.data.caption, capturedAt: parsed.data.capturedAt, offlineCreatedAt: parsed.data.offlineCreatedAt, deviceId: parsed.data.deviceId, latitude: parsed.data.latitude, longitude: parsed.data.longitude, accuracy: parsed.data.accuracy, syncId: parsed.data.syncId } });
    await addJobActivity(tx, req, job, "PROOF_PHOTO_ADDED", parsed.data.caption, { proofPhotoId: photo.id, category: photo.category });
    await addAuditLog(tx, req, "CREATE", "JobProofPhoto", photo.id, { jobId: job.id, category: photo.category });
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
  const stored = await storeUploadedFile({ companyId: req.companyId, file: req.file, scope: 'jobs', relatedId: job.id, localSubdir: 'jobs/signatures', filenamePrefix: req.companyId + '-signature', jobId: job.id, customerId: job.customerId, uploadedById: req.user.id });
  const data = await prisma.$transaction(async (tx) => {
    const signature = await tx.jobSignature.upsert({ where: { jobId: job.id }, update: { capturedById: req.user.id, signerName: parsed.data.signerName, signatureUrl: stored.url, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, capturedAt: parsed.data.capturedAt, offlineCreatedAt: parsed.data.offlineCreatedAt, deviceId: parsed.data.deviceId, latitude: parsed.data.latitude, longitude: parsed.data.longitude, accuracy: parsed.data.accuracy, syncId: parsed.data.syncId }, create: { companyId: req.companyId, jobId: job.id, capturedById: req.user.id, signerName: parsed.data.signerName, signatureUrl: stored.url, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, capturedAt: parsed.data.capturedAt, offlineCreatedAt: parsed.data.offlineCreatedAt, deviceId: parsed.data.deviceId, latitude: parsed.data.latitude, longitude: parsed.data.longitude, accuracy: parsed.data.accuracy, syncId: parsed.data.syncId } });
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

router.post('/jobs/:id/activity', requireRole(...adminRoles, 'WORKER'), validate(idParam, 'params'), validate(noteActivitySchema), asyncHandler(async (req, res) => {
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
  branchId: z.string().min(1).optional(),
  customerId: z.string().min(1),
  serviceId: z.string().optional(),
  jobId: z.string().optional(),
  title: z.string().min(2),
  description: z.string().optional(),
  validUntil: optionalDate,
  amount: amount.optional(),
  depositRequiredAmount: amount.optional(),
  depositRequiredPercent: z.coerce.number().min(0).max(100).optional(),
  paymentPlanNotes: optionalText(1000),
  lineItems: lineItemsSchema
});

function fallbackQuoteLines(body) {
  if (body.lineItems && body.lineItems.length) return body.lineItems;
  if (body.amount || body.serviceId) return [{ serviceId: body.serviceId, description: body.title, quantity: 1, unitPrice: body.amount || 0, sortOrder: 0 }];
  return [];
}

router.get('/quotes', requireRole(...adminRoles), asyncHandler(async (req, res) => {
  await purgeExpiredDeletedQuotes(req.companyId);
  const [company, result] = await Promise.all([
    getCompanyWithBranding(req.companyId),
    paged(prisma.quote, req, { where: { companyId: req.companyId, ...branchFilterFromQuery(req), ...quoteDeletedFilter(req) }, include: quoteInclude, orderBy: { createdAt: 'desc' } })
  ]);
  const finance = await getCompanyFinanceSettings(req.companyId);
  sendData(res, normalize(result.data.map((item) => attachLocalization({ ...item, branding: publicBranding(company) }, finance))), 200, result.meta);
}));

router.post('/quotes', requireRole(...adminRoles), validate(quoteSchema), asyncHandler(async (req, res) => {
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  await validateQuoteRelations(req, req.body);
  const finance = await getCompanyFinanceSettings(req.companyId);
  const data = await prisma.$transaction(async (tx) => {
    const { lineItems, amount: ignoredAmount, ...quoteData } = req.body;
    if (!quoteData.validUntil) quoteData.validUntil = addDaysFromNow(financeLocalization(finance).quoteExpiryDays);
    const quote = await tx.quote.create({
  data: {
    ...quoteData,
    companyId: req.companyId,
    status: 'DRAFT',
    deletedAt: null,
    deleteExpiresAt: null
  }
});
    for (const [index, item] of fallbackQuoteLines(req.body).entries()) {
      if (item.serviceId) await requireService(req, item.serviceId);
      await tx.quoteLineItem.create({ data: { ...item, ...moneyLine(item), companyId: req.companyId, quoteId: quote.id, sortOrder: item.sortOrder ?? index } });
    }
    await addQuoteStatusHistory(tx, req, { ...quote, status: null }, 'DRAFT', 'Quote created');
    return recalcQuote(tx, req.companyId, quote.id);
  });
  await audit(req, 'CREATE', 'Quote', data.id);
  sendData(res, normalize(attachLocalization(data, finance)), 201);
}));

router.get('/quotes/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireQuote(req, req.params.id);
  const data = await prisma.quote.findFirst({ where: { id: req.params.id, companyId: req.companyId, deletedAt: null }, include: quoteInclude });
  sendData(res, normalize(attachLocalization(data, await getCompanyFinanceSettings(req.companyId))));
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
  if (quote.status === status) return prisma.quote.findFirst({ where: { id: quote.id, companyId: req.companyId, deletedAt: null }, include: quoteInclude });
  const allowed = { SENT: ['DRAFT'], ACCEPTED: ['SENT'], REJECTED: ['SENT'], EXPIRED: ['SENT'] };
  if (!allowed[status].includes(quote.status)) throw new AppError(409, 'Quote cannot transition from ' + quote.status + ' to ' + status);
  return prisma.$transaction(async (tx) => {
    await addQuoteStatusHistory(tx, req, quote, status, note);
    return tx.quote.update({ where: { id: quote.id }, data: { status, [stamp]: new Date() }, include: quoteInclude });
  });
}

router.post('/quotes/:id/send', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const before = await requireQuote(req, req.params.id);
  const data = await transitionQuote(req, 'SENT', 'sentAt', 'Quote sent');
  await audit(req, 'SEND', 'Quote', data.id);
  if (before.status !== 'SENT') await notify('QUOTE_SENT', { companyId: req.companyId, relatedType: 'Quote', relatedId: data.id, record: data });
  sendData(res, normalize(data));
}));

router.post('/quotes/:id/accept', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const quote = await requireQuote(req, req.params.id);
  const wasAccepted = quote.status === 'ACCEPTED';
  if (quote.status === 'REJECTED' || quote.status === 'EXPIRED') throw new AppError(409, 'Rejected or expired quotes cannot be accepted');
  const data = await prisma.$transaction(async (tx) => {
    const current = await tx.quote.findFirst({ where: { id: quote.id, companyId: req.companyId }, include: quoteInclude });
    if (current.status === 'ACCEPTED' && current.jobId) return current;
    if (current.status !== 'SENT' && current.status !== 'ACCEPTED') throw new AppError(409, 'Only sent quotes can be accepted');
    let jobId = current.jobId;
    if (!jobId) {
      const job = await tx.job.create({ data: { companyId: req.companyId, branchId: current.branchId || null, customerId: current.customerId, serviceId: current.serviceId, title: current.title, description: current.description, total: current.total || current.amount } });
      jobId = job.id;
    }
    if (current.status !== 'ACCEPTED') await addQuoteStatusHistory(tx, req, current, 'ACCEPTED', 'Quote accepted');
    return tx.quote.update({ where: { id: current.id }, data: { status: 'ACCEPTED', acceptedAt: current.acceptedAt || new Date(), jobId }, include: quoteInclude });
  });
  await audit(req, 'ACCEPT', 'Quote', data.id, { jobId: data.jobId });
  if (!wasAccepted) await notify('QUOTE_ACCEPTED', { companyId: req.companyId, relatedType: 'Quote', relatedId: data.id, record: data });
  sendData(res, normalize(data));
}));

router.post('/quotes/:id/reject', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const before = await requireQuote(req, req.params.id);
  const data = await transitionQuote(req, 'REJECTED', 'rejectedAt', 'Quote rejected');
  await audit(req, 'REJECT', 'Quote', data.id);
  if (before.status !== 'REJECTED') await notify('QUOTE_REJECTED', { companyId: req.companyId, relatedType: 'Quote', relatedId: data.id, record: data });
  sendData(res, normalize(data));
}));

router.post('/quotes/:id/reverse-rejection', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const quote = await requireQuote(req, req.params.id);
  if (quote.status !== 'REJECTED') throw new AppError(409, 'Only rejected quotes can have rejection reversed');
  const data = await prisma.$transaction(async (tx) => {
    await addQuoteStatusHistory(tx, req, quote, 'SENT', 'Quote rejection reversed');
    return tx.quote.update({ where: { id: quote.id }, data: { status: 'SENT', rejectedAt: null }, include: quoteInclude });
  });
  await audit(req, 'REVERSE_REJECTION', 'Quote', data.id);
  sendData(res, normalize(data));
}));

router.delete('/quotes/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const quote = await requireQuote(req, req.params.id);
  const deletedAt = new Date();
  const deleteExpiresAt = new Date(deletedAt.getTime() + quoteDeleteRetentionDays * 24 * 60 * 60 * 1000);
  const data = await prisma.quote.update({ where: { id: quote.id }, data: { deletedAt, deleteExpiresAt }, include: quoteInclude });
  await audit(req, 'DELETE', 'Quote', data.id, { softDelete: true, deleteExpiresAt });
  sendData(res, normalize(data));
}));

router.post('/quotes/:id/restore', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const quote = await requireQuote(req, req.params.id, { includeDeleted: true });
  if (!quote.deletedAt) return sendData(res, normalize(await prisma.quote.findFirst({ where: { id: quote.id, companyId: req.companyId }, include: quoteInclude })));
  const data = await prisma.quote.update({ where: { id: quote.id }, data: { deletedAt: null, deleteExpiresAt: null }, include: quoteInclude });
  await audit(req, 'RESTORE', 'Quote', data.id);
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
  branchId: z.string().min(1).optional(),
  customerId: z.string().min(1),
  serviceId: z.string().optional(),
  jobId: z.string().optional(),
  quoteId: z.string().optional(),
  number: z.string().optional(),
  dueDate: optionalDate,
  promisedPaymentDate: optionalDate,
  depositRequiredAmount: amount.optional(),
  depositRequiredPercent: z.coerce.number().min(0).max(100).optional(),
  paymentPlanNotes: optionalText(1000),
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
    paged(prisma.invoice, req, { where: { companyId: req.companyId, ...branchFilterFromQuery(req) }, include: invoiceInclude, orderBy: { createdAt: 'desc' } })
  ]);
  const finance = await getCompanyFinanceSettings(req.companyId);
  sendData(res, normalize(result.data.map((item) => attachLocalization({ ...item, branding: publicBranding(company) }, finance))), 200, result.meta);
}));

router.post('/invoices', requireRole(...adminRoles), validate(invoiceSchema), asyncHandler(async (req, res) => {
  if (req.body.branchId) await requireBranch(req, req.body.branchId);
  await validateInvoiceRelations(req, req.body);
  if (req.body.quoteId) await requireQuote(req, req.body.quoteId);
  const finance = await getCompanyFinanceSettings(req.companyId);
  const data = await prisma.$transaction(async (tx) => {
    const { lineItems, amount: ignoredAmount, ...invoiceData } = req.body;
    if (!invoiceData.dueDate) invoiceData.dueDate = addDaysFromNow(financeLocalization(finance).paymentTermsDays);
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
  sendData(res, normalize(attachLocalization(data, finance)), 201);
}));

router.get('/invoices/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireInvoice(req, req.params.id);
  const data = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: invoiceInclude });
  sendData(res, normalize(attachLocalization(data, await getCompanyFinanceSettings(req.companyId))));
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
  const quote = await prisma.quote.findFirst({ where: { companyId: req.companyId, jobId: job.id, deletedAt: null }, include: { lineItems: true } });
  const data = await prisma.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, req.companyId);
    const finance = await getCompanyFinanceSettings(req.companyId, tx);
    const invoice = await tx.invoice.create({ data: { companyId: req.companyId, branchId: job.branchId || null, customerId: job.customerId, serviceId: job.serviceId, jobId: job.id, quoteId: quote && quote.id, number, status: 'DRAFT', dueDate: addDaysFromNow(financeLocalization(finance).paymentTermsDays) } });
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
  const before = await requireInvoice(req, req.params.id);
  const data = await transitionInvoice(req, 'SENT', 'sentAt', 'Invoice sent');
  await audit(req, 'SEND', 'Invoice', data.id);
  if (before.status !== 'SENT') await notify('INVOICE_SENT', { companyId: req.companyId, relatedType: 'Invoice', relatedId: data.id, record: data });
  sendData(res, normalize(data));
}));

router.post('/invoices/:id/void', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  const approval = await requireApprovalOrProceed(req, { eventType: 'INVOICE_VOID', actionKey: 'invoice.void', entityType: 'Invoice', entityId: invoice.id, branchId: invoice.branchId, amount: invoice.total || invoice.amount, reason: req.body && req.body.reason });
  if (approval) return sendData(res, approvalRequiredPayload(approval), 202);
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
  await notify('PAYMENT_RECEIVED', { companyId: req.companyId, relatedType: 'Payment', relatedId: payment.id });
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

const paymentSchema = z.object({ amount: amount, method: z.enum(paymentMethodValues).default('OTHER'), status: z.enum(['PENDING', 'CONFIRMED']).optional(), reference: z.string().trim().max(200).optional(), receivedAt: optionalDate, notes: z.string().trim().max(1000).optional() });

router.get('/invoices/:id/payments', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await requireInvoice(req, req.params.id);
  const data = await prisma.payment.findMany({ where: { companyId: req.companyId, invoiceId: req.params.id }, orderBy: { createdAt: 'desc' } });
  sendData(res, normalize(data));
}));

router.post('/invoices/:id/payments', requireRole(...adminRoles), validate(idParam, 'params'), validate(paymentSchema), asyncHandler(async (req, res) => {
  const invoice = await requireInvoice(req, req.params.id);
  if (invoice.status === 'PAID') throw new AppError(409, 'Invoice is already paid');
  await assertPaymentMethodAllowed(req.companyId, req.body.method);
  const confirmNow = req.body.status === 'CONFIRMED';
  const balance = toDecimal(invoice.balanceDue || invoice.total || invoice.amount);
  if (confirmNow && toDecimal(req.body.amount).greaterThan(balance)) throw new AppError(400, 'Payment exceeds invoice balance');
  let createdPayment = null;
  const data = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({ data: { ...req.body, companyId: req.companyId, branchId: invoice.branchId || null, invoiceId: invoice.id, status: confirmNow ? 'CONFIRMED' : 'PENDING', receivedAt: req.body.receivedAt || new Date(), confirmedAt: confirmNow ? new Date() : null, createdById: req.user.id } });
    createdPayment = payment;
    if (confirmNow) await createReceiptForPayment(tx, payment, invoice);
    return confirmNow ? recalcInvoice(tx, req.companyId, invoice.id) : tx.invoice.findFirst({ where: { id: invoice.id, companyId: req.companyId }, include: invoiceInclude });
  });
  await audit(req, 'CREATE', 'Payment', invoice.id, { status: req.body.status || 'PENDING' });
  if (confirmNow && createdPayment) await notify('PAYMENT_RECEIVED', { companyId: req.companyId, relatedType: 'Payment', relatedId: createdPayment.id });
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
  await notify('PAYMENT_RECEIVED', { companyId: req.companyId, relatedType: 'Payment', relatedId: payment.id });
  sendData(res, normalize(data));
}));

router.post('/payments/:id/refund', requireRole(...adminRoles), validate(idParam, 'params'), validate(refundSchema), asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
  if (!payment) throw notFound('Payment not found');
  if (payment.status === 'REFUNDED') throw new AppError(409, 'Payment is already refunded');
  const refundAmount = req.body.amount || payment.amount;
  if (toDecimal(refundAmount).greaterThan(toDecimal(payment.amount))) throw new AppError(400, 'Refund exceeds original payment amount');
  const approval = await requireApprovalOrProceed(req, { eventType: 'PAYMENT_REFUND', actionKey: 'payment.refund', entityType: 'Payment', entityId: payment.id, branchId: payment.branchId, amount: refundAmount, reason: req.body && req.body.reason });
  if (approval) {
    const refund = await prisma.paymentRefund.create({ data: { companyId: req.companyId, branchId: payment.branchId || null, paymentId: payment.id, invoiceId: payment.invoiceId, approvalRequestId: approval.id, amount: refundAmount, status: 'APPROVAL_REQUIRED', reason: req.body.reason, requestedById: req.user.id } });
    return sendData(res, { ...approvalRequiredPayload(approval), refund: safePaymentRefund(refund) }, 202);
  }
  let providerConnection = null;
  if (req.body.providerConnectionId) providerConnection = await requireActivePaymentProvider(req, null, req.body.providerConnectionId);
  const data = await prisma.$transaction(async (tx) => {
    const refund = await tx.paymentRefund.create({ data: { companyId: req.companyId, branchId: payment.branchId || null, paymentId: payment.id, invoiceId: payment.invoiceId, providerConnectionId: providerConnection && providerConnection.id || null, amount: refundAmount, status: 'PROCESSING', reason: req.body.reason, requestedById: req.user.id } });
    let providerRefund = null;
    if (providerConnection) {
      providerRefund = await createPaymentProvider(providerConnection.provider, { connection: providerConnection }).refundPayment(payment, { amount: refundAmount, reason: req.body.reason });
    }
    const completed = await tx.paymentRefund.update({ where: { id: refund.id }, data: { status: 'REFUNDED', providerRefundId: providerRefund && providerRefund.providerRefundId || null, processedAt: new Date() } });
    if (toDecimal(refundAmount).equals(toDecimal(payment.amount))) await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
    const creditCount = await tx.creditNote.count({ where: { companyId: req.companyId } });
    await tx.creditNote.create({ data: { companyId: req.companyId, invoiceId: payment.invoiceId, paymentRefundId: completed.id, number: 'CN-' + String(creditCount + 1).padStart(4, '0'), amount: refundAmount, status: 'ISSUED', reason: req.body.reason || 'Payment refund' } });
    return completed;
  });
  await recalcInvoice(prisma, req.companyId, payment.invoiceId);
  await audit(req, 'REFUND', 'Payment', payment.id, { refundId: data.id, amount: refundAmount });
  sendData(res, normalize(safePaymentRefund(data)));
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
  return {
    companyId: req.companyId,
    status: { in: activeScheduleStatuses },
    ...(req.user.role === 'WORKER' ? { workerId: req.user.worker ? req.user.worker.id : '__none__' } : {}),
    ...extra
  };
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
  await notify('JOB_SCHEDULED', { companyId: req.companyId, relatedType: 'Job', relatedId: data.job.id });
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
  await notify('JOB_RESCHEDULED', { companyId: req.companyId, relatedType: 'Job', relatedId: data.job.id, context: { oldStartsAt: existing.startsAt } });
  sendData(res, normalize(data.schedule));
}));

router.delete('/schedule/:id', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const existing = await requireScheduleItem(req, req.params.id);
  const data = await prisma.$transaction(async (tx) => {
    const schedule = await tx.scheduleItem.update({ where: { id: existing.id }, data: { status: 'CANCELLED', conflictStatus: 'CLEAR', updatedById: req.user.id }, include: scheduleInclude });
    await tx.scheduleItem.updateMany({ where: { companyId: req.companyId, jobId: existing.jobId, id: { not: existing.id }, status: { in: activeScheduleStatuses } }, data: { status: 'CANCELLED', conflictStatus: 'CLEAR', updatedById: req.user.id } });
    await tx.job.update({ where: { id: existing.jobId }, data: { scheduledStart: null, scheduledEnd: null, workerId: null, status: 'NEW' } });
    return schedule;
  });
  await audit(req, 'DELETE', 'ScheduleItem', data.id, { jobId: existing.jobId });
  sendData(res, normalize(data));
}));

router.post('/jobs/:id/schedule', requireRole(...adminRoles), validate(idParam, 'params'), validate(scheduleWriteSchema.omit({ jobId: true })), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  await ensureQuoteDepositBeforeScheduling(req, job);
  const data = await scheduleJob(req, job, req.body);
  await audit(req, 'SCHEDULE', 'Job', job.id, { scheduleItemId: data.schedule.id });
  await notify('JOB_SCHEDULED', { companyId: req.companyId, relatedType: 'Job', relatedId: data.job.id });
  sendData(res, normalize(data.schedule), 201);
}));

router.post('/jobs/:id/reschedule', requireRole(...adminRoles), validate(idParam, 'params'), validate(scheduleWriteSchema.omit({ jobId: true })), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  await ensureQuoteDepositBeforeScheduling(req, job);
  const existing = await prisma.scheduleItem.findFirst({ where: { companyId: req.companyId, jobId: job.id, status: { in: activeScheduleStatuses } }, orderBy: { startsAt: 'desc' } });
  await prisma.scheduleItem.updateMany({ where: { companyId: req.companyId, jobId: job.id, status: { in: activeScheduleStatuses }, ...(existing ? { id: { not: existing.id } } : {}) }, data: { status: 'RESCHEDULED', conflictStatus: 'CLEAR', updatedById: req.user.id } });
  const data = await scheduleJob(req, job, req.body, { forceNew: true, rescheduleExistingId: existing && existing.id, excludeScheduleId: existing && existing.id });
  await audit(req, 'RESCHEDULE', 'Job', job.id, { fromScheduleItemId: existing && existing.id, scheduleItemId: data.schedule.id });
  await notify('JOB_RESCHEDULED', { companyId: req.companyId, relatedType: 'Job', relatedId: data.job.id, context: { oldStartsAt: existing && existing.startsAt } });
  sendData(res, normalize(data.schedule), 201);
}));

router.post('/jobs/:id/unschedule', requireRole(...adminRoles), validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: false });
  const active = await prisma.scheduleItem.findMany({ where: { companyId: req.companyId, jobId: job.id, status: { notIn: ['CANCELLED', 'COMPLETED'] } } });
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

const photoSchema = z.object({ url: z.string().url().or(z.string().regex(/^\/uploads\/jobs\/proof\/[a-zA-Z0-9._-]+$/)), caption: optionalText(500), category: z.enum(proofCategoryValues).default('GENERAL') });
router.post("/jobs/:id/photos", validate(idParam, "params"), validate(photoSchema), asyncHandler(async (req, res) => {
  const job = await requireJob(req, req.params.id, { assignedOnly: req.user.role === "WORKER" });
  const data = await prisma.$transaction(async (tx) => {
    const photo = await tx.jobProofPhoto.create({ data: { companyId: req.companyId, jobId: job.id, workerId: evidenceWorkerId(req, job), uploadedById: req.user.id, url: req.body.url, filename: path.basename(req.body.url), mimeType: "image/jpeg", sizeBytes: 0, category: req.body.category, caption: req.body.caption } });
    await addJobActivity(tx, req, job, "PROOF_PHOTO_ADDED", req.body.caption, { proofPhotoId: photo.id, category: photo.category, legacyRoute: true });
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
