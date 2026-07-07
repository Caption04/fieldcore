const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-that-is-not-the-dev-fallback';
process.env.NODE_ENV = 'test';
process.env.NOTIFICATION_CHANNELS = 'EMAIL,WHATSAPP';
process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = '1';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value, (key, item) => typeof item === 'bigint' ? Number(item) : item));
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
  return Object.entries(where || {}).every(([key, expected]) => {
    const actual = record[key];

    if (expected === null) {
      return actual === null || actual === undefined;
    }

    if (expected instanceof Date) {
      return new Date(actual).getTime() === expected.getTime();
    }

    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (!(key in record)) {
        return Object.entries(expected).every(([compoundKey, compoundValue]) => record[compoundKey] === compoundValue);
      }

      if ('not' in expected) {
        if (expected.not === null) return actual !== null && actual !== undefined;
        return actual !== expected.not;
      }

      if ('in' in expected) return expected.in.includes(actual);
      if ('gte' in expected && !(new Date(actual) >= new Date(expected.gte))) return false;
      if ('lte' in expected && !(new Date(actual) <= new Date(expected.lte))) return false;
      if ('gt' in expected && !(new Date(actual) > new Date(expected.gt))) return false;
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
  function planById(planId) { return db.saaSPlans.find((item) => item.id === planId); }
  function brandingByCompanyId(companyId) { return db.companyBrandings.find((item) => item.companyId === companyId); }
  function userById(userId) { return db.users.find((item) => item.id === userId); }
  function customerById(customerId) { return db.customers.find((item) => item.id === customerId); }
  function clientAccountById(accountId) { return db.clientAccounts.find((item) => item.id === accountId); }
  function serviceById(serviceId) { return db.services.find((item) => item.id === serviceId); }
  function propertyById(propertyId) { return db.customerProperties.find((item) => item.id === propertyId); }
  function workerById(workerId) { return db.workerProfiles.find((item) => item.id === workerId); }
  function roleById(roleId) { return db.workerRoles.find((item) => item.id === roleId); }
  function jobById(jobId) { return db.jobs.find((item) => item.id === jobId); }
  function assetById(assetId) { return db.assets.find((item) => item.id === assetId); }
  function contractById(contractId) { return db.serviceContracts.find((item) => item.id === contractId); }
  function inventoryItemById(itemId) { return db.inventoryItems.find((item) => item.id === itemId); }
  function stockLocationById(locationId) { return db.stockLocations.find((item) => item.id === locationId); }
  function supplierById(supplierId) { return db.suppliers.find((item) => item.id === supplierId); }
  function purchaseRequestById(requestId) { return db.purchaseRequests.find((item) => item.id === requestId); }
  function purchaseOrderById(orderId) { return db.purchaseOrders.find((item) => item.id === orderId); }
  function branchById(branchId) { return db.branches.find((item) => item.id === branchId); }
  function userByIdSafe(userId) { return db.users.find((item) => item.id === userId); }
  function invoiceById(invoiceId) { return db.invoices.find((item) => item.id === invoiceId); }
  function quoteLineItems(quoteId) { return db.quoteLineItems.filter((item) => item.quoteId === quoteId); }
  function invoiceLineItems(invoiceId) { return db.invoiceLineItems.filter((item) => item.invoiceId === invoiceId); }
  function receiptByPaymentId(paymentId) { return db.receipts.find((item) => item.paymentId === paymentId); }
  function paymentById(paymentId) { return db.payments.find((item) => item.id === paymentId); }
  function completionLocationByJobId(jobId) { return db.jobCompletionLocations.find((item) => item.jobId === jobId); }
  function integrationSecretsByConnectionId(connectionId) { return db.integrationSecrets.filter((item) => item.integrationConnectionId === connectionId); }

  function enrichCompany(company, include) {
    if (!company) return null;
    const result = { ...company };
    if (include && include.branding) result.branding = clone(brandingByCompanyId(company.id)) || null;
    return result;
  }

  function enrichSubscription(subscription, include) {
    if (!subscription) return null;
    const result = { ...subscription };
    if (include && include.plan) result.plan = clone(planById(subscription.planId)) || null;
    return result;
  }

  function enrichUser(user) {
    if (!user) return null;
    return { ...user, company: companyById(user.companyId), worker: enrichWorker(db.workerProfiles.find((worker) => worker.userId === user.id) || null, { role: true }) };
  }

  function enrichWorker(worker, include) {
    if (!worker) return null;
    const result = { ...worker };
    if (include && include.branch) result.branch = clone(branchById(worker.branchId)) || null;
    if (include && include.user) result.user = include.user.select ? applySelect(userById(worker.userId), include.user.select) : clone(userById(worker.userId));
    return result;
  }

  function enrichJob(job, include) {
    if (!job) return null;
    const result = { ...job };
    if (include && include.branch) result.branch = clone(branchById(job.branchId)) || null;
    if (include && include.customer) result.customer = clone(customerById(job.customerId));
    if (include && include.service) result.service = clone(serviceById(job.serviceId));
    if (include && include.contract) result.contract = clone(contractById(job.contractId)) || null;
    if (include && include.worker) result.worker = enrichWorker(workerById(job.workerId), include.worker.include);
    if (include && include.jobAssets) result.jobAssets = db.jobAssets.filter((item) => item.jobId === job.id).map((item) => enrichJobAsset(item, include.jobAssets.include));
    if (include && include.proofPhotos) result.proofPhotos = db.jobProofPhotos.filter((photo) => photo.jobId === job.id);
    if (include && include.signature) result.signature = db.jobSignatures.find((signature) => signature.jobId === job.id) || null;
    if (include && include.completionLocation) result.completionLocation = clone(completionLocationByJobId(job.id)) || null;
    if (include && include.checklistAnswers) result.checklistAnswers = db.jobChecklistAnswers.filter((answer) => answer.jobId === job.id).map((answer) => ({ ...answer, item: db.jobChecklistItems.find((item) => item.id === answer.itemId) || null, template: db.jobChecklistTemplates.find((template) => template.id === answer.templateId) || null }));
    if (include && include.completedBy) result.completedBy = include.completedBy.select ? applySelect(userById(job.completedById), include.completedBy.select) : clone(userById(job.completedById));
    return result;
  }

  function enrichAsset(asset, include) {
    if (!asset) return null;
    const result = { ...asset };
    if (include && include.branch) result.branch = clone(branchById(asset.branchId)) || null;
    if (include && include.customer) result.customer = clone(customerById(asset.customerId));
    if (include && include.property) result.property = clone(propertyById(asset.propertyId)) || null;
    if (include && include.service) result.service = clone(serviceById(asset.serviceId)) || null;
    if (include && include.jobAssets) result.jobAssets = db.jobAssets.filter((item) => item.assetId === asset.id).map((item) => enrichJobAsset(item, include.jobAssets.include));
    if (include && include.serviceContractAssets) result.serviceContractAssets = db.serviceContractAssets.filter((item) => item.assetId === asset.id).map((item) => enrichServiceContractAsset(item, include.serviceContractAssets.include));
    return result;
  }

  function enrichJobAsset(link, include) {
    if (!link) return null;
    const result = { ...link };
    if (include && include.asset) result.asset = enrichAsset(assetById(link.assetId), include.asset.include);
    if (include && include.job) result.job = enrichJob(jobById(link.jobId), include.job.include);
    return result;
  }

  function enrichServiceContract(contract, include) {
    if (!contract) return null;
    const result = { ...contract };
    if (include && include.branch) result.branch = clone(branchById(contract.branchId)) || null;
    if (include && include.customer) result.customer = clone(customerById(contract.customerId));
    if (include && include.property) result.property = clone(propertyById(contract.propertyId)) || null;
    if (include && include.assets) result.assets = db.serviceContractAssets.filter((item) => item.contractId === contract.id).map((item) => enrichServiceContractAsset(item, include.assets.include));
    if (include && include.serviceLines) result.serviceLines = db.contractServiceLines.filter((item) => item.contractId === contract.id).map((item) => enrichContractServiceLine(item, include.serviceLines.include));
    if (include && include.jobs) result.jobs = db.jobs.filter((item) => item.contractId === contract.id).map((item) => enrichJob(item, include.jobs.include));
    return result;
  }

  function enrichServiceContractAsset(link, include) {
    if (!link) return null;
    const result = { ...link };
    if (include && include.asset) result.asset = enrichAsset(assetById(link.assetId), include.asset.include);
    if (include && include.contract) result.contract = clone(contractById(link.contractId));
    return result;
  }

  function enrichContractServiceLine(line, include) {
    if (!line) return null;
    const result = { ...line };
    if (include && include.service) result.service = clone(serviceById(line.serviceId)) || null;
    return result;
  }


  function enrichInventoryItem(item, include) {
    if (!item) return null;
    const result = { ...item };
    if (include && include.stocks) result.stocks = db.inventoryStocks.filter((stock) => stock.itemId === item.id).map((stock) => enrichInventoryStock(stock, include.stocks.include));
    return result;
  }

  function enrichInventoryStock(stock, include) {
    if (!stock) return null;
    const result = { ...stock };
    if (include && include.item) result.item = clone(inventoryItemById(stock.itemId));
    if (include && include.location) result.location = clone(stockLocationById(stock.locationId));
    return result;
  }

  function enrichStockMovement(movement, include) {
    if (!movement) return null;
    const result = { ...movement };
    if (include && include.item) result.item = clone(inventoryItemById(movement.itemId));
    if (include && include.location) result.location = clone(stockLocationById(movement.locationId));
    if (include && include.job) result.job = clone(jobById(movement.jobId));
    if (include && include.purchaseOrder) result.purchaseOrder = clone(purchaseOrderById(movement.purchaseOrderId));
    if (include && include.createdBy) result.createdBy = include.createdBy.select ? applySelect(userById(movement.createdById), include.createdBy.select) : clone(userById(movement.createdById));
    return result;
  }

  function enrichJobPartUsage(part, include) {
    if (!part) return null;
    const result = { ...part };
    if (include && include.item) result.item = clone(inventoryItemById(part.itemId));
    if (include && include.location) result.location = clone(stockLocationById(part.locationId));
    if (include && include.worker) result.worker = enrichWorker(workerById(part.workerId), include.worker.include);
    return result;
  }

  function enrichPurchaseRequest(request, include) {
    if (!request) return null;
    const result = { ...request };
    if (include && include.job) result.job = clone(jobById(request.jobId));
    if (include && include.requestedBy) result.requestedBy = include.requestedBy.select ? applySelect(userById(request.requestedById), include.requestedBy.select) : clone(userById(request.requestedById));
    if (include && include.purchaseOrders) result.purchaseOrders = db.purchaseOrders.filter((order) => order.purchaseRequestId === request.id).map((order) => enrichPurchaseOrder(order, include.purchaseOrders.include));
    return result;
  }

  function enrichPurchaseOrder(order, include) {
    if (!order) return null;
    const result = { ...order };
    if (include && include.supplier) result.supplier = clone(supplierById(order.supplierId));
    if (include && include.purchaseRequest) result.purchaseRequest = clone(purchaseRequestById(order.purchaseRequestId));
    if (include && include.lines) result.lines = db.purchaseOrderLines.filter((line) => line.purchaseOrderId === order.id).map((line) => enrichPurchaseOrderLine(line, include.lines.include));
    return result;
  }

  function enrichPurchaseOrderLine(line, include) {
    if (!line) return null;
    const result = { ...line };
    if (include && include.item) result.item = clone(inventoryItemById(line.itemId));
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
    if (include && include.paymentLinks) result.paymentLinks = db.paymentLinks.filter((link) => link.invoiceId === invoice.id);
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
    if (include && include.photos) result.photos = db.bookingRequestPhotos.filter((photo) => photo.bookingRequestId === request.id);
    if (include && include.clientAccount) {
      const account = clone(clientAccountById(request.clientAccountId)) || null;
      result.clientAccount = include.clientAccount.select ? applySelect(account, include.clientAccount.select) : account;
    }
    return result;
  }

  function enrichIntegrationConnection(connection, include) {
    if (!connection) return null;
    const result = { ...connection };
    if (include && include.secrets) {
      const secrets = integrationSecretsByConnectionId(connection.id);
      result.secrets = include.secrets.select ? secrets.map((secret) => applySelect(secret, include.secrets.select)) : clone(secrets);
    }
    return result;
  }

  function enrichPayment(payment, include) {
    if (!payment) return null;
    const result = { ...payment };
    if (include && include.receipt) result.receipt = clone(receiptByPaymentId(payment.id)) || null;
    return result;
  }


  function enrichApprovalRequest(request, include) {
    if (!request) return null;
    const result = { ...request };
    if (include && include.policy) result.policy = clone(db.approvalPolicies.find((item) => item.id === request.policyId)) || null;
    if (include && include.requestedBy) result.requestedBy = include.requestedBy.select ? applySelect(userByIdSafe(request.requestedById), include.requestedBy.select) : clone(userByIdSafe(request.requestedById));
    if (include && include.approvedBy) result.approvedBy = include.approvedBy.select ? applySelect(userByIdSafe(request.approvedById), include.approvedBy.select) : clone(userByIdSafe(request.approvedById));
    return result;
  }

  function enrichReceipt(receipt, include) {
    if (!receipt) return null;
    const result = { ...receipt };
    if (include && include.invoice) result.invoice = clone(invoiceById(receipt.invoiceId)) || null;
    if (include && include.payment) result.payment = clone(paymentById(receipt.paymentId)) || null;
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
      updateMany: (args) => {
        let count = 0;
        db[name] = db[name].map((item) => {
          if (!matchesWhere(item, args.where)) return item;
          count += 1;
          return { ...item, ...stripUndefined(args.data), updatedAt: new Date().toISOString() };
        });
        return Promise.resolve({ count });
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
      findMany: (args = {}) => Promise.resolve(list('users', args, (user) => args.select ? applySelect(user, args.select) : user)),
      count: (args = {}) => Promise.resolve(db.users.filter((record) => matchesWhere(record, args.where)).length),
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
    saaSPlan: makeModel('saaSPlans'),
    companySubscription: makeModel('companySubscriptions', enrichSubscription),
    saaSBillingEvent: makeModel('saaSBillingEvents'),
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
    companyFinanceSettings: makeModel('companyFinanceSettings'),
    financeIntegration: makeModel('financeIntegrations'),
    financeIntegrationSecret: makeModel('financeIntegrationSecrets'),
    financeMapping: makeModel('financeMappings'),
    financeSyncLog: makeModel('financeSyncLogs'),
    financeWebhookEvent: makeModel('financeWebhookEvents'),
    externalRecordLink: makeModel('externalRecordLinks'),
    financeExportLog: makeModel('financeExportLogs'),
    paymentProviderConnection: makeModel('paymentProviderConnections'),
    paymentProviderSecret: makeModel('paymentProviderSecrets'),
    paymentLink: makeModel('paymentLinks'),
    paymentProviderEvent: makeModel('paymentProviderEvents'),
    paymentReconciliationItem: makeModel('paymentReconciliationItems'),
    paymentRefund: makeModel('paymentRefunds'),
    creditNote: makeModel('creditNotes'),
    collectionReminderRule: makeModel('collectionReminderRules'),
    collectionReminderLog: makeModel('collectionReminderLogs'),
    branch: makeModel('branches'),
    permissionRoleTemplate: makeModel('permissionRoleTemplates'),
    userPermissionOverride: makeModel('userPermissionOverrides'),
    userBranchAccess: makeModel('userBranchAccesses'),
    approvalPolicy: makeModel('approvalPolicies'),
    approvalRequest: makeModel('approvalRequests', enrichApprovalRequest),
    customer: makeModel('customers'),
    workerProfile: makeModel('workerProfiles', enrichWorker),
    service: makeModel('services'),
    supplier: makeModel('suppliers'),
    stockLocation: makeModel('stockLocations'),
    inventoryItem: makeModel('inventoryItems', enrichInventoryItem),
    inventoryStock: makeModel('inventoryStocks', enrichInventoryStock),
    stockMovement: makeModel('stockMovements', enrichStockMovement),
    jobPartUsage: makeModel('jobPartUsages', enrichJobPartUsage),
    purchaseRequest: makeModel('purchaseRequests', enrichPurchaseRequest),
    purchaseOrder: {
      ...makeModel('purchaseOrders', enrichPurchaseOrder),
      create: async (args) => {
        const lineCreate = args.data.lines && args.data.lines.create || [];
        const record = { id: args.data.id || id('purchaseOrder'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...stripUndefined({ ...args.data, lines: undefined }) };
        db.purchaseOrders.push(record);
        for (const line of lineCreate) db.purchaseOrderLines.push({ id: id('purchaseOrderLine'), purchaseOrderId: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt, ...stripUndefined(line) });
        return clone(enrichPurchaseOrder(record, args.include));
      }
    },
    purchaseOrderLine: makeModel('purchaseOrderLines', enrichPurchaseOrderLine),
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
    receipt: makeModel('receipts', enrichReceipt),
    scheduleItem: makeModel('scheduleItems'),
    payment: makeModel('payments', enrichPayment),
    workerLocation: makeModel('workerLocations'),
    jobProofPhoto: makeModel('jobProofPhotos'),
    jobCompletionLocation: makeModel('jobCompletionLocations'),
    bookingRequestPhoto: makeModel('bookingRequestPhotos'),
    jobSignature: makeModel('jobSignatures'),
    bookingRequest: makeModel('bookingRequests', enrichBookingRequest),
    clientAccount: makeModel('clientAccounts'),
    customerProperty: makeModel('customerProperties'),
    notificationLog: makeModel('notificationLogs'),
    integrationConnection: makeModel('integrationConnections', enrichIntegrationConnection),
    integrationSecret: {
      ...makeModel('integrationSecrets'),
      upsert: async (args) => {
        const where = args.where.integrationConnectionId_keyName;
        const index = db.integrationSecrets.findIndex((item) => item.integrationConnectionId === where.integrationConnectionId && item.keyName === where.keyName);
        if (index === -1) {
          const record = { id: id('integrationSecret'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...stripUndefined(args.create) };
          db.integrationSecrets.push(record);
          return clone(record);
        }
        db.integrationSecrets[index] = { ...db.integrationSecrets[index], ...stripUndefined(args.update), updatedAt: new Date().toISOString() };
        return clone(db.integrationSecrets[index]);
      }
    },
    messageLog: makeModel('messageLogs'),
    storageObject: makeModel('storageObjects'),
    workerDevice: makeModel('workerDevices'),
    offlineActionQueue: makeModel('offlineActionQueues'),
    jobChecklistTemplate: makeModel('jobChecklistTemplates', (template, include) => {
      const result = { ...template };
      if (include && include.items) result.items = db.jobChecklistItems.filter((item) => item.templateId === template.id);
      return result;
    }),
    jobChecklistItem: makeModel('jobChecklistItems'),
    jobChecklistAnswer: makeModel('jobChecklistAnswers'),
    storageUsageMonthly: {
      ...makeModel('storageUsageMonthly'),
      upsert: async (args) => {
        const where = args.where.companyId_provider_year_month;
        const index = db.storageUsageMonthly.findIndex((item) => item.companyId === where.companyId && item.provider === where.provider && item.year === where.year && item.month === where.month);
        if (index === -1) {
          const record = { id: id('storageUsageMonthly'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...stripUndefined(args.create) };
          db.storageUsageMonthly.push(record);
          return clone(record);
        }
        const update = { ...args.update };
        if (update.totalBytes && update.totalBytes.increment !== undefined) update.totalBytes = Number(db.storageUsageMonthly[index].totalBytes || 0) + Number(update.totalBytes.increment);
        if (update.objectCount && update.objectCount.increment !== undefined) update.objectCount = Number(db.storageUsageMonthly[index].objectCount || 0) + Number(update.objectCount.increment);
        db.storageUsageMonthly[index] = { ...db.storageUsageMonthly[index], ...stripUndefined(update), updatedAt: new Date().toISOString() };
        return clone(db.storageUsageMonthly[index]);
      }
    },
    jobActivity: makeModel('jobActivities', (activity, include) => {
      const result = { ...activity };
      if (include && include.worker) result.worker = enrichWorker(workerById(activity.workerId), include.worker.include);
      if (include && include.user) result.user = include.user.select ? applySelect(userById(activity.userId), include.user.select) : clone(userById(activity.userId));
      if (include && include.job) result.job = enrichJob(jobById(activity.jobId), include.job.include);
      return result;
    }),
    auditLog: makeModel('auditLogs'),
    asset: makeModel('assets', enrichAsset),
    jobAsset: makeModel('jobAssets', enrichJobAsset),
    serviceContract: makeModel('serviceContracts', enrichServiceContract),
    serviceContractAsset: makeModel('serviceContractAssets', enrichServiceContractAsset),
    contractServiceLine: makeModel('contractServiceLines', enrichContractServiceLine),
    assetIncident: makeModel('assetIncidents'),
    assetComplianceDocument: makeModel('assetComplianceDocuments'),
    contractVisitUsage: makeModel('contractVisitUsages'),
    preventiveMaintenanceRun: makeModel('preventiveMaintenanceRuns'),
    $queryRaw: () => Promise.resolve([{ ok: 1 }]),
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
    companies: [{ id: 'company-a', name: 'Company A', email: 'hello@a.test', phone: '+12025550109' }, { id: 'company-b', name: 'Company B', email: 'hello@b.test', phone: '+12025550209' }],
    saaSPlans: [
      { id: 'starter', name: 'Starter', description: 'Small team plan', price: 49, currency: 'USD', interval: 'month', isActive: true, limits: { maxUsers: 3, maxWorkers: 2, maxClients: 50, maxJobsPerMonth: 100, maxPublicBookingsPerMonth: 50, maxWhatsAppNotificationsPerMonth: 0, maxEmailNotificationsPerMonth: 500 }, features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: false, proofOfWork: true, customBranding: false } },
      { id: 'growth', name: 'Growth', description: 'Growth plan', price: 129, currency: 'USD', interval: 'month', isActive: true, limits: { maxUsers: 12, maxWorkers: 10, maxClients: 500, maxJobsPerMonth: 1000, maxPublicBookingsPerMonth: 400, maxWhatsAppNotificationsPerMonth: 1000, maxEmailNotificationsPerMonth: 5000 }, features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, customBranding: true } },
      { id: 'free-internal', name: 'Free Internal', description: 'Internal/demo', price: 0, currency: 'USD', interval: 'month', isActive: false, limits: { maxUsers: null, maxWorkers: null, maxClients: null, maxJobsPerMonth: null, maxPublicBookingsPerMonth: null, maxWhatsAppNotificationsPerMonth: null, maxEmailNotificationsPerMonth: null }, features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, customBranding: true } }
    ],
    companySubscriptions: [
      { id: 'sub-a', companyId: 'company-a', planId: 'free-internal', status: 'FREE_INTERNAL', trialStartedAt: '2026-01-01T00:00:00.000Z', trialEndsAt: '2027-01-01T00:00:00.000Z', currentPeriodStart: '2026-01-01T00:00:00.000Z', currentPeriodEnd: '2027-01-01T00:00:00.000Z', provider: 'manual', providerCustomerId: 'cus_secret_should_not_return', providerSubId: 'sub_secret_should_not_return', cancelAtPeriodEnd: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'sub-b', companyId: 'company-b', planId: 'growth', status: 'ACTIVE', trialStartedAt: null, trialEndsAt: null, currentPeriodStart: '2026-01-01T00:00:00.000Z', currentPeriodEnd: '2026-02-01T00:00:00.000Z', provider: 'manual', providerCustomerId: 'cus_b_secret', providerSubId: 'sub_b_secret', cancelAtPeriodEnd: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    ],
    saaSBillingEvents: [],
    companyBrandings: [
      { id: 'branding-a', companyId: 'company-a', brandName: 'Brand A', primaryColor: '#111111', secondaryColor: '#222222', accentColor: '#333333', supportEmail: 'support@a.test', supportPhone: '+1 A', invoiceFooter: 'Footer A', invoiceTerms: 'Terms A' },
      { id: 'branding-b', companyId: 'company-b', brandName: 'Brand B', primaryColor: '#444444', secondaryColor: '#555555', accentColor: '#666666', supportEmail: 'support@b.test', supportPhone: '+1 B', invoiceFooter: 'Footer B', invoiceTerms: 'Terms B' }
    ],
    companyFinanceSettings: [],
    financeIntegrations: [],
    financeIntegrationSecrets: [],
    financeMappings: [],
    financeSyncLogs: [],
    financeWebhookEvents: [],
    externalRecordLinks: [],
    financeExportLogs: [],
    paymentProviderConnections: [],
    paymentProviderSecrets: [],
    paymentLinks: [],
    paymentProviderEvents: [],
    paymentReconciliationItems: [],
    paymentRefunds: [],
    creditNotes: [],
    collectionReminderRules: [],
    collectionReminderLogs: [],
    branches: [],
    permissionRoleTemplates: [],
    userPermissionOverrides: [],
    userBranchAccesses: [],
    approvalPolicies: [],
    approvalRequests: [],
    users: [
      { id: 'owner-a', companyId: 'company-a', email: 'owner-a@test.local', phone: '+12025550100', name: 'Owner A', role: 'OWNER', passwordHash: hash },
      { id: 'admin-a', companyId: 'company-a', email: 'admin-a@test.local', phone: '+12025550101', name: 'Admin A', role: 'ADMIN', passwordHash: hash },
      { id: 'worker-a', companyId: 'company-a', email: 'worker-a@test.local', name: 'Worker A', role: 'WORKER', passwordHash: hash },
      { id: 'worker-b', companyId: 'company-a', email: 'worker-b@test.local', name: 'Worker B', role: 'WORKER', passwordHash: hash },
      { id: 'admin-b', companyId: 'company-b', email: 'admin-b@test.local', phone: '+12025550201', name: 'Admin B', role: 'ADMIN', passwordHash: hash },
      { id: 'worker-c', companyId: 'company-b', email: 'worker-c@test.local', name: 'Worker C', role: 'WORKER', passwordHash: hash }
    ],
    workerProfiles: [
      { id: 'wp-a', companyId: 'company-a', userId: 'worker-a', roleId: 'role-tech-a', title: 'Tech', phone: '+12025550110', active: true },
      { id: 'wp-b', companyId: 'company-a', userId: 'worker-b', roleId: 'role-tech-a', title: 'Tech', phone: '+12025550111', active: true },
      { id: 'wp-c', companyId: 'company-b', userId: 'worker-c', roleId: 'role-tech-b', title: 'Tech', phone: '+12025550210', active: true }
    ],
    customers: [
      { id: 'customer-a', companyId: 'company-a', name: 'Customer A', phone: '+12025550120', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'customer-b', companyId: 'company-b', name: 'Customer B', phone: '+12025550220', createdAt: '2026-01-01T00:00:00.000Z' }
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
    jobCompletionLocations: [],
    bookingRequestPhotos: [],
    jobSignatures: [],
    bookingRequests: [],
    clientAccounts: [],
    customerProperties: [],
    assets: [],
    jobAssets: [],
    serviceContracts: [],
    serviceContractAssets: [],
    contractServiceLines: [],
    assetIncidents: [],
    assetComplianceDocuments: [],
    contractVisitUsages: [],
    preventiveMaintenanceRuns: [],
    suppliers: [],
    stockLocations: [],
    inventoryItems: [],
    inventoryStocks: [],
    stockMovements: [],
    jobPartUsages: [],
    purchaseRequests: [],
    purchaseOrders: [],
    purchaseOrderLines: [],
    notificationLogs: [],
    integrationConnections: [],
    integrationSecrets: [],
    messageLogs: [],
    storageObjects: [],
    storageUsageMonthly: [],
    workerDevices: [],
    offlineActionQueues: [],
    jobChecklistTemplates: [],
    jobChecklistItems: [],
    jobChecklistAnswers: [],
    jobActivities: [],
    auditLogs: []
  };

  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: createMockPrisma(seed) } };
  for (const mod of ['../src/config/env', '../src/services/subscription.service', '../src/services/saasBillingProvider.service', '../src/services/saasBilling.service', '../src/services/reporting.service', '../src/services/emailProvider.service', '../src/services/whatsappProvider.service', '../src/services/phoneNumber.service', '../src/services/notificationTemplates.service', '../src/services/integrations/integrationSecrets.service', '../src/services/integrations/integrationConnections.service', '../src/services/integrations/messageLog.service', '../src/services/integrations/storageUsage.service', '../src/services/integrations/storage.service', '../src/services/integrations/providers/cloudflareR2Storage.provider', '../src/services/notification.service', '../src/auth', '../src/routes/api', '../src/services/payments/paymentProviderRegistry', '../src/services/payments/paymentToken.service', '../src/services/payments/reconciliation.service', '../src/services/payments/providers/manual.provider', '../src/services/payments/providers/payfast.provider', '../src/services/payments/providers/yoco.provider', '../src/services/payments/providers/ozow.provider', '../src/app']) {
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

async function loginClient(app, overrides = {}) {
  const email = overrides.email || 'linked-client@test.local';
  const password = overrides.password || 'ClientPass123!';
  if (!app.locals.testDb.clientAccounts.some((item) => item.email === email)) {
    app.locals.testDb.clientAccounts.push({
      id: overrides.id || 'client-' + email.replace(/[^a-z0-9]/gi, '-'),
      companyId: overrides.companyId || 'company-a',
      customerId: overrides.customerId === undefined ? 'customer-a' : overrides.customerId,
      name: overrides.name || 'Linked Client',
      email,
      phone: overrides.phone || '0770000000',
      passwordHash: await bcrypt.hash(password, 4),
      status: overrides.status || 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
  }
  const agent = request.agent(app);
  const response = await agent.post('/api/client/auth/login').send({ email, password });
  assert.equal(response.status, 200);
  assertNoPasswordHash(response.body);
  return agent;
}

function assertNoPasswordHash(value) {
  assert.equal(JSON.stringify(value).includes('passwordHash'), false, 'response leaked passwordHash');
}

test('phase 10 env validation health readiness and safe errors', async () => {
  const { validateEnv } = require('../src/config/env');
  const production = validateEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://db', JWT_SECRET: 'short', APP_BASE_URL: 'https://fieldcore.test', EMAIL_PROVIDER: 'webhook', EMAIL_FROM: '' });
  assert.equal(production.ok, false);
  assert.equal(JSON.stringify(production.errors).includes('short'), false);

  const testEnv = validateEnv({ NODE_ENV: 'test' });
  assert.equal(testEnv.ok, true);

  const app = await buildApp();
  const health = await request(app).get('/healthz');
  const ready = await request(app).get('/readyz');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'alive');
  assert.equal(ready.status, 200);
  assert.equal(ready.body.status, 'ready');

  const { AppError, errorHandler } = require('../src/errors');
  const response = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  errorHandler(new Error('password=secret-token'), { method: 'GET', path: '/boom' }, response, () => {});
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error.message, 'Something went wrong.');
  assert.equal(JSON.stringify(response.body).includes('secret-token'), false);
  assert.equal(JSON.stringify(response.body).includes('stack'), false);

  const appErrorResponse = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  errorHandler(new AppError(403, 'Forbidden'), { method: 'GET', path: '/nope' }, appErrorResponse, () => {});
  assert.equal(appErrorResponse.statusCode, 403);
  assert.equal(appErrorResponse.body.error.message, 'Forbidden');
});

test('phase 10 rate limits high-risk public and auth routes safely', async () => {
  const previous = {
    RATE_LIMIT_AUTH_MAX: process.env.RATE_LIMIT_AUTH_MAX,
    RATE_LIMIT_AUTH_WINDOW_MS: process.env.RATE_LIMIT_AUTH_WINDOW_MS,
    RATE_LIMIT_TRACKING_MAX: process.env.RATE_LIMIT_TRACKING_MAX,
    RATE_LIMIT_TRACKING_WINDOW_MS: process.env.RATE_LIMIT_TRACKING_WINDOW_MS
  };
  process.env.RATE_LIMIT_AUTH_MAX = '1';
  process.env.RATE_LIMIT_AUTH_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_TRACKING_MAX = '1';
  process.env.RATE_LIMIT_TRACKING_WINDOW_MS = '60000';
  try {
    const app = await buildApp();
    const firstLogin = await request(app).post('/api/auth/login').send({ email: 'missing@test.local', password: 'bad' });
    const limitedLogin = await request(app).post('/api/auth/login').send({ email: 'missing@test.local', password: 'bad' });
    assert.equal(firstLogin.status, 401);
    assert.equal(limitedLogin.status, 429);
    assert.equal(limitedLogin.body.error.message, 'Too many auth attempts. Try again later.');

    const firstTrack = await request(app).post('/api/public/booking-requests/track').send({ reference: 'REQ-UNKNOWN', contact: 'guess@test.local' });
    const limitedTrack = await request(app).post('/api/public/booking-requests/track').send({ reference: 'REQ-UNKNOWN', contact: 'guess@test.local' });
    assert.equal(firstTrack.status, 404);
    assert.equal(limitedTrack.status, 429);
    assert.equal(JSON.stringify(limitedTrack.body).includes('passwordHash'), false);
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('phase 10 audit logs and system status are admin scoped and secret safe', async () => {
  const app = await buildApp();
  app.locals.testDb.auditLogs.push(
    { id: 'audit-a', companyId: 'company-a', userId: 'admin-a', action: 'SEND', entity: 'Quote', entityId: 'quote-a', metadata: { token: 'private-token' }, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'audit-b', companyId: 'company-b', userId: 'admin-b', action: 'DELETE', entity: 'Customer', entityId: 'customer-b', metadata: { passwordHash: 'nope' }, createdAt: '2026-01-02T00:00:00.000Z' }
  );
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');

  const logs = await admin.get('/api/audit-logs');
  assert.equal(logs.status, 200);
  assert.equal(logs.body.data.some((item) => item.id === 'audit-a'), true);
  assert.equal(logs.body.data.some((item) => item.id === 'audit-b'), false);
  assert.equal(JSON.stringify(logs.body).includes('private-token'), false);
  assertNoPasswordHash(logs.body);

  const blocked = await worker.get('/api/audit-logs');
  assert.equal(blocked.status, 403);

  const publicBlocked = await request(app).get('/api/audit-logs');
  assert.equal(publicBlocked.status, 401);

  const status = await admin.get('/api/system/status');
  assert.equal(status.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(status.body.data, 'database'), true);
  assert.equal(JSON.stringify(status.body).includes(process.env.JWT_SECRET), false);
});

test('phase 10 demo reset refuses unsafe invocation', async () => {
  const prod = spawnSync(process.execPath, ['scripts/demo-reset.js', '--yes'], { cwd: __dirname + '/..', env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' });
  assert.notEqual(prod.status, 0);
  assert.equal((prod.stderr + prod.stdout).includes('production'), true);

  const unconfirmed = spawnSync(process.execPath, ['scripts/demo-reset.js'], { cwd: __dirname + '/..', env: { ...process.env, NODE_ENV: 'development', ALLOW_DEMO_RESET: '' }, encoding: 'utf8' });
  assert.notEqual(unconfirmed.status, 0);
  assert.equal((unconfirmed.stderr + unconfirmed.stdout).includes('--yes'), true);
});

test('phase 11 billing plans and subscription are scoped and secret safe', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');
  const adminB = await login(app, 'admin-b@test.local');
  const client = await loginClient(app);

  const plans = await admin.get('/api/billing/plans');
  assert.equal(plans.status, 200);
  assert.deepEqual(plans.body.data.map((item) => item.id).sort(), ['growth', 'starter']);
  assert.equal(plans.body.data.some((item) => item.id === 'free-internal'), false);

  const subscription = await owner.get('/api/billing/subscription');
  assert.equal(subscription.status, 200);
  assert.equal(subscription.body.data.subscription.status, 'FREE_INTERNAL');
  assert.equal(subscription.body.data.plan.id, 'free-internal');
  assert.equal(JSON.stringify(subscription.body).includes('cus_secret_should_not_return'), false);
  assert.equal(JSON.stringify(subscription.body).includes('sub_secret_should_not_return'), false);
  assertNoPasswordHash(subscription.body);

  const subscriptionB = await adminB.get('/api/billing/subscription');
  assert.equal(subscriptionB.status, 200);
  assert.equal(subscriptionB.body.data.subscription.status, 'ACTIVE');
  assert.equal(JSON.stringify(subscriptionB.body).includes('sub-a'), false);

  assert.equal((await worker.get('/api/billing/subscription')).status, 403);
  assert.equal((await client.get('/api/billing/subscription')).status, 401);
  assert.equal((await request(app).get('/api/billing/subscription')).status, 401);
});

test('phase 11 trial usage limits and feature gates are enforced safely', async () => {
  const app = await buildApp();
  app.locals.testDb.companySubscriptions[0] = {
    ...app.locals.testDb.companySubscriptions[0],
    planId: 'starter',
    status: 'TRIALING',
    trialStartedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
  };
  const owner = await login(app, 'owner-a@test.local');
  const usage = await owner.get('/api/billing/usage');
  assert.equal(usage.status, 200);
  assert.equal(usage.body.data.users, 4);
  assert.equal(usage.body.data.workers, 2);
  assert.equal(usage.body.data.clients, 0);

  const subscription = await owner.get('/api/billing/subscription');
  assert.equal(subscription.body.data.subscription.status, 'TRIALING');
  assert.equal(subscription.body.data.subscription.trialDaysRemaining > 0, true);

  const workerLimit = await owner.post('/api/workers').send({ name: 'Limit Worker', email: 'limit-worker@test.local', password: 'Password123!', title: 'Tech' });
  assert.equal(workerLimit.status, 403);
  assert.equal(workerLimit.body.error.message.includes('maxUsers') || workerLimit.body.error.message.includes('maxWorkers'), true);
  assertNoPasswordHash(workerLimit.body);

  app.locals.testDb.companySubscriptions[0].trialEndsAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const blockedBooking = await request(app).post('/api/public/booking-requests').send({ customerName: 'Expired Trial', customerPhone: '+12025550133', address: 'Expired Address', serviceId: 'service-a' });
  assert.equal(blockedBooking.status, 403);
  assert.equal(JSON.stringify(blockedBooking.body).includes('company-b'), false);
});

test('phase 11 SaaS billing actions are owner-only and do not fake paid status', async () => {
  const previousProvider = process.env.SAAS_BILLING_PROVIDER;
  delete process.env.SAAS_BILLING_PROVIDER;
  try {
    let app = await buildApp();
    const owner = await login(app, 'owner-a@test.local');
    const missingProvider = await owner.post('/api/billing/checkout').send({ planId: 'growth' });
    assert.equal(missingProvider.status, 503);
    assert.equal(JSON.stringify(missingProvider.body).includes('STRIPE_SECRET_KEY'), false);

    process.env.SAAS_BILLING_PROVIDER = 'manual';
    app = await buildApp();
    const manualOwner = await login(app, 'owner-a@test.local');
    const admin = await login(app, 'admin-a@test.local');
    const worker = await login(app, 'worker-a@test.local');

    const checkout = await manualOwner.post('/api/billing/checkout').send({ planId: 'growth' });
    assert.equal(checkout.status, 202);
    assert.equal(checkout.body.data.mode, 'manual');
    assert.equal(checkout.body.data.checkoutUrl, null);
    assert.equal(JSON.stringify(checkout.body).includes('STRIPE_SECRET_KEY'), false);

    const changed = await manualOwner.post('/api/billing/change-plan').send({ planId: 'growth' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.planId, 'growth');
    assert.notEqual(changed.body.data.status, 'ACTIVE');
    assert.equal(app.locals.testDb.saaSBillingEvents.some((item) => item.eventType === 'PLAN_CHANGED'), true);

    const adminChange = await admin.post('/api/billing/change-plan').send({ planId: 'business' });
    assert.equal(adminChange.status, 403);
    const workerCancel = await worker.post('/api/billing/cancel').send({});
    assert.equal(workerCancel.status, 403);

    const cancelled = await manualOwner.post('/api/billing/cancel').send({});
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.cancelAtPeriodEnd, true);
  } finally {
    if (previousProvider === undefined) delete process.env.SAAS_BILLING_PROVIDER;
    else process.env.SAAS_BILLING_PROVIDER = previousProvider;
  }
});

test('phase 11 WhatsApp and client portal gates log or block by plan', async () => {
  const app = await buildApp();
  app.locals.testDb.companySubscriptions[0] = { ...app.locals.testDb.companySubscriptions[0], planId: 'starter', status: 'ACTIVE', trialEndsAt: null };
  app.locals.testDb.customers[0].phone = '+12025550120';
  const admin = await login(app, 'admin-a@test.local');
  const quote = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Plan Gate Quote', amount: 40 });
  await admin.post('/api/quotes/' + quote.body.data.id + '/send').send({});
  const skipped = app.locals.testDb.notificationLogs.find((item) => item.channel === 'WHATSAPP' && item.relatedId === quote.body.data.id);
  assert.equal(skipped.status, 'SKIPPED');
  assert.equal(skipped.error.includes('whatsappNotifications'), true);

  app.locals.testDb.clientAccounts.push({ id: 'client-plan-gate', companyId: 'company-a', customerId: 'customer-a', name: 'Plan Gate Client', email: 'linked-client@test.local', phone: '0770000000', passwordHash: await bcrypt.hash('ClientPass123!', 4), status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  app.locals.testDb.saaSPlans.find((item) => item.id === 'starter').features.clientPortal = false;
  const loginResponse = await request(app).post('/api/client/auth/login').send({ email: 'linked-client@test.local', password: 'ClientPass123!' });
  assert.equal(loginResponse.status, 403);
  assertNoPasswordHash(loginResponse.body);
});

function seedReportData(app) {
  app.locals.testDb.jobs[0] = { ...app.locals.testDb.jobs[0], status: 'COMPLETED', startedAt: '2026-01-05T08:00:00.000Z', completedAt: '2026-01-05T10:00:00.000Z', requiresProofPhotos: true };
  app.locals.testDb.jobProofPhotos.push({ id: 'report-photo-a', companyId: 'company-a', jobId: 'job-a', workerId: 'wp-a', uploadedById: 'worker-a', url: '/uploads/jobs/proof/report-photo.jpg', filename: 'report-photo.jpg', mimeType: 'image/jpeg', sizeBytes: 10, category: 'GENERAL', createdAt: '2026-01-05T09:00:00.000Z' });
  app.locals.testDb.customers.push({ id: 'customer-report', companyId: 'company-a', name: '=Formula Customer', phone: '+12025550144', createdAt: '2026-01-04T00:00:00.000Z' });
  app.locals.testDb.invoices[0] = { ...app.locals.testDb.invoices[0], status: 'PARTIALLY_PAID', balanceDue: 20, dueDate: '2026-01-03T00:00:00.000Z' };
  app.locals.testDb.invoices.push(
    { id: 'invoice-paid-report', companyId: 'company-a', customerId: 'customer-report', serviceId: 'service-a', jobId: 'job-a', number: 'INV-RPT-PAID', status: 'PAID', amount: 50, subtotal: 50, total: 50, balanceDue: 0, paidAt: '2026-01-10T00:00:00.000Z', createdAt: '2026-01-08T00:00:00.000Z' },
    { id: 'invoice-unpaid-formula', companyId: 'company-a', customerId: 'customer-report', serviceId: 'service-a', jobId: 'job-a', number: 'INV-FORMULA', status: 'SENT', amount: 10, subtotal: 10, total: 10, balanceDue: 10, dueDate: '2026-01-11T00:00:00.000Z', createdAt: '2026-01-11T00:00:00.000Z' },
    { id: 'invoice-b-report', companyId: 'company-b', customerId: 'customer-b', serviceId: 'service-b', jobId: 'job-b', number: 'INV-B-RPT', status: 'PAID', amount: 999, subtotal: 999, total: 999, balanceDue: 0, paidAt: '2026-01-10T00:00:00.000Z', createdAt: '2026-01-08T00:00:00.000Z' }
  );
  app.locals.testDb.payments.push(
    { id: 'payment-report-a', companyId: 'company-a', invoiceId: 'invoice-a', amount: 80, method: 'CASH', status: 'CONFIRMED', receivedAt: '2026-01-05T00:00:00.000Z', createdAt: '2026-01-05T00:00:00.000Z', reference: 'SAFE-RPT' },
    { id: 'payment-report-paid', companyId: 'company-a', invoiceId: 'invoice-paid-report', amount: 50, method: 'CASH', status: 'CONFIRMED', receivedAt: '2026-01-10T00:00:00.000Z', createdAt: '2026-01-10T00:00:00.000Z', reference: 'SAFE-RPT-2' },
    { id: 'payment-report-b', companyId: 'company-b', invoiceId: 'invoice-b-report', amount: 999, method: 'CASH', status: 'CONFIRMED', receivedAt: '2026-01-10T00:00:00.000Z', createdAt: '2026-01-10T00:00:00.000Z', reference: 'SECRET-B' }
  );
  app.locals.testDb.quotes.push(
    { id: 'quote-report-accepted', companyId: 'company-a', customerId: 'customer-report', serviceId: 'service-a', title: 'Accepted Report Quote', status: 'ACCEPTED', amount: 50, subtotal: 50, total: 50, acceptedAt: '2026-01-06T00:00:00.000Z', createdAt: '2026-01-04T00:00:00.000Z' },
    { id: 'quote-report-rejected', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', title: 'Rejected Report Quote', status: 'REJECTED', amount: 25, subtotal: 25, total: 25, rejectedAt: '2026-01-07T00:00:00.000Z', createdAt: '2026-01-04T00:00:00.000Z' },
    { id: 'quote-report-draft', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', title: 'Draft Report Quote', status: 'DRAFT', amount: 75, subtotal: 75, total: 75, createdAt: '2026-01-04T00:00:00.000Z' }
  );
  app.locals.testDb.bookingRequests.push(
    { id: 'booking-report-a', companyId: 'company-a', customerId: 'customer-report', serviceId: 'service-a', customerName: '=Formula Customer', customerPhone: '+12025550144', status: 'NEW', source: 'public_booking', createdAt: '2026-01-04T00:00:00.000Z' },
    { id: 'booking-report-b', companyId: 'company-b', customerId: 'customer-b', serviceId: 'service-b', customerName: 'Company B', customerPhone: '+12025550244', status: 'NEW', source: 'public_booking', createdAt: '2026-01-04T00:00:00.000Z' }
  );
}

test('phase 12 reports are admin scoped and secret safe', async () => {
  const app = await buildApp();
  seedReportData(app);
  const owner = await login(app, 'owner-a@test.local');
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');
  const client = await loginClient(app);
  const adminB = await login(app, 'admin-b@test.local');

  const query = '?startDate=2026-01-01&endDate=2026-01-31';
  const ownerReport = await owner.get('/api/reports' + query);
  const adminReport = await admin.get('/api/reports' + query);
  assert.equal(ownerReport.status, 200);
  assert.equal(adminReport.status, 200);
  assert.equal(ownerReport.body.data.revenue.totalRevenue, 130);
  assert.equal(ownerReport.body.data.invoices.unpaidTotal, 30);
  assert.equal(ownerReport.body.data.jobs.completedCount, 1);
  assert.equal(ownerReport.body.data.quotes.acceptedCount, 1);
  assert.equal(ownerReport.body.data.quotes.sentCount, 1);
  assert.equal(ownerReport.body.data.customers.topCustomers.some((item) => item.name === '=Formula Customer'), true);
  assert.equal(JSON.stringify(ownerReport.body).includes('SECRET-B'), false);
  assertNoPasswordHash(ownerReport.body);

  const companyBReport = await adminB.get('/api/reports' + query);
  assert.equal(companyBReport.status, 200);
  assert.equal(companyBReport.body.data.revenue.totalRevenue, 999);
  assert.equal(JSON.stringify(companyBReport.body).includes('payment-report-a'), false);

  assert.equal((await worker.get('/api/reports' + query)).status, 403);
  assert.equal((await client.get('/api/reports' + query)).status, 401);
  assert.equal((await request(app).get('/api/reports' + query)).status, 401);
});

test('phase 12 report filters validate ownership and date ranges', async () => {
  const app = await buildApp();
  seedReportData(app);
  const admin = await login(app, 'admin-a@test.local');

  const serviceFiltered = await admin.get('/api/reports?startDate=2026-01-01&endDate=2026-01-31&serviceId=service-a');
  assert.equal(serviceFiltered.status, 200);
  assert.equal(serviceFiltered.body.data.revenue.totalRevenue, 130);
  assert.equal(serviceFiltered.body.data.services[0].name, 'Service A');

  const badService = await admin.get('/api/reports?startDate=2026-01-01&endDate=2026-01-31&serviceId=service-b');
  assert.equal(badService.status, 404);
  const badDate = await admin.get('/api/reports?startDate=2026-02-01&endDate=2026-01-01');
  assert.equal(badDate.status, 400);
  assertNoPasswordHash(serviceFiltered.body);
});

test('phase 12 CSV exports are protected scoped and formula safe', async () => {
  const app = await buildApp();
  seedReportData(app);
  const owner = await login(app, 'owner-a@test.local');
  const worker = await login(app, 'worker-a@test.local');
  const client = await loginClient(app);
  const query = 'startDate=2026-01-01&endDate=2026-01-31';

  const csv = await owner.get('/api/reports/export?' + query + '&section=invoices');
  assert.equal(csv.status, 200);
  assert.equal(csv.text.includes("'=Formula Customer"), true);
  assert.equal(csv.text.includes('Customer B'), false);
  assert.equal(csv.text.includes('passwordHash'), false);
  assert.equal(csv.text.includes('SECRET-B'), false);
  assert.equal((await worker.get('/api/reports/export?' + query + '&section=invoices')).status, 403);
  assert.equal((await client.get('/api/reports/export?' + query + '&section=invoices')).status, 401);
  assert.equal((await request(app).get('/api/reports/export?' + query + '&section=invoices')).status, 401);
});

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

test('phase 9 proof categories location and summaries are scoped', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');
  const otherWorker = await login(app, 'worker-b@test.local');

  const configured = await admin.patch('/api/jobs/job-a').send({ requiresProofPhotos: true, requiresBeforePhotos: true, requiresAfterPhotos: true, requiresSignature: true, requiresLocation: true });
  assert.equal(configured.status, 200);

  await worker.post('/api/jobs/job-a/arrive').send({});
  await worker.post('/api/jobs/job-a/start').send({});

  const invalidCategory = await worker.post('/api/jobs/job-a/proof-photos').field('category', 'NOT_REAL').attach('photo', Buffer.from('fake'), { filename: 'proof.jpg', contentType: 'image/jpeg' });
  assert.equal(invalidCategory.status, 400);

  const before = await worker.post('/api/jobs/job-a/proof-photos').field('category', 'BEFORE').field('caption', 'Before panel').attach('photo', Buffer.from('before'), { filename: 'before.jpg', contentType: 'image/jpeg' });
  assert.equal(before.status, 201);
  assert.equal(before.body.data.category, 'BEFORE');
  assert.equal(before.body.data.uploadedById, 'worker-a');

  const missingAfter = await worker.post('/api/jobs/job-a/complete').send({ completionNotes: 'Done' });
  assert.equal(missingAfter.status, 409);
  assert.equal(missingAfter.body.error.details.afterPhotos.required, true);
  assert.equal(missingAfter.body.error.details.location.required, true);

  const after = await worker.post('/api/jobs/job-a/proof-photos').field('category', 'AFTER').field('caption', 'After panel').attach('photo', Buffer.from('after'), { filename: 'after.webp', contentType: 'image/webp' });
  const general = await worker.post('/api/jobs/job-a/proof-photos').field('category', 'GENERAL').attach('photo', Buffer.from('general'), { filename: 'general.png', contentType: 'image/png' });
  assert.equal(after.status, 201);
  assert.equal(general.status, 201);

  const badLocation = await worker.post('/api/jobs/job-a/completion-location').send({ latitude: 200, longitude: 20 });
  assert.equal(badLocation.status, 400);

  const location = await worker.post('/api/jobs/job-a/completion-location').send({ latitude: -17.82, longitude: 31.05, accuracy: 12, source: 'WORKER_BROWSER' });
  assert.equal(location.status, 201);
  assert.equal(location.body.data.capturedById, 'worker-a');

  const signature = await worker.post('/api/jobs/job-a/signature').field('signerName', 'Customer A').attach('signature', Buffer.from('signature'), { filename: 'signature.png', contentType: 'image/png' });
  assert.equal(signature.status, 201);
  assert.ok(signature.body.data.createdAt);

  const otherWorkerProof = await otherWorker.post('/api/jobs/job-a/proof-photos').field('category', 'AFTER').attach('photo', Buffer.from('bad'), { filename: 'bad.jpg', contentType: 'image/jpeg' });
  assert.equal(otherWorkerProof.status, 404);

  const completed = await worker.post('/api/jobs/job-a/complete').send({ completionNotes: 'Evidence complete' });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.completedById, 'worker-a');
  assert.equal(completed.body.data.completionEvidence.beforePhotosSatisfied, true);
  assert.equal(completed.body.data.completionEvidence.afterPhotosSatisfied, true);
  assert.equal(completed.body.data.completionEvidence.locationSatisfied, true);

  const completedAgain = await worker.post('/api/jobs/job-a/complete').send({ completionNotes: 'Should not duplicate' });
  assert.equal(completedAgain.status, 200);
  assert.equal(app.locals.testDb.jobActivities.filter((item) => item.jobId === 'job-a' && item.type === 'COMPLETED').length, 1);

  const summary = await admin.get('/api/jobs/job-a/proof-summary');
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.beforePhotoCount, 1);
  assert.equal(summary.body.data.afterPhotoCount, 1);
  assert.equal(summary.body.data.generalProofPhotoCount, 1);
  assert.equal(summary.body.data.location.latitude, -17.82);
  assert.equal(summary.body.data.signedByName, 'Customer A');

  const workerOtherSummary = await worker.get('/api/jobs/job-other-worker/proof-summary');
  assert.equal(workerOtherSummary.status, 404);
  assertNoPasswordHash(summary.body);
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
  const missingAddress = await request(app).post('/api/public/booking-requests').send({ customerName: 'Public Customer', customerEmail: 'public@test.local', serviceId: 'service-a' });
  assert.equal(missingAddress.status, 400);
  app.locals.testDb.services.push({ id: 'service-inactive', companyId: 'company-a', name: 'Inactive Service', active: false, price: 50, createdAt: '2026-01-01T00:00:00.000Z' });
  const inactive = await request(app).post('/api/public/booking-requests').send({ customerName: 'Inactive Request', customerEmail: 'inactive@test.local', address: 'Inactive Address', serviceId: 'service-inactive' });
  assert.equal(inactive.status, 404);
  const services = await request(app).get('/api/public/services');
  assert.equal(services.status, 200);
  assert.deepEqual(Object.keys(services.body.data[0]).sort(), ['basePrice', 'currency', 'description', 'id', 'name', 'taxName']);
  assert.equal(services.body.data.some((service) => service.id === 'service-inactive'), false);
  assertNoPasswordHash(services.body);
});

test('public booking stores phase 8 details and tracks by verified contact only', async () => {
  const app = await buildApp();
  const created = await request(app).post('/api/public/booking-requests').send({
    customerName: 'Track Me',
    customerEmail: 'track@test.local',
    customerPhone: '+1 (202) 555-0135',
    address: '45 Request Road',
    city: 'Greendale',
    propertyType: 'House',
    accessNotes: 'Gate code 1234',
    serviceId: 'service-a',
    preferredDate: '2026-07-20',
    preferredTimeWindow: 'AFTERNOON',
    notes: 'Leak near tank',
    photos: [{ url: '/uploads/booking-requests/request-photo.jpg', filename: 'request-photo.jpg', originalName: 'tank.jpg', mimeType: 'image/jpeg', sizeBytes: 1200 }]
  });
  assert.equal(created.status, 201);
  assert.match(created.body.data.publicReference, /^REQ-/);
  assert.equal(created.body.data.city, 'Greendale');
  assert.equal(created.body.data.propertyType, 'House');
  assert.equal(created.body.data.accessNotes, 'Gate code 1234');
  assert.equal(created.body.data.photos.length, 1);

  const byEmail = await request(app).post('/api/public/booking-requests/track').send({ reference: created.body.data.publicReference, contact: 'track@test.local' });
  assert.equal(byEmail.status, 200);
  assert.equal(byEmail.body.data.reference, created.body.data.publicReference);
  assert.equal(byEmail.body.data.status, 'Submitted');
  assert.equal(byEmail.body.data.service.name, 'Service A');
  assert.equal(Object.prototype.hasOwnProperty.call(byEmail.body.data, 'notes'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(byEmail.body.data, 'photos'), false);
  assert.equal(JSON.stringify(byEmail.body).includes('Gate code'), false);
  assertNoPasswordHash(byEmail.body);

  const byPhone = await request(app).post('/api/public/booking-requests/track').send({ reference: created.body.data.publicReference, contact: '2025550135' });
  assert.equal(byPhone.status, 200);

  const wrongContact = await request(app).post('/api/public/booking-requests/track').send({ reference: created.body.data.publicReference, contact: 'wrong@test.local' });
  assert.equal(wrongContact.status, 404);
  assert.equal(wrongContact.body.error.message, 'Request not found or details do not match.');

  const referenceOnly = await request(app).post('/api/public/booking-requests/track').send({ reference: created.body.data.publicReference });
  assert.equal(referenceOnly.status, 400);

  app.locals.testDb.bookingRequests.push({ id: 'tracking-other-company', companyId: 'company-b', publicReference: created.body.data.publicReference, customerName: 'Other', customerEmail: 'track@test.local', customerPhone: '+12025550135', serviceId: 'service-b', status: 'NEW', createdAt: '2026-01-01T00:00:00.000Z' });
  const stillCompanyA = await request(app).post('/api/public/booking-requests/track').send({ reference: created.body.data.publicReference, contact: 'track@test.local' });
  assert.equal(stillCompanyA.status, 200);
  assert.equal(stillCompanyA.body.data.service.name, 'Service A');
});

test('admin can view phase 8 request details and create a sent quote from request', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');
  const created = await request(app).post('/api/public/booking-requests').send({
    customerName: 'Quote Request',
    customerEmail: 'quote-request@test.local',
    customerPhone: '+12025550136',
    address: 'Quote Address',
    city: 'Quote City',
    propertyType: 'Office',
    accessNotes: 'Reception has keys',
    serviceId: 'service-a',
    preferredDate: '2026-07-21',
    preferredTimeWindow: 'MORNING',
    photos: [{ url: '/uploads/booking-requests/quote-photo.webp', filename: 'quote-photo.webp', mimeType: 'image/webp', sizeBytes: 300 }]
  });
  assert.equal(created.status, 201);

  const workerDetail = await worker.get('/api/booking-requests/' + created.body.data.id);
  assert.equal(workerDetail.status, 403);

  const detail = await admin.get('/api/booking-requests/' + created.body.data.id);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.publicReference, created.body.data.publicReference);
  assert.equal(detail.body.data.city, 'Quote City');
  assert.equal(detail.body.data.photos.length, 1);
  assertNoPasswordHash(detail.body);

  const quote = await admin.post('/api/booking-requests/' + created.body.data.id + '/create-quote').send({});
  assert.equal(quote.status, 201);
  assert.equal(quote.body.data.status, 'SENT');
  assert.equal(quote.body.data.customer.email, 'quote-request@test.local');
  assert.equal(app.locals.testDb.notificationLogs.some((item) => item.eventType === 'QUOTE_SENT' && item.relatedId === quote.body.data.id), true);

  const tracked = await request(app).post('/api/public/booking-requests/track').send({ reference: created.body.data.publicReference, contact: 'quote-request@test.local' });
  assert.equal(tracked.status, 200);
  assert.equal(tracked.body.data.status, 'Quote Sent');
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
  const declineSource = await request(app).post('/api/public/booking-requests').send({ customerName: 'Decline Me', customerPhone: '0772222222', address: 'Decline Address', serviceId: 'service-a' });
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

test('notifications log new public bookings to same-company admins only', async () => {
  const app = await buildApp();
  const response = await request(app).post('/api/public/booking-requests').send({ customerName: 'Notify Booking', customerEmail: 'notify-booking@test.local', customerPhone: '0773330000', address: 'Notify Address', serviceId: 'service-a' });
  assert.equal(response.status, 201);
  const logs = app.locals.testDb.notificationLogs.filter((item) => item.eventType === 'BOOKING_CREATED' && item.channel === 'EMAIL');
  assert.deepEqual(logs.map((item) => item.recipient).sort(), ['admin-a@test.local', 'owner-a@test.local']);
  assert.equal(logs.every((item) => item.companyId === 'company-a'), true);
  assert.equal(logs.some((item) => item.recipient === 'admin-b@test.local'), false);
  assertNoPasswordHash(response.body);
});

test('notification service stubs email provider and records skipped missing recipients', async () => {
  const app = await buildApp();
  const { setEmailProvider } = require('../src/services/emailProvider.service');
  app.locals.testDb.customers[0].email = 'customer-a@test.local';
  setEmailProvider(async () => ({ status: 'SENT' }));
  try {
    const admin = await login(app, 'admin-a@test.local');
    const created = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Notify Quote', amount: 30 });
    assert.equal(created.status, 201);
    const sent = await admin.post('/api/quotes/' + created.body.data.id + '/send').send({});
    assert.equal(sent.status, 200);
    const log = app.locals.testDb.notificationLogs.find((item) => item.eventType === 'QUOTE_SENT' && item.channel === 'EMAIL' && item.relatedId === created.body.data.id);
    assert.equal(log.recipient, 'customer-a@test.local');
    assert.equal(log.status, 'SENT');
    assert.ok(log.sentAt);
  } finally {
    setEmailProvider(null);
  }

  app.locals.testDb.customers[0].email = undefined;
  const admin = await login(app, 'admin-a@test.local');
  const noRecipientQuote = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'No Recipient Quote', amount: 35 });
  const sentNoRecipient = await admin.post('/api/quotes/' + noRecipientQuote.body.data.id + '/send').send({});
  assert.equal(sentNoRecipient.status, 200);
  const skipped = app.locals.testDb.notificationLogs.find((item) => item.eventType === 'QUOTE_SENT' && item.channel === 'EMAIL' && item.relatedId === noRecipientQuote.body.data.id);
  assert.equal(skipped.status, 'SKIPPED');
  assert.equal(skipped.recipient, 'none');
});

test('quote accept and reject notifications are admin-scoped and deduped', async () => {
  const app = await buildApp();
  app.locals.testDb.customers[0].email = 'customer-a@test.local';
  const admin = await login(app, 'admin-a@test.local');
  const created = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Accept Notify Quote', amount: 45 });
  await admin.post('/api/quotes/' + created.body.data.id + '/send').send({});
  const accepted = await admin.post('/api/quotes/' + created.body.data.id + '/accept').send({});
  const acceptedAgain = await admin.post('/api/quotes/' + created.body.data.id + '/accept').send({});
  assert.equal(accepted.status, 200);
  assert.equal(acceptedAgain.status, 200);
  const acceptedLogs = app.locals.testDb.notificationLogs.filter((item) => item.eventType === 'QUOTE_ACCEPTED' && item.channel === 'EMAIL' && item.relatedId === created.body.data.id);
  assert.deepEqual(acceptedLogs.map((item) => item.recipient).sort(), ['admin-a@test.local', 'owner-a@test.local']);

  const rejectable = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Reject Notify Quote', amount: 55 });
  await admin.post('/api/quotes/' + rejectable.body.data.id + '/send').send({});
  const rejected = await admin.post('/api/quotes/' + rejectable.body.data.id + '/reject').send({});
  assert.equal(rejected.status, 200);
  const rejectedLogs = app.locals.testDb.notificationLogs.filter((item) => item.eventType === 'QUOTE_REJECTED' && item.channel === 'EMAIL' && item.relatedId === rejectable.body.data.id);
  assert.deepEqual(rejectedLogs.map((item) => item.recipient).sort(), ['admin-a@test.local', 'owner-a@test.local']);
});

test('invoice payment and job notifications use safe scoped recipients', async () => {
  const app = await buildApp();
  app.locals.testDb.customers[0].email = 'customer-a@test.local';
  const admin = await login(app, 'admin-a@test.local');

  const invoice = await admin.post('/api/invoices').send({ customerId: 'customer-a', serviceId: 'service-a', amount: 80 });
  const sentInvoice = await admin.post('/api/invoices/' + invoice.body.data.id + '/send').send({});
  assert.equal(sentInvoice.status, 200);
  const invoiceLogs = app.locals.testDb.notificationLogs.filter((item) => item.eventType === 'INVOICE_SENT' && item.channel === 'EMAIL' && item.relatedId === invoice.body.data.id);
  assert.deepEqual(invoiceLogs.map((item) => item.recipient), ['customer-a@test.local']);

  const paid = await admin.post('/api/invoices/' + invoice.body.data.id + '/payments').send({ amount: 40, method: 'CARD', status: 'CONFIRMED', reference: 'secret_token=should-not-leak', notes: 'gateway password=hidden' });
  assert.equal(paid.status, 201);
  const paymentLogs = app.locals.testDb.notificationLogs.filter((item) => item.eventType === 'PAYMENT_RECEIVED');
  assert.equal(paymentLogs.some((item) => item.recipient === 'admin-b@test.local'), false);
  assert.equal(JSON.stringify(paymentLogs).includes('should-not-leak'), false);
  assert.equal(JSON.stringify(paymentLogs).includes('hidden'), false);

  const scheduled = await admin.post('/api/jobs/job-other-worker/schedule').send({ workerId: 'wp-b', startsAt: '2026-03-02T10:00:00.000Z', durationMinutes: 60 });
  assert.equal(scheduled.status, 201);
  const scheduleRecipients = app.locals.testDb.notificationLogs.filter((item) => item.eventType === 'JOB_SCHEDULED' && item.channel === 'EMAIL' && item.relatedId === 'job-other-worker').map((item) => item.recipient).sort();
  assert.deepEqual(scheduleRecipients, ['customer-a@test.local', 'worker-b@test.local']);

  const assigned = await admin.post('/api/jobs/job-a/assign-worker').send({ workerId: 'wp-b' });
  assert.equal(assigned.status, 200);
  const assignRecipients = app.locals.testDb.notificationLogs.filter((item) => item.eventType === 'WORKER_ASSIGNED' && item.channel === 'EMAIL' && item.relatedId === 'job-a').map((item) => item.recipient);
  assert.deepEqual(assignRecipients, ['worker-b@test.local']);
  assert.equal(assignRecipients.includes('worker-a@test.local'), false);
});

test('whatsapp provider supports skipped sent failed template and invalid phone outcomes', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const { setWhatsAppProvider } = require('../src/services/whatsappProvider.service');

  app.locals.testDb.customers[0].email = 'customer-a@test.local';
  app.locals.testDb.customers[0].phone = '+12025550120';

  const missingConfigQuote = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Missing Provider Quote', amount: 25 });
  await admin.post('/api/quotes/' + missingConfigQuote.body.data.id + '/send').send({});
  const missingConfigLog = app.locals.testDb.notificationLogs.find((item) => item.eventType === 'QUOTE_SENT' && item.channel === 'WHATSAPP' && item.relatedId === missingConfigQuote.body.data.id);
  assert.equal(missingConfigLog.status, 'SKIPPED');
  assert.equal(missingConfigLog.error, 'WhatsApp provider is not configured');

  setWhatsAppProvider(async () => ({ status: 'SENT' }));
  try {
    const sentQuote = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'WhatsApp Sent Quote', amount: 30 });
    await admin.post('/api/quotes/' + sentQuote.body.data.id + '/send').send({});
    const sentLog = app.locals.testDb.notificationLogs.find((item) => item.eventType === 'QUOTE_SENT' && item.channel === 'WHATSAPP' && item.relatedId === sentQuote.body.data.id);
    assert.equal(sentLog.recipient, '+12025550120');
    assert.equal(sentLog.status, 'SENT');
    assert.ok(sentLog.sentAt);
  } finally {
    setWhatsAppProvider(null);
  }

  setWhatsAppProvider(async () => { throw new Error('token=super-secret-provider-token failed'); });
  try {
    const failedInvoice = await admin.post('/api/invoices').send({ customerId: 'customer-a', serviceId: 'service-a', amount: 55 });
    await admin.post('/api/invoices/' + failedInvoice.body.data.id + '/send').send({});
    const failedLog = app.locals.testDb.notificationLogs.find((item) => item.eventType === 'INVOICE_SENT' && item.channel === 'WHATSAPP' && item.relatedId === failedInvoice.body.data.id);
    assert.equal(failedLog.status, 'FAILED');
    assert.equal(failedLog.error.includes('super-secret-provider-token'), false);
    assert.equal(failedLog.error.includes('[redacted]'), true);
  } finally {
    setWhatsAppProvider(null);
  }

  const previousTemplate = process.env.WHATSAPP_TEMPLATE_QUOTE_SENT;
  process.env.WHATSAPP_TEMPLATE_QUOTE_SENT = '';
  const missingTemplateQuote = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Missing Template Quote', amount: 35 });
  await admin.post('/api/quotes/' + missingTemplateQuote.body.data.id + '/send').send({});
  const missingTemplateLog = app.locals.testDb.notificationLogs.find((item) => item.eventType === 'QUOTE_SENT' && item.channel === 'WHATSAPP' && item.relatedId === missingTemplateQuote.body.data.id);
  assert.equal(missingTemplateLog.status, 'SKIPPED');
  assert.equal(missingTemplateLog.error, 'WhatsApp template is not configured');
  if (previousTemplate === undefined) delete process.env.WHATSAPP_TEMPLATE_QUOTE_SENT;
  else process.env.WHATSAPP_TEMPLATE_QUOTE_SENT = previousTemplate;

  app.locals.testDb.customers[0].phone = 'not-a-phone';
  const invalidPhoneQuote = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Invalid Phone Quote', amount: 40 });
  await admin.post('/api/quotes/' + invalidPhoneQuote.body.data.id + '/send').send({});
  const invalidPhoneLog = app.locals.testDb.notificationLogs.find((item) => item.eventType === 'QUOTE_SENT' && item.channel === 'WHATSAPP' && item.relatedId === invalidPhoneQuote.body.data.id);
  assert.equal(invalidPhoneLog.status, 'SKIPPED');
  assert.equal(invalidPhoneLog.recipient, 'none');
  assert.equal(invalidPhoneLog.error, 'No valid WhatsApp phone number available');
});

test('whatsapp logs every required event with scoped recipients and channel dedupe', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const { setWhatsAppProvider } = require('../src/services/whatsappProvider.service');
  setWhatsAppProvider(async () => ({ status: 'SENT' }));
  app.locals.testDb.customers[0].email = 'customer-a@test.local';

  try {
    await request(app).post('/api/public/booking-requests').send({ customerName: 'WhatsApp Booking', customerEmail: 'wa-booking@test.local', customerPhone: '+12025550130', address: 'WhatsApp Address', serviceId: 'service-a' });

    const quote = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'WhatsApp Flow Quote', amount: 75 });
    await admin.post('/api/quotes/' + quote.body.data.id + '/send').send({});
    await admin.post('/api/quotes/' + quote.body.data.id + '/accept').send({});
    await admin.post('/api/quotes/' + quote.body.data.id + '/accept').send({});

    const rejectQuote = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'WhatsApp Reject Quote', amount: 85 });
    await admin.post('/api/quotes/' + rejectQuote.body.data.id + '/send').send({});
    await admin.post('/api/quotes/' + rejectQuote.body.data.id + '/reject').send({});

    const invoice = await admin.post('/api/invoices').send({ customerId: 'customer-a', serviceId: 'service-a', amount: 90 });
    await admin.post('/api/invoices/' + invoice.body.data.id + '/send').send({});
    await admin.post('/api/invoices/' + invoice.body.data.id + '/payments').send({ amount: 45, method: 'CASH', status: 'CONFIRMED', reference: 'raw_token=private', notes: 'internal gateway note' });

    await admin.post('/api/jobs/job-other-worker/schedule').send({ workerId: 'wp-b', startsAt: '2026-03-04T10:00:00.000Z', durationMinutes: 60 });
    await admin.post('/api/jobs/job-other-worker/reschedule').send({ workerId: 'wp-b', startsAt: '2026-03-05T10:00:00.000Z', durationMinutes: 60 });
    await admin.post('/api/jobs/job-a/assign-worker').send({ workerId: 'wp-b' });
    await admin.post('/api/jobs/job-a/complete').send({ completionNotes: 'Done for WhatsApp', adminOverride: true });

    const whatsappEvents = new Set(app.locals.testDb.notificationLogs.filter((item) => item.channel === 'WHATSAPP').map((item) => item.eventType));
    for (const eventType of ['BOOKING_CREATED', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED', 'INVOICE_SENT', 'PAYMENT_RECEIVED', 'JOB_SCHEDULED', 'JOB_RESCHEDULED', 'WORKER_ASSIGNED', 'JOB_COMPLETED']) {
      assert.equal(whatsappEvents.has(eventType), true, eventType);
    }
    const acceptedLogs = app.locals.testDb.notificationLogs.filter((item) => item.channel === 'WHATSAPP' && item.eventType === 'QUOTE_ACCEPTED' && item.relatedId === quote.body.data.id);
    assert.deepEqual(acceptedLogs.map((item) => item.recipient).sort(), ['+12025550100', '+12025550101']);
    const emailAcceptedLogs = app.locals.testDb.notificationLogs.filter((item) => item.channel === 'EMAIL' && item.eventType === 'QUOTE_ACCEPTED' && item.relatedId === quote.body.data.id);
    assert.deepEqual(emailAcceptedLogs.map((item) => item.recipient).sort(), ['admin-a@test.local', 'owner-a@test.local']);
    const workerAssigned = app.locals.testDb.notificationLogs.filter((item) => item.channel === 'WHATSAPP' && item.eventType === 'WORKER_ASSIGNED' && item.relatedId === 'job-a');
    assert.deepEqual(workerAssigned.map((item) => item.recipient), ['+12025550111']);
    assert.equal(workerAssigned.some((item) => item.recipient === '+12025550110'), false);
    assert.equal(app.locals.testDb.notificationLogs.some((item) => item.channel === 'WHATSAPP' && item.recipient === '+12025550201'), false);
    assert.equal(JSON.stringify(app.locals.testDb.notificationLogs).includes('raw_token=private'), false);
    assert.equal(JSON.stringify(app.locals.testDb.notificationLogs).includes('passwordHash'), false);
  } finally {
    setWhatsAppProvider(null);
  }
});

test('phone number normalization is conservative and country-code aware', async () => {
  const { normalizePhoneNumber } = require('../src/services/phoneNumber.service');
  assert.equal(normalizePhoneNumber('+1 (202) 555-0199'), '+12025550199');
  assert.equal(normalizePhoneNumber('02025550199', { defaultCountryCode: '1' }), '+12025550199');
  const previousCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
  delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
  assert.equal(normalizePhoneNumber('02025550199', { defaultCountryCode: '' }), null);
  process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = previousCountryCode;
  assert.equal(normalizePhoneNumber('not-a-phone', { defaultCountryCode: '1' }), null);
});


test("client can register login session and logout without passwordHash leak", async () => {
  const app = await buildApp();
  const agent = request.agent(app);
  const registered = await agent.post("/api/client/auth/register").send({ name: "Portal Customer", email: "portal@test.local", phone: "0773333333", password: "ClientPass123!", role: "OWNER", status: "DISABLED" });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.data.email, "portal@test.local");
  assert.equal(registered.body.data.customerId, null);
  assert.equal(registered.body.data.status, "ACTIVE");
  assert.equal(registered.body.data.role, undefined);
  assertNoPasswordHash(registered.body);
  const session = await agent.get("/api/client/auth/session");
  assert.equal(session.status, 200);
  assert.equal(session.body.data.email, "portal@test.local");
  const duplicate = await request(app).post("/api/client/auth/register").send({ name: "Again", email: "portal@test.local", password: "ClientPass123!" });
  assert.equal(duplicate.status, 409);
  const logout = await agent.post("/api/client/auth/logout").send({});
  assert.equal(logout.status, 200);
  const loggedOut = await agent.get("/api/client/auth/session");
  assert.equal(loggedOut.body.data, null);
});

test("disabled client cannot login", async () => {
  const app = await buildApp();
  app.locals.testDb.clientAccounts.push({ id: "client-disabled", companyId: "company-a", name: "Disabled Client", email: "disabled-client@test.local", passwordHash: await bcrypt.hash("ClientPass123!", 4), status: "DISABLED", createdAt: "2026-01-01T00:00:00.000Z" });
  const response = await request(app).post("/api/client/auth/login").send({ email: "disabled-client@test.local", password: "ClientPass123!" });
  assert.equal(response.status, 403);
  assertNoPasswordHash(response.body);
});

test("client booking requests are owned and server scoped", async () => {
  const app = await buildApp();
  const client = request.agent(app);
  const otherClient = request.agent(app);
  await client.post("/api/client/auth/register").send({ name: "Booking Client", email: "booking-client@test.local", phone: "0774444444", password: "ClientPass123!" });
  await otherClient.post("/api/client/auth/register").send({ name: "Other Client", email: "other-client@test.local", phone: "0775555555", password: "ClientPass123!" });
  const created = await client.post("/api/client/booking-requests").send({ customerName: "Booking Client", customerEmail: "booking-client@test.local", customerPhone: "0774444444", address: "123 Client Way", serviceId: "service-a", preferredDate: "2026-07-10", preferredTimeWindow: "MORNING", notes: "Portal request", companyId: "company-b", status: "CONVERTED", convertedJobId: "job-b", clientAccountId: "fake-client" });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.companyId, "company-a");
  assert.equal(created.body.data.status, "NEW");
  assert.equal(created.body.data.clientAccountId, app.locals.testDb.clientAccounts.find((item) => item.email === "booking-client@test.local").id);
  assert.equal(created.body.data.convertedJobId, undefined);
  const list = await client.get("/api/client/booking-requests");
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.map((item) => item.id), [created.body.data.id]);
  const detail = await client.get("/api/client/booking-requests/" + created.body.data.id);
  assert.equal(detail.status, 200);
  const blocked = await otherClient.get("/api/client/booking-requests/" + created.body.data.id);
  assert.equal(blocked.status, 404);
  assertNoPasswordHash(list.body);
});

test("client profile can be read and updated without email or passwordHash changes", async () => {
  const app = await buildApp();
  const client = request.agent(app);
  const registered = await client.post("/api/client/auth/register").send({ name: "Profile Client", email: "profile-client@test.local", phone: "0776666666", password: "ClientPass123!" });
  assert.equal(registered.status, 201);
  const profile = await client.get("/api/client/profile");
  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.client.email, "profile-client@test.local");
  const updated = await client.patch("/api/client/profile").send({ name: "Updated Client", phone: "0777777777", email: "changed@test.local", passwordHash: "nope" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, "Updated Client");
  assert.equal(updated.body.data.email, "profile-client@test.local");
  assertNoPasswordHash(profile.body);
  assertNoPasswordHash(updated.body);
});

test("client and internal auth boundaries remain separate", async () => {
  const app = await buildApp();
  const client = request.agent(app);
  await client.post("/api/client/auth/register").send({ name: "Boundary Client", email: "boundary-client@test.local", password: "ClientPass123!" });
  const adminOnly = await client.get("/api/booking-requests");
  assert.equal(adminOnly.status, 401);
  const worker = await login(app, "worker-a@test.local");
  const clientOnly = await worker.get("/api/client/dashboard");
  assert.equal(clientOnly.status, 401);
  const publicBooking = await request(app).post("/api/public/booking-requests").send({ customerName: "Still Public", customerPhone: "0778888888", address: "Public Address", serviceId: "service-a" });
  assert.equal(publicBooking.status, 201);
  assert.equal(publicBooking.body.data.clientAccountId, undefined);
  assertNoPasswordHash(adminOnly.body);
  assertNoPasswordHash(clientOnly.body);
});

test('client dashboard does not include public booking requests by raw contact match', async () => {
  const app = await buildApp();
  const publicRequest = await request(app).post('/api/public/booking-requests').send({ customerName: 'Matched Client', customerEmail: 'matched-client@test.local', customerPhone: '0779999999', address: 'Matched Address', serviceId: 'service-a' });
  assert.equal(publicRequest.status, 201);
  const client = request.agent(app);
  const registered = await client.post('/api/client/auth/register').send({ name: 'Matched Client', email: 'matched-client@test.local', phone: '0779999999', password: 'ClientPass123!' });
  assert.equal(registered.status, 201);
  const dashboard = await client.get('/api/client/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.data.recentRequests.some((item) => item.id === publicRequest.body.data.id), false);
  assert.equal(dashboard.body.data.stats.totalRequests, 0);
  assertNoPasswordHash(dashboard.body);
});

test('client can change password and request reset', async () => {
  const app = await buildApp();
  const client = request.agent(app);
  const registered = await client.post('/api/client/auth/register').send({ name: 'Password Client', email: 'password-client@test.local', password: 'ClientPass123!' });
  assert.equal(registered.status, 201);
  const wrong = await client.post('/api/client/profile/password').send({ currentPassword: 'bad-password', newPassword: 'NewClientPass123!' });
  assert.equal(wrong.status, 401);
  const changed = await client.post('/api/client/profile/password').send({ currentPassword: 'ClientPass123!', newPassword: 'NewClientPass123!' });
  assert.equal(changed.status, 200);
  await client.post('/api/client/auth/logout').send({});
  const oldLogin = await request(app).post('/api/client/auth/login').send({ email: 'password-client@test.local', password: 'ClientPass123!' });
  assert.equal(oldLogin.status, 401);
  const newLogin = await request(app).post('/api/client/auth/login').send({ email: 'password-client@test.local', password: 'NewClientPass123!' });
  assert.equal(newLogin.status, 200);
  const forgot = await request(app).post('/api/client/auth/forgot-password').send({ email: 'password-client@test.local' });
  assert.equal(forgot.status, 200);
  assert.equal(forgot.body.data.message.includes('not configured'), true);
  assertNoPasswordHash(newLogin.body);
  assertNoPasswordHash(forgot.body);
});

test('client registration does not auto-link by matching customer email or phone', async () => {
  const app = await buildApp();
  app.locals.testDb.customers[0].email = 'customer-a@test.local';
  app.locals.testDb.customers[0].phone = '0771212121';
  const client = request.agent(app);
  const registered = await client.post('/api/client/auth/register').send({ name: 'Customer A Imposter', email: 'customer-a@test.local', phone: '0771212121', password: 'ClientPass123!' });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.data.customerId, null);
  const quotes = await client.get('/api/client/quotes');
  const invoices = await client.get('/api/client/invoices');
  const jobs = await client.get('/api/client/jobs');
  assert.deepEqual(quotes.body.data, []);
  assert.deepEqual(invoices.body.data, []);
  assert.deepEqual(jobs.body.data, []);
  assertNoPasswordHash(registered.body);
});

test('client booking requests are not owned by raw email or phone matches', async () => {
  const app = await buildApp();
  app.locals.testDb.bookingRequests.push(
    { id: 'raw-email-booking', companyId: 'company-a', customerName: 'Raw Email', customerEmail: 'raw-match@test.local', customerPhone: '0771010101', status: 'NEW', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'linked-customer-booking', companyId: 'company-a', customerId: 'customer-a', customerName: 'Linked Customer', customerEmail: 'other@test.local', customerPhone: '0772020202', status: 'NEW', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }
  );
  const unlinked = await loginClient(app, { id: 'client-raw-match', email: 'raw-match@test.local', phone: '0771010101', customerId: null });
  const unlinkedList = await unlinked.get('/api/client/booking-requests');
  assert.equal(unlinkedList.status, 200);
  assert.deepEqual(unlinkedList.body.data, []);

  const linked = await loginClient(app, { id: 'client-linked-customer', email: 'linked-customer@test.local', customerId: 'customer-a' });
  const linkedList = await linked.get('/api/client/booking-requests');
  assert.equal(linkedList.status, 200);
  assert.equal(linkedList.body.data.some((item) => item.id === 'linked-customer-booking'), true);
  assert.equal(linkedList.body.data.some((item) => item.id === 'raw-email-booking'), false);
});

test('client portal quotes are owned and accept reject safely', async () => {
  const app = await buildApp();
  app.locals.testDb.customers.push({ id: 'customer-other', companyId: 'company-a', name: 'Other Customer', createdAt: '2026-01-01T00:00:00.000Z' });
  app.locals.testDb.quotes.push(
    { id: 'quote-reject', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', title: 'Rejectable Quote', status: 'SENT', amount: 75, subtotal: 75, total: 75, createdAt: '2026-01-05T00:00:00.000Z' },
    { id: 'quote-other-customer', companyId: 'company-a', customerId: 'customer-other', serviceId: 'service-a', title: 'Other Quote', status: 'SENT', amount: 50, subtotal: 50, total: 50, createdAt: '2026-01-06T00:00:00.000Z' },
    { id: 'quote-company-b', companyId: 'company-b', customerId: 'customer-b', serviceId: 'service-b', title: 'Company B Quote', status: 'SENT', amount: 60, subtotal: 60, total: 60, createdAt: '2026-01-07T00:00:00.000Z' }
  );
  app.locals.testDb.quoteLineItems.push({ id: 'qli-reject', companyId: 'company-a', quoteId: 'quote-reject', serviceId: 'service-a', description: 'Reject service', quantity: 1, unitPrice: 75, discountAmount: 0, taxAmount: 0, lineTotal: 75, sortOrder: 0 });

  const client = await loginClient(app);
  const list = await client.get('/api/client/quotes');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.some((item) => item.id === 'quote-a'), true);
  assert.equal(list.body.data.some((item) => item.id === 'quote-other-customer'), false);
  assert.equal(list.body.data.some((item) => item.id === 'quote-company-b'), false);

  const detail = await client.get('/api/client/quotes/quote-reject');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.lineItems[0].description, 'Reject service');

  const accepted = await client.post('/api/client/quotes/quote-a/accept').send({});
  const acceptedAgain = await client.post('/api/client/quotes/quote-a/accept').send({});
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.status, 'ACCEPTED');
  assert.equal(accepted.body.data.job.id, acceptedAgain.body.data.job.id);

  const rejected = await client.post('/api/client/quotes/quote-reject/reject').send({ reason: 'Too expensive', status: 'ACCEPTED' });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.data.status, 'REJECTED');

  const blocked = await client.get('/api/client/quotes/quote-other-customer');
  const blockedCompany = await client.post('/api/client/quotes/quote-company-b/accept').send({});
  assert.equal(blocked.status, 404);
  assert.equal(blockedCompany.status, 404);
  assertNoPasswordHash(list.body);
  assertNoPasswordHash(accepted.body);
});

test('client portal hides draft quotes from list detail and actions', async () => {
  const app = await buildApp();
  app.locals.testDb.quotes.push({ id: 'quote-draft-client', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', title: 'Draft Client Quote', status: 'DRAFT', amount: 90, subtotal: 90, total: 90, createdAt: '2026-01-11T00:00:00.000Z' });
  const client = await loginClient(app);
  const list = await client.get('/api/client/quotes');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.some((item) => item.id === 'quote-draft-client'), false);
  const detail = await client.get('/api/client/quotes/quote-draft-client');
  const accept = await client.post('/api/client/quotes/quote-draft-client/accept').send({});
  const reject = await client.post('/api/client/quotes/quote-draft-client/reject').send({});
  assert.equal(detail.status, 404);
  assert.equal(accept.status, 404);
  assert.equal(reject.status, 404);
  assertNoPasswordHash(list.body);
});

test('client portal invoices payments receipts jobs and evidence are owned read-only views', async () => {
  const app = await buildApp();
  app.locals.testDb.payments.push({ id: 'payment-a', companyId: 'company-a', invoiceId: 'invoice-a', amount: 40, method: 'CASH', status: 'CONFIRMED', reference: 'SAFE-REF', notes: 'Internal note', receivedAt: '2026-01-08T00:00:00.000Z', confirmedAt: '2026-01-08T00:00:00.000Z', createdAt: '2026-01-08T00:00:00.000Z' });
  app.locals.testDb.receipts.push({ id: 'receipt-a', companyId: 'company-a', invoiceId: 'invoice-a', paymentId: 'payment-a', receiptNumber: 'RCT-A', amount: 40, issuedAt: '2026-01-08T00:00:00.000Z', createdAt: '2026-01-08T00:00:00.000Z' });
  app.locals.testDb.jobProofPhotos.push(
    { id: 'photo-before-a', companyId: 'company-a', jobId: 'job-a', workerId: 'wp-a', uploadedById: 'worker-a', url: '/uploads/jobs/proof/photo-before-a.jpg', filename: 'photo-before-a.jpg', mimeType: 'image/jpeg', sizeBytes: 10, category: 'BEFORE', caption: 'Before panel', createdAt: '2026-01-08T00:00:00.000Z' },
    { id: 'photo-a', companyId: 'company-a', jobId: 'job-a', workerId: 'wp-a', uploadedById: 'worker-a', url: '/uploads/jobs/proof/photo-a.jpg', filename: 'photo-a.jpg', mimeType: 'image/jpeg', sizeBytes: 10, category: 'AFTER', caption: 'Finished panel', createdAt: '2026-01-09T00:00:00.000Z' },
    { id: 'photo-general-a', companyId: 'company-a', jobId: 'job-a', workerId: 'wp-a', uploadedById: 'worker-a', url: '/uploads/jobs/proof/photo-general-a.jpg', filename: 'photo-general-a.jpg', mimeType: 'image/jpeg', sizeBytes: 10, category: 'GENERAL', caption: 'General panel', createdAt: '2026-01-09T01:00:00.000Z' }
  );
  app.locals.testDb.jobCompletionLocations.push({ id: 'location-a', companyId: 'company-a', jobId: 'job-a', capturedById: 'worker-a', latitude: -17.82, longitude: 31.05, accuracy: 15, source: 'WORKER_BROWSER', capturedAt: '2026-01-09T01:30:00.000Z', createdAt: '2026-01-09T01:30:00.000Z' });
  app.locals.testDb.jobSignatures.push({ id: 'signature-a', companyId: 'company-a', jobId: 'job-a', capturedById: 'worker-a', signerName: 'Customer A', signatureUrl: '/uploads/jobs/signatures/signature-a.png', mimeType: 'image/png', sizeBytes: 10, createdAt: '2026-01-09T00:00:00.000Z' });
  app.locals.testDb.jobActivities.push(
    { id: 'activity-safe', companyId: 'company-a', jobId: 'job-a', workerId: 'wp-a', userId: 'worker-a', type: 'ARRIVED', note: 'Worker arrived', createdAt: '2026-01-09T00:00:00.000Z' },
    { id: 'activity-internal', companyId: 'company-a', jobId: 'job-a', workerId: 'wp-a', userId: 'admin-a', type: 'ADMIN_NOTE', note: 'Internal note', createdAt: '2026-01-10T00:00:00.000Z' }
  );

  const client = await loginClient(app);
  const invoices = await client.get('/api/client/invoices');
  assert.equal(invoices.status, 200);
  assert.deepEqual(invoices.body.data.map((item) => item.id), ['invoice-a']);
  assert.equal(invoices.body.data[0].payments[0].notes, undefined);

  const payments = await client.get('/api/client/payments');
  assert.equal(payments.status, 200);
  assert.equal(payments.body.data[0].id, 'payment-a');
  assert.equal(payments.body.data[0].notes, undefined);

  const receipts = await client.get('/api/client/receipts');
  const receipt = await client.get('/api/client/receipts/receipt-a');
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.data[0].receiptNumber, 'RCT-A');
  assert.equal(receipt.body.data.payment.reference, 'SAFE-REF');

  const jobs = await client.get('/api/client/jobs');
  const job = await client.get('/api/client/jobs/job-a');
  const photos = await client.get('/api/client/jobs/job-a/proof-photos');
  const signature = await client.get('/api/client/jobs/job-a/signature');
  const proofSummary = await client.get('/api/client/jobs/job-a/proof-summary');
  const activity = await client.get('/api/client/jobs/job-a/activity');
  assert.equal(jobs.status, 200);
  assert.equal(job.body.data.proofSummary.beforePhotoCount, 1);
  assert.equal(job.body.data.proofSummary.afterPhotoCount, 1);
  assert.equal(photos.body.data.some((item) => item.category === 'BEFORE'), true);
  assert.equal(photos.body.data.some((item) => item.category === 'AFTER'), true);
  assert.equal(signature.body.data.signedByName, 'Customer A');
  assert.equal(proofSummary.body.data.locationPresent, true);
  assert.equal(proofSummary.body.data.location.latitude, undefined);
  assert.deepEqual(activity.body.data.map((item) => item.type), ['ARRIVED']);

  const mutateJob = await client.post('/api/jobs/job-a/complete').send({ completionNotes: 'Client should not complete' });
  const uploadProof = await client.post('/api/jobs/job-a/proof-photos').send({});
  assert.equal(mutateJob.status, 401);
  assert.equal(uploadProof.status, 401);
  assertNoPasswordHash(job.body);
  assertNoPasswordHash(activity.body);
});

test('client portal hides draft invoices and related payments receipts', async () => {
  const app = await buildApp();
  app.locals.testDb.invoices.push({ id: 'invoice-draft-client', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', jobId: 'job-a', number: 'INV-DRAFT', status: 'DRAFT', amount: 300, subtotal: 300, total: 300, balanceDue: 300, createdAt: '2026-01-11T00:00:00.000Z' });
  app.locals.testDb.invoiceLineItems.push({ id: 'ili-draft-client', companyId: 'company-a', invoiceId: 'invoice-draft-client', serviceId: 'service-a', description: 'Draft invoice item', quantity: 1, unitPrice: 300, discountAmount: 0, taxAmount: 0, lineTotal: 300, sortOrder: 0 });
  app.locals.testDb.payments.push({ id: 'payment-draft-client', companyId: 'company-a', invoiceId: 'invoice-draft-client', amount: 300, method: 'CASH', status: 'CONFIRMED', reference: 'DRAFT-PAY', createdAt: '2026-01-12T00:00:00.000Z' });
  app.locals.testDb.receipts.push({ id: 'receipt-draft-client', companyId: 'company-a', invoiceId: 'invoice-draft-client', paymentId: 'payment-draft-client', receiptNumber: 'RCT-DRAFT', amount: 300, issuedAt: '2026-01-12T00:00:00.000Z', createdAt: '2026-01-12T00:00:00.000Z' });
  const client = await loginClient(app);
  const invoices = await client.get('/api/client/invoices');
  const invoiceDetail = await client.get('/api/client/invoices/invoice-draft-client');
  const payments = await client.get('/api/client/payments');
  const receipts = await client.get('/api/client/receipts');
  const receiptDetail = await client.get('/api/client/receipts/receipt-draft-client');
  assert.equal(invoices.status, 200);
  assert.equal(invoices.body.data.some((item) => item.id === 'invoice-draft-client'), false);
  assert.equal(invoiceDetail.status, 404);
  assert.equal(payments.body.data.some((item) => item.id === 'payment-draft-client'), false);
  assert.equal(receipts.body.data.some((item) => item.id === 'receipt-draft-client'), false);
  assert.equal(receiptDetail.status, 404);
  assertNoPasswordHash(invoices.body);
  assertNoPasswordHash(payments.body);
  assertNoPasswordHash(receipts.body);
});

test('client properties are scoped and clients without linked customer get safe empty resources', async () => {
  const app = await buildApp();
  const client = await loginClient(app);
  const created = await client.post('/api/client/properties').send({ label: 'Home', address: '123 Client Street', city: 'Harare', notes: 'Gate code', isDefault: true, companyId: 'company-b', customerId: 'customer-b' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.companyId, 'company-a');
  assert.equal(created.body.data.customerId, 'customer-a');
  assert.equal(created.body.data.isDefault, true);

  const updated = await client.patch('/api/client/properties/' + created.body.data.id).send({ label: 'Main Home', address: '123 Client Street', isDefault: false, status: 'DISABLED' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.label, 'Main Home');
  assert.equal(updated.body.data.status, undefined);

  const list = await client.get('/api/client/properties');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);

  const noCustomer = await loginClient(app, { id: 'client-no-customer', email: 'no-customer@test.local', customerId: null });
  const emptyQuotes = await noCustomer.get('/api/client/quotes');
  const emptyInvoices = await noCustomer.get('/api/client/invoices');
  const emptyProperties = await noCustomer.get('/api/client/properties');
  const blockedCreate = await noCustomer.post('/api/client/properties').send({ label: 'Nope', address: 'Nowhere' });
  assert.deepEqual(emptyQuotes.body.data, []);
  assert.deepEqual(emptyInvoices.body.data, []);
  assert.deepEqual(emptyProperties.body.data, []);
  assert.equal(blockedCreate.status, 409);

  const blockedOther = await noCustomer.patch('/api/client/properties/' + created.body.data.id).send({ label: 'Blocked' });
  assert.equal(blockedOther.status, 404);
  const removed = await client.delete('/api/client/properties/' + created.body.data.id);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.deleted, true);
  assertNoPasswordHash(list.body);
});

test('client dashboard summarizes only client owned records', async () => {
  const app = await buildApp();
  app.locals.testDb.invoices.push({ id: 'invoice-other-company', companyId: 'company-b', customerId: 'customer-b', serviceId: 'service-b', number: 'INV-B', status: 'SENT', amount: 999, subtotal: 999, total: 999, balanceDue: 999, createdAt: '2026-01-02T00:00:00.000Z' });
  const client = await loginClient(app);
  const dashboard = await client.get('/api/client/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.data.stats.pendingQuotes, 1);
  assert.equal(dashboard.body.data.stats.unpaidInvoices, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(dashboard.body.data.stats, 'revenueMonthToDate'), false);
  assert.equal(JSON.stringify(dashboard.body).includes('invoice-other-company'), false);
  assertNoPasswordHash(dashboard.body);
});

test('admin can manage assets contracts due work and link jobs safely', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const asset = await owner.post('/api/assets').send({
    customerId: 'customer-a',
    serviceId: 'service-a',
    name: 'Rooftop HVAC Unit',
    assetType: 'HVAC',
    assetTag: 'HVAC-001',
    serialNumber: 'SN-001',
    warrantyEndAt: '2027-01-01T00:00:00.000Z'
  });
  assert.equal(asset.status, 201);
  assert.equal(asset.body.data.warrantyStatus, 'ACTIVE');

  const contract = await owner.post('/api/service-contracts').send({
    customerId: 'customer-a',
    contractNumber: 'SLA-001',
    name: 'Quarterly Maintenance',
    status: 'ACTIVE',
    startDate: '2026-01-01T00:00:00.000Z',
    responseSlaHours: 4,
    completionSlaHours: 24,
    includedVisits: 4
  });
  assert.equal(contract.status, 201);
  assert.equal((await owner.post('/api/service-contracts/' + contract.body.data.id + '/assets').send({ assetId: asset.body.data.id })).status, 201);

  const line = await owner.post('/api/service-contracts/' + contract.body.data.id + '/service-lines').send({
    serviceId: 'service-a',
    title: 'Quarterly HVAC PM',
    frequency: 'QUARTERLY',
    interval: 1,
    nextDueAt: '2026-01-15T09:00:00.000Z',
    defaultDurationMinutes: 90,
    requiresProofPhotos: true,
    requiresSignature: true,
    requiresLocation: true
  });
  assert.equal(line.status, 201);

  const preview = await owner.post('/api/service-contracts/' + contract.body.data.id + '/preview-jobs').send({ through: '2026-02-01T00:00:00.000Z' });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.dueWork.length, 1);

  const generated = await owner.post('/api/service-contracts/' + contract.body.data.id + '/generate-due-jobs').send({ through: '2026-02-01T00:00:00.000Z' });
  assert.equal(generated.status, 201);
  assert.equal(generated.body.data.generated[0].contractId, contract.body.data.id);
  assert.equal(generated.body.data.generated[0].slaStatus, 'ON_TRACK');

  const patchedJob = await owner.patch('/api/jobs/job-a').send({ contractId: contract.body.data.id, slaStatus: 'ON_TRACK', responseDueAt: '2026-01-02T04:00:00.000Z' });
  assert.equal(patchedJob.status, 200);
  assert.equal(patchedJob.body.data.contractId, contract.body.data.id);

  const jobAsset = await owner.post('/api/jobs/job-a/assets').send({ assetId: asset.body.data.id, primaryAsset: true, notes: 'Serviced during visit' });
  assert.equal(jobAsset.status, 201);
  assert.equal(jobAsset.body.data.asset.id, asset.body.data.id);

  const history = await owner.get('/api/assets/' + asset.body.data.id + '/history');
  assert.equal(history.status, 200);
  assert.equal(history.body.data.jobs.some((job) => job.id === 'job-a'), true);
  assert.equal(app.locals.testDb.auditLogs.some((log) => log.entity === 'Asset' && log.action === 'CREATE'), true);
});

test('asset contract access is scoped for workers clients and other companies', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const ownerB = await login(app, 'admin-b@test.local');
  const worker = await login(app, 'worker-a@test.local');
  const client = await loginClient(app);
  const asset = await owner.post('/api/assets').send({ customerId: 'customer-a', name: 'Generator A', assetType: 'Generator' });
  assert.equal(asset.status, 201);
  const hiddenAsset = await ownerB.post('/api/assets').send({ customerId: 'customer-b', name: 'Generator B', assetType: 'Generator' });
  assert.equal(hiddenAsset.status, 201);
  const contract = await owner.post('/api/service-contracts').send({ customerId: 'customer-a', contractNumber: 'SLA-CLIENT', name: 'Client Visible Contract', status: 'ACTIVE', startDate: '2026-01-01T00:00:00.000Z' });
  assert.equal(contract.status, 201);
  assert.equal((await owner.post('/api/service-contracts/' + contract.body.data.id + '/assets').send({ assetId: asset.body.data.id })).status, 201);
  assert.equal((await owner.post('/api/jobs/job-a/assets').send({ assetId: asset.body.data.id })).status, 201);

  const workerAssets = await worker.get('/api/worker/jobs/job-a/assets');
  assert.equal(workerAssets.status, 200);
  assert.equal(workerAssets.body.data.length, 1);
  assert.equal((await worker.get('/api/assets')).status, 403);
  assert.equal((await worker.get('/api/worker/jobs/job-other-worker/assets')).status, 404);

  const clientAssets = await client.get('/api/client/assets');
  assert.equal(clientAssets.status, 200);
  assert.equal(clientAssets.body.data.some((item) => item.id === asset.body.data.id), true);
  assert.equal(clientAssets.body.data.some((item) => item.id === hiddenAsset.body.data.id), false);
  assert.equal((await client.get('/api/client/assets/' + hiddenAsset.body.data.id)).status, 404);
  const clientContracts = await client.get('/api/client/service-contracts');
  assert.equal(clientContracts.status, 200);
  assert.equal(clientContracts.body.data.some((item) => item.id === contract.body.data.id), true);

  assert.equal((await ownerB.get('/api/assets/' + asset.body.data.id)).status, 404);
  assert.equal((await owner.post('/api/jobs/job-a/assets').send({ assetId: hiddenAsset.body.data.id })).status, 404);
});

test('admin integrations encrypt secrets and return safe metadata only', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const created = await owner.post('/api/admin/integrations').send({
    provider: 'BREVO',
    displayName: 'Brevo production',
    config: { senderName: 'Dispatch', senderEmail: 'dispatch@a.test', replyToEmail: 'help@a.test' },
    secrets: { apiKey: 'brevo-secret-key' }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.provider, 'BREVO');
  assert.equal(created.body.data.config.senderEmail, 'dispatch@a.test');
  assert.deepEqual(created.body.data.configuredSecrets, ['apiKey']);
  assert.equal(JSON.stringify(created.body).includes('brevo-secret-key'), false);
  assert.equal(JSON.stringify(created.body).includes('encryptedValue'), false);

  const stored = app.locals.testDb.integrationSecrets[0];
  assert.equal(stored.keyName, 'apiKey');
  assert.notEqual(stored.encryptedValue, 'brevo-secret-key');
  assert.ok(stored.iv);
  assert.ok(stored.authTag);

  const before = stored.encryptedValue;
  const updated = await owner.patch('/api/admin/integrations/' + created.body.data.id).send({
    displayName: 'Brevo edited',
    config: { senderName: 'Dispatch 2', senderEmail: 'dispatch@a.test' },
    secrets: { apiKey: '' }
  });
  assert.equal(updated.status, 200);
  assert.equal(app.locals.testDb.integrationSecrets[0].encryptedValue, before);

  const list = await owner.get('/api/admin/integrations');
  assert.equal(list.status, 200);
  assert.equal(JSON.stringify(list.body).includes('brevo-secret-key'), false);
  assert.equal(JSON.stringify(list.body).includes('authTag'), false);
});

test('integration records are company scoped', async () => {
  const app = await buildApp();
  const ownerA = await login(app, 'owner-a@test.local');
  const ownerB = await login(app, 'admin-b@test.local');
  const created = await ownerA.post('/api/admin/integrations').send({ provider: 'CLICKATELL', config: { senderId: 'A' }, secrets: { apiKey: 'clickatell-a' } });
  assert.equal(created.status, 201);
  assert.equal((await ownerB.get('/api/admin/integrations/' + created.body.data.id)).status, 404);
  assert.equal((await ownerB.patch('/api/admin/integrations/' + created.body.data.id).send({ config: { senderId: 'B' } })).status, 404);
  assert.equal((await ownerB.post('/api/admin/integrations/' + created.body.data.id + '/test').send({})).status, 404);
});

test('integration providers resolve and create provider message logs', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const providerPayloads = [
    ['BREVO', { senderEmail: 'dispatch@a.test' }, { apiKey: 'brevo-key' }, 'EMAIL'],
    ['META_WHATSAPP_CLOUD', { phoneNumberId: 'phone-a' }, { accessToken: 'meta-token', webhookVerifyToken: 'verify-token' }, 'WHATSAPP'],
    ['CLICKATELL', { senderId: 'FIELD' }, { apiKey: 'click-key' }, 'SMS'],
    ['AFRICAS_TALKING', { environment: 'sandbox', senderId: 'FIELD' }, { username: 'fieldcore', apiKey: 'at-key' }, 'SMS'],
    ['CLOUDFLARE_R2', { bucket: 'fieldcore-a', endpoint: 'https://r2.example.test' }, { accessKeyId: 'r2-key', secretAccessKey: 'r2-secret' }, 'STORAGE']
  ];
  for (const [provider, config, secrets] of providerPayloads) {
    const response = await owner.post('/api/admin/integrations').send({ provider, config, secrets });
    assert.equal(response.status, 201);
    const testResponse = await owner.post('/api/admin/integrations/' + response.body.data.id + '/test').send({});
    assert.equal(testResponse.status, 200);
    assert.equal(testResponse.body.data.test.ok, true);
  }

  const { resolveActiveConnection, sendViaIntegration } = require('../src/services/integrations/integrationConnections.service');
  assert.equal((await resolveActiveConnection('company-a', 'EMAIL')).provider, 'BREVO');
  assert.equal((await resolveActiveConnection('company-a', 'WHATSAPP')).provider, 'META_WHATSAPP_CLOUD');
  assert.equal((await resolveActiveConnection('company-a', 'SMS', 'CLICKATELL')).provider, 'CLICKATELL');
  assert.equal((await resolveActiveConnection('company-a', 'SMS', 'AFRICAS_TALKING')).provider, 'AFRICAS_TALKING');
  assert.equal((await resolveActiveConnection('company-a', 'STORAGE')).provider, 'CLOUDFLARE_R2');

  const result = await sendViaIntegration({ companyId: 'company-a', channel: 'EMAIL', message: { to: 'client@example.test', subject: 'Hello', text: 'Hi' }, relatedType: 'Job', relatedId: 'job-a' });
  assert.equal(result.status, 'SENT');
  assert.equal(app.locals.testDb.messageLogs.length, 1);
  assert.equal(app.locals.testDb.messageLogs[0].recipientMasked, 'cl***@example.test');
  assert.equal(JSON.stringify(app.locals.testDb.messageLogs).includes('brevo-key'), false);
});

test('storage objects update monthly usage rollups', async () => {
  const app = await buildApp();
  const { recordStorageObject } = require('../src/services/integrations/storageUsage.service');
  await recordStorageObject({
    companyId: 'company-a',
    bucket: 'fieldcore-a',
    objectKey: 'companies/company-a/jobs/job-a/photo.jpg',
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1234,
    jobId: 'job-a',
    uploadedById: 'admin-a'
  });
  assert.equal(app.locals.testDb.storageObjects.length, 1);
  assert.equal(app.locals.testDb.storageUsageMonthly.length, 1);
  assert.equal(Number(app.locals.testDb.storageUsageMonthly[0].totalBytes), 1234);
  assert.equal(app.locals.testDb.storageUsageMonthly[0].objectCount, 1);
});

test('R2 proof uploads create storage object and monthly usage records', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const integration = await owner.post('/api/admin/integrations').send({
    provider: 'CLOUDFLARE_R2',
    config: { bucket: 'fieldcore-a', endpoint: 'https://account.r2.cloudflarestorage.com', publicDomain: 'https://files.a.test', region: 'auto' },
    secrets: { accessKeyId: 'r2-key', secretAccessKey: 'r2-secret' }
  });
  assert.equal(integration.status, 201);
  const upload = await owner
    .post('/api/jobs/job-a/proof-photos')
    .field('category', 'BEFORE')
    .attach('photo', Buffer.from('fake-image'), { filename: 'before.jpg', contentType: 'image/jpeg' });
  assert.equal(upload.status, 201);
  assert.equal(app.locals.testDb.storageObjects.length, 1);
  assert.equal(app.locals.testDb.storageObjects[0].bucket, 'fieldcore-a');
  assert.equal(app.locals.testDb.storageObjects[0].jobId, 'job-a');
  assert.equal(app.locals.testDb.storageObjects[0].objectKey.includes('company-a'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(app.locals.testDb.storageObjects[0], 'secretAccessKey'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(app.locals.testDb.storageObjects[0], 'accessKeyId'), false);
  assert.equal(app.locals.testDb.storageUsageMonthly[0].objectCount, 1);
});

test('SMS notification channel sends through configured SMS integration only when enabled', async () => {
  const previous = process.env.NOTIFICATION_CHANNELS;
  process.env.NOTIFICATION_CHANNELS = 'SMS';
  try {
    const app = await buildApp();
    const owner = await login(app, 'owner-a@test.local');
    const integration = await owner.post('/api/admin/integrations').send({ provider: 'CLICKATELL', config: { senderId: 'FIELD' }, secrets: { apiKey: 'clickatell-secret' } });
    assert.equal(integration.status, 201);
    const quote = await owner.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'SMS quote', amount: 100 });
    assert.equal(quote.status, 201);
    const sent = await owner.post('/api/quotes/' + quote.body.data.id + '/send').send({});
    assert.equal(sent.status, 200);
    const smsLog = app.locals.testDb.notificationLogs.find((item) => item.channel === 'SMS' && item.relatedId === quote.body.data.id);
    assert.equal(Boolean(smsLog), true);
    assert.equal(smsLog.status, 'SENT');
    const providerLog = app.locals.testDb.messageLogs.find((item) => item.channel === 'SMS' && item.provider === 'CLICKATELL');
    assert.equal(Boolean(providerLog), true);
    assert.equal(providerLog.status, 'SENT');
    assert.equal(JSON.stringify(app.locals.testDb.messageLogs).includes('clickatell-secret'), false);
  } finally {
    process.env.NOTIFICATION_CHANNELS = previous;
  }
});

test('duplicate provider save updates the existing integration connection', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const first = await owner.post('/api/admin/integrations').send({ provider: 'BREVO', config: { senderEmail: 'first@a.test' }, secrets: { apiKey: 'first-secret' } });
  const second = await owner.post('/api/admin/integrations').send({ provider: 'BREVO', config: { senderEmail: 'second@a.test' }, secrets: { apiKey: 'second-secret' } });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.body.data.id, second.body.data.id);
  assert.equal(app.locals.testDb.integrationConnections.filter((item) => item.provider === 'BREVO').length, 1);
  assert.equal(second.body.data.config.senderEmail, 'second@a.test');
});

test('R2 provider test performs upload and cleanup outside test mode', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFetch = global.fetch;
  const calls = [];
  process.env.NODE_ENV = 'production';
  global.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method, headers: options.headers });
    return { ok: true, status: options.method === 'DELETE' ? 204 : 200 };
  };
  try {
    const { testCloudflareR2 } = require('../src/services/integrations/providers/cloudflareR2Storage.provider');
    const result = await testCloudflareR2({
      connection: { config: { bucket: 'fieldcore-a', endpoint: 'https://account.r2.cloudflarestorage.com', region: 'auto' } },
      secrets: { accessKeyId: 'r2-key', secretAccessKey: 'r2-secret' }
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'ACTIVE');
    assert.deepEqual(calls.map((call) => call.method), ['PUT', 'DELETE']);
    assert.equal(calls.every((call) => String(call.url).includes('/fieldcore-a/fieldcore-r2-test-')), true);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    global.fetch = previousFetch;
  }
});

test('production env requires a valid integration encryption master key', () => {
  const { validateEnv } = require('../src/config/env');
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://example',
    JWT_SECRET: 'this-is-a-strong-secret-with-more-than-32-chars',
    APP_BASE_URL: 'https://fieldcore.test',
    EMAIL_PROVIDER: 'console'
  };
  const missing = validateEnv(base);
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.some((item) => item.includes('INTEGRATION_SECRET_MASTER_KEY_BASE64 is required')), true);
  const invalid = validateEnv({ ...base, INTEGRATION_SECRET_MASTER_KEY_BASE64: Buffer.from('short').toString('base64') });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some((item) => item.includes('32 bytes')), true);
  const valid = validateEnv({ ...base, INTEGRATION_SECRET_MASTER_KEY_BASE64: Buffer.alloc(32, 7).toString('base64') });
  assert.equal(valid.ok, true);
});


test('task2 admin can manage inventory and stock movements safely', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const otherAdmin = await login(app, 'admin-b@test.local');

  const item = await admin.post('/api/inventory/items').send({ name: 'Contactor', sku: 'CNT-001', unitOfMeasure: 'each', reorderPoint: 2 });
  assert.equal(item.status, 201);
  assert.equal(item.body.data.companyId, 'company-a');

  const location = await admin.post('/api/stock-locations').send({ name: 'Main Warehouse', type: 'WAREHOUSE' });
  assert.equal(location.status, 201);

  const adjustment = await admin.post('/api/inventory/adjustments').send({ itemId: item.body.data.id, locationId: location.body.data.id, movementType: 'ADJUSTMENT_IN', quantity: 5, reason: 'Opening stock' });
  assert.equal(adjustment.status, 201);
  assert.equal(Number(adjustment.body.data.quantityOnHand), 5);

  const movements = await admin.get('/api/inventory/movements');
  assert.equal(movements.status, 200);
  assert.equal(movements.body.data.length, 1);
  assert.equal(movements.body.data[0].movementType, 'ADJUSTMENT_IN');

  const isolated = await otherAdmin.get('/api/inventory/movements');
  assert.equal(isolated.status, 200);
  assert.equal(isolated.body.data.length, 0);
});

test('task2 job parts reserve and use stock', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');

  const item = await admin.post('/api/inventory/items').send({ name: 'Cable', sku: 'CBL-001', unitOfMeasure: 'm' });
  const location = await admin.post('/api/stock-locations').send({ name: 'Vehicle A', type: 'VEHICLE' });
  await admin.post('/api/inventory/adjustments').send({ itemId: item.body.data.id, locationId: location.body.data.id, movementType: 'ADJUSTMENT_IN', quantity: 10, reason: 'Load vehicle' });

  const planned = await admin.post('/api/jobs/job-a/parts').send({ itemId: item.body.data.id, locationId: location.body.data.id, quantityPlanned: 3 });
  assert.equal(planned.status, 201);

  const reserved = await admin.post(`/api/jobs/job-a/parts/${planned.body.data.id}/reserve`).send({});
  assert.equal(reserved.status, 200);
  assert.equal(reserved.body.data.status, 'RESERVED');

  const used = await admin.post(`/api/jobs/job-a/parts/${planned.body.data.id}/use`).send({ quantity: 2 });
  assert.equal(used.status, 200);
  assert.equal(used.body.data.status, 'USED');

  const stock = await admin.get(`/api/inventory/items/${item.body.data.id}/stock`);
  assert.equal(Number(stock.body.data[0].quantityOnHand), 8);
});

test('task2 worker can only record shortage for assigned job', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');
  const workerB = await login(app, 'worker-b@test.local');

  const item = await admin.post('/api/inventory/items').send({ name: 'Fuse', sku: 'FUSE-001', unitOfMeasure: 'each' });

  const shortage = await worker.post('/api/worker/jobs/job-a/part-shortage').send({ itemId: item.body.data.id, quantity: 4, notes: 'Need fuses' });
  assert.equal(shortage.status, 201);
  assert.equal(shortage.body.data.status, 'SHORT');
  assert.ok(shortage.body.data.purchaseRequest.id);

  const forbidden = await workerB.post('/api/worker/jobs/job-a/part-shortage').send({ itemId: item.body.data.id, quantity: 1, notes: 'Wrong worker' });
  assert.equal(forbidden.status, 404);
});

test('task2 purchase order receiving increases stock', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');

  const supplier = await admin.post('/api/suppliers').send({ name: 'Parts Supplier' });
  const item = await admin.post('/api/inventory/items').send({ name: 'Breaker', sku: 'BRK-001', unitOfMeasure: 'each' });
  const location = await admin.post('/api/stock-locations').send({ name: 'Receiving Store', type: 'WAREHOUSE' });
  const po = await admin.post('/api/purchase-orders').send({ supplierId: supplier.body.data.id, lines: [{ itemId: item.body.data.id, quantity: 6, unitCost: 3.5 }] });
  assert.equal(po.status, 201);
  assert.equal(po.body.data.lines.length, 1);

  const received = await admin.post(`/api/purchase-orders/${po.body.data.id}/receive`).send({ locationId: location.body.data.id, lines: [{ lineId: po.body.data.lines[0].id, receivedQuantity: 6 }] });
  assert.equal(received.status, 200);
  assert.equal(received.body.data.status, 'RECEIVED');

  const stock = await admin.get(`/api/inventory/items/${item.body.data.id}/stock`);
  assert.equal(Number(stock.body.data[0].quantityOnHand), 6);
});


test('task3 admin can configure finance settings and prefixes are used safely', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');

  const forbidden = await worker.get('/api/company/finance-settings');
  assert.equal(forbidden.status, 403);

  const saved = await admin.patch('/api/company/finance-settings').send({
    defaultCurrency: 'zar',
    allowedCurrencies: ['ZAR', 'USD'],
    taxName: 'VAT',
    taxRate: 15,
    pricesIncludeTax: true,
    invoicePrefix: 'FCINV',
    receiptPrefix: 'FCRCT',
    fiscalYearStartMonth: 3,
    invoiceFooter: 'Pay within terms.'
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.defaultCurrency, 'ZAR');
  assert.equal(saved.body.data.taxName, 'VAT');

  const invoice = await admin.post('/api/invoices').send({ customerId: 'customer-a', serviceId: 'service-a', jobId: 'job-a', amount: 100 });
  assert.equal(invoice.status, 201);
  assert.equal(invoice.body.data.number.startsWith('FCINV-'), true);

  const paid = await admin.post('/api/invoices/' + invoice.body.data.id + '/payments').send({ amount: 100, method: 'CASH', status: 'CONFIRMED' });
  assert.equal(paid.status, 201);
  const receipts = await admin.get('/api/invoices/' + invoice.body.data.id + '/receipts');
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.data[0].receiptNumber.startsWith('FCRCT-'), true);
});

test('task3 finance CSV exports are company scoped and create export logs', async () => {
  const app = await buildApp();
  const adminA = await login(app, 'admin-a@test.local');
  const adminB = await login(app, 'admin-b@test.local');

  const invoices = await adminA.get('/api/finance/export/invoices.csv');
  assert.equal(invoices.status, 200);
  assert.equal(invoices.headers['content-type'].includes('text/csv'), true);
  assert.equal(invoices.text.includes('INV-A'), true);
  assert.equal(invoices.text.includes('Company B'), false);

  const customers = await adminA.get('/api/finance/export/customers.csv');
  assert.equal(customers.status, 200);
  assert.equal(customers.text.includes('Customer A'), true);
  assert.equal(customers.text.includes('Customer B'), false);

  const logsA = await adminA.get('/api/finance/export-logs');
  assert.equal(logsA.status, 200);
  assert.equal(logsA.body.data.length, 2);
  assert.equal(logsA.body.data.every((log) => log.companyId === 'company-a'), true);

  const logsB = await adminB.get('/api/finance/export-logs');
  assert.equal(logsB.status, 200);
  assert.equal(logsB.body.data.length, 0);
});

test('task3 finance integrations are placeholders and export links are scoped', async () => {
  const app = await buildApp();
  const adminA = await login(app, 'admin-a@test.local');
  const adminB = await login(app, 'admin-b@test.local');

  const created = await adminA.post('/api/finance/integrations').send({ provider: 'XERO', externalTenantId: 'tenant-a', config: { tenantName: 'A Books' } });
  assert.equal(created.status, 201);
  assert.equal(JSON.stringify(created.body).includes('clientSecret'), false);

  const disconnectedTest = await adminA.post('/api/finance/integrations/' + created.body.data.id + '/test').send({});
  assert.equal(disconnectedTest.status, 409);

  const connected = await adminA.post('/api/finance/integrations/' + created.body.data.id + '/connect').send({ mockMode: true, externalTenantId: 'tenant-a' });
  assert.equal(connected.status, 200);
  assert.equal(connected.body.data.integration.status, 'ACTIVE');

  const tested = await adminA.post('/api/finance/integrations/' + created.body.data.id + '/test').send({});
  assert.equal(tested.status, 200);
  assert.equal(tested.body.data.test.mockMode, true);

  assert.equal((await adminB.patch('/api/finance/integrations/' + created.body.data.id).send({ status: 'ACTIVE' })).status, 404);
  assert.equal((await adminB.post('/api/finance/integrations/' + created.body.data.id + '/test').send({})).status, 404);

  const mark = await adminA.post('/api/finance/export/mark-exported').send({ provider: 'XERO', localType: 'INVOICE', ids: ['invoice-a'], externalIds: { 'invoice-a': 'xero-invoice-1' } });
  assert.equal(mark.status, 200);
  assert.equal(mark.body.data.marked, 1);
  assert.equal(app.locals.testDb.externalRecordLinks[0].externalId, 'xero-invoice-1');

  const blocked = await adminB.post('/api/finance/export/mark-exported').send({ provider: 'XERO', localType: 'INVOICE', ids: ['invoice-a'] });
  assert.equal(blocked.status, 404);
});

test('task4 worker device registration bootstrap and duplicate offline sync are safe', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');

  const registered = await worker.post('/api/worker/devices/register').send({ platform: 'android', deviceName: 'Galaxy A22', deviceId: 'device-worker-a' });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.data.workerId, 'wp-a');
  assert.equal(registered.body.data.userId, 'worker-a');

  const bootstrap = await worker.post('/api/worker/sync/bootstrap').send({ deviceId: 'device-worker-a' });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.data.jobs.length, 1);
  assert.equal(bootstrap.body.data.jobs[0].id, 'job-a');

  const pushed = await worker.post('/api/worker/sync/push').send({
    deviceId: 'device-worker-a',
    actions: [
      {
        idempotencyKey: 'offline-note-001',
        actionType: 'JOB_NOTE',
        payload: {
          jobId: 'job-a',
          note: 'Offline note from device',
          capturedAt: '2026-01-05T09:00:00.000Z',
          offlineCreatedAt: '2026-01-05T08:58:00.000Z'
        }
      }
    ]
  });
  assert.equal(pushed.status, 200);
  assert.equal(pushed.body.data.results[0].status, 'PROCESSED');

  const duplicate = await worker.post('/api/worker/sync/push').send({
    deviceId: 'device-worker-a',
    actions: [
      { idempotencyKey: 'offline-note-001', actionType: 'JOB_NOTE', payload: { jobId: 'job-a', note: 'Should not duplicate' } }
    ]
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.data.results[0].status, 'DUPLICATE');

  const status = await worker.get('/api/worker/sync/status/offline-note-001');
  assert.equal(status.status, 200);
  assert.equal(status.body.data.status, 'PROCESSED');

  const activities = app.locals.testDb.jobActivities.filter((activity) => activity.jobId === 'job-a' && activity.syncId === 'offline-note-001');
  assert.equal(activities.length, 1);
  assert.equal(activities[0].deviceId, 'device-worker-a');
});

test('task4 offline sync rejects another worker job and stores proof metadata', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');

  assert.equal((await worker.post('/api/worker/devices/register').send({ platform: 'ios', deviceName: 'iPhone', deviceId: 'device-proof-a' })).status, 201);

  const proof = await worker.post('/api/worker/sync/push').send({
    deviceId: 'device-proof-a',
    actions: [
      {
        idempotencyKey: 'offline-proof-001',
        actionType: 'PROOF_PHOTO_UPLOADED',
        payload: {
          jobId: 'job-a',
          url: '/uploads/jobs/proof/offline-proof.jpg',
          filename: 'offline-proof.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1234,
          category: 'AFTER',
          caption: 'Offline after photo',
          latitude: -17.8292,
          longitude: 31.0522,
          accuracy: 12,
          capturedAt: '2026-01-05T10:00:00.000Z',
          offlineCreatedAt: '2026-01-05T09:59:00.000Z'
        }
      }
    ]
  });
  assert.equal(proof.status, 200);
  assert.equal(proof.body.data.results[0].status, 'PROCESSED');
  const photo = app.locals.testDb.jobProofPhotos.find((item) => item.syncId === 'offline-proof-001');
  assert.equal(photo.jobId, 'job-a');
  assert.equal(photo.deviceId, 'device-proof-a');
  assert.equal(photo.category, 'AFTER');

  const rejected = await worker.post('/api/worker/sync/push').send({
    deviceId: 'device-proof-a',
    actions: [
      { idempotencyKey: 'offline-other-worker-001', actionType: 'JOB_NOTE', payload: { jobId: 'job-other-worker', note: 'Should be rejected' } }
    ]
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.data.results[0].status, 'REJECTED');
  assert.equal(app.locals.testDb.jobActivities.some((activity) => activity.syncId === 'offline-other-worker-001'), false);
});


test('task5 branches scope records and filter reports safely', async () => {
  const app = await buildApp();
  const adminA = await login(app, 'admin-a@test.local');
  const adminB = await login(app, 'admin-b@test.local');
  const worker = await login(app, 'worker-a@test.local');

  const branch = await adminA.post('/api/branches').send({ name: 'Harare Branch', code: 'HRE', city: 'Harare', country: 'ZW', timezone: 'Africa/Harare' });
  assert.equal(branch.status, 201);

  const customer = await adminA.post('/api/customers').send({ name: 'Branch Customer', branchId: branch.body.data.id, phone: '+263770000000' });
  assert.equal(customer.status, 201);
  assert.equal(customer.body.data.branchId, branch.body.data.id);

  const job = await adminA.post('/api/jobs').send({ customerId: customer.body.data.id, serviceId: 'service-a', workerId: 'wp-a', branchId: branch.body.data.id, title: 'Branch Job' });
  assert.equal(job.status, 201);
  assert.equal(job.body.data.branchId, branch.body.data.id);

  const filtered = await adminA.get('/api/jobs?branchId=' + branch.body.data.id);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.data.every((item) => item.branchId === branch.body.data.id), true);

  const report = await adminA.get('/api/reports/branch-performance?branchId=' + branch.body.data.id);
  assert.equal(report.status, 200);
  assert.equal(report.body.data.length, 1);
  assert.equal(report.body.data[0].branch.id, branch.body.data.id);

  assert.equal((await worker.get('/api/branches')).status, 403);
  assert.equal((await adminB.patch('/api/branches/' + branch.body.data.id).send({ name: 'Wrong company' })).status, 404);
});

test('task5 approval requests are decided safely and company scoped', async () => {
  const app = await buildApp();
  const adminA = await login(app, 'admin-a@test.local');
  const adminB = await login(app, 'admin-b@test.local');
  const worker = await login(app, 'worker-a@test.local');

  const policy = await adminA.post('/api/approval-policies').send({ name: 'PO send approval', eventType: 'PURCHASE_ORDER_SEND', thresholdAmount: 500 });
  assert.equal(policy.status, 201);

  const requestApproval = await adminA.post('/api/approvals').send({ policyId: policy.body.data.id, entityType: 'PurchaseOrder', entityId: 'po-test-1', eventType: 'PURCHASE_ORDER_SEND', reason: 'Large PO' });
  assert.equal(requestApproval.status, 201);
  assert.equal(requestApproval.body.data.status, 'PENDING');

  const pending = await adminA.get('/api/approvals/pending');
  assert.equal(pending.status, 200);
  assert.equal(pending.body.data.some((item) => item.id === requestApproval.body.data.id), true);

  assert.equal((await worker.get('/api/approvals/pending')).status, 403);
  assert.equal((await adminB.post('/api/approvals/' + requestApproval.body.data.id + '/approve').send({ decisionNote: 'Nope' })).status, 404);

  const approved = await adminA.post('/api/approvals/' + requestApproval.body.data.id + '/approve').send({ decisionNote: 'Approved by manager' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.status, 'APPROVED');
  assert.equal(approved.body.data.approvedById, 'admin-a');

  const secondDecision = await adminA.post('/api/approvals/' + requestApproval.body.data.id + '/reject').send({ decisionNote: 'Too late' });
  assert.equal(secondDecision.status, 409);

  const auditHit = app.locals.testDb.auditLogs.some((log) => log.entity === 'ApprovalRequest' && log.entityId === requestApproval.body.data.id && log.action === 'APPROVE');
  assert.equal(auditHit, true);
});

test('task5 deeper reports are admin-only and branch aware', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');

  const branch = await admin.post('/api/branches').send({ name: 'South Branch', code: 'SOUTH' });
  assert.equal(branch.status, 201);
  await admin.post('/api/jobs').send({ customerId: 'customer-a', serviceId: 'service-a', workerId: 'wp-a', branchId: branch.body.data.id, title: 'SLA Job', completionDueAt: '2026-01-03T00:00:00.000Z', slaStatus: 'BREACHED' });

  const endpoints = [
    '/api/reports/service-profitability?branchId=' + branch.body.data.id,
    '/api/reports/technician-productivity?branchId=' + branch.body.data.id,
    '/api/reports/sla-performance?branchId=' + branch.body.data.id,
    '/api/reports/inventory-value?branchId=' + branch.body.data.id,
    '/api/reports/purchase-spend?branchId=' + branch.body.data.id,
    '/api/reports/accounts-receivable-aging?branchId=' + branch.body.data.id
  ];

  for (const endpoint of endpoints) {
    const res = await admin.get(endpoint);
    assert.equal(res.status, 200, endpoint);
  }

  assert.equal((await worker.get('/api/reports/branch-performance')).status, 403);
});

test('task6 localization settings control defaults and payment methods safely', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const worker = await login(app, 'worker-a@test.local');

  assert.equal((await worker.get('/api/company/localization')).status, 403);

  const saved = await admin.patch('/api/company/finance-settings').send({
    country: 'za',
    timezone: 'Africa/Johannesburg',
    defaultCurrency: 'zar',
    allowedCurrencies: ['ZAR', 'USD'],
    taxName: 'VAT',
    taxRate: 15,
    dateFormat: 'dd/MM/yyyy',
    numberFormat: 'en-ZA',
    quoteExpiryDays: 7,
    paymentTermsDays: 21,
    allowedPaymentMethods: ['BANK_TRANSFER', 'YOCO', 'EXTERNAL_PAYMENT_LINK'],
    paymentInstructions: 'Use bank EFT or Yoco link.'
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.country, 'ZA');
  assert.equal(saved.body.data.defaultCurrency, 'ZAR');
  assert.deepEqual(saved.body.data.allowedPaymentMethods, ['BANK_TRANSFER', 'YOCO', 'EXTERNAL_PAYMENT_LINK']);

  const localization = await admin.get('/api/company/localization');
  assert.equal(localization.status, 200);
  assert.equal(localization.body.data.timezone, 'Africa/Johannesburg');
  assert.equal(localization.body.data.schedulingTimezone, 'Africa/Johannesburg');

  const methods = await admin.get('/api/company/payment-methods');
  assert.equal(methods.status, 200);
  assert.equal(methods.body.data.methods.includes('YOCO'), true);
  assert.equal(methods.body.data.instructions, 'Use bank EFT or Yoco link.');

  const quote = await admin.post('/api/quotes').send({ customerId: 'customer-a', serviceId: 'service-a', title: 'Localized Quote', amount: 100 });
  assert.equal(quote.status, 201);
  assert.equal(quote.body.data.localization.defaultCurrency, 'ZAR');
  assert.ok(quote.body.data.validUntil);

  const invoice = await admin.post('/api/invoices').send({ customerId: 'customer-a', serviceId: 'service-a', amount: 100 });
  assert.equal(invoice.status, 201);
  assert.equal(invoice.body.data.localization.taxName, 'VAT');
  assert.ok(invoice.body.data.dueDate);

  const disallowed = await admin.post('/api/invoices/' + invoice.body.data.id + '/payments').send({ amount: 100, method: 'CASH', status: 'CONFIRMED' });
  assert.equal(disallowed.status, 400);

  const paid = await admin.post('/api/invoices/' + invoice.body.data.id + '/payments').send({ amount: 100, method: 'BANK_TRANSFER', status: 'CONFIRMED', reference: 'EFT-123' });
  assert.equal(paid.status, 201);
  assert.equal(app.locals.testDb.payments.some((payment) => payment.method === 'BANK_TRANSFER' && payment.reference === 'EFT-123'), true);
});

test('task6 public localization and notification templates are available', async () => {
  const app = await buildApp();
  app.locals.testDb.companyFinanceSettings.push({
    id: 'finance-public-a',
    companyId: 'company-a',
    country: 'ZW',
    timezone: 'Africa/Harare',
    defaultCurrency: 'USD',
    allowedCurrencies: ['USD', 'ZAR'],
    taxName: 'VAT',
    taxRate: 15,
    numberFormat: 'en-ZW',
    dateFormat: 'yyyy-MM-dd',
    quoteExpiryDays: 14,
    paymentTermsDays: 14,
    allowedPaymentMethods: ['CASH', 'PAYNOW']
  });

  const publicCompany = await request(app).get('/api/public/company');
  assert.equal(publicCompany.status, 200);
  assert.equal(publicCompany.body.data.localization.defaultCurrency, 'USD');
  assert.equal(publicCompany.body.data.localization.taxName, 'VAT');

  const services = await request(app).get('/api/public/services');
  assert.equal(services.status, 200);
  assert.equal(services.body.data[0].currency, 'USD');
  assert.equal(services.body.data[0].taxName, 'VAT');

  const { buildNotificationTemplate, buildWhatsAppTemplate } = require('../src/services/notificationTemplates.service');
  for (const eventType of ['CONTRACT_ACTIVATED', 'MAINTENANCE_VISIT_DUE', 'SLA_AT_RISK', 'SLA_BREACHED', 'JOB_PROOF_READY', 'INVOICE_OVERDUE', 'PURCHASE_SHORTAGE_BLOCKING_JOB']) {
    const email = buildNotificationTemplate(eventType, { company: { name: 'Company A' }, record: { id: 'record-1', title: 'Task 1', number: 'INV-1', total: 100 }, localization: { defaultCurrency: 'ZAR', numberFormat: 'en-ZA', timezone: 'Africa/Johannesburg' } });
    const whatsapp = buildWhatsAppTemplate(eventType, { record: { id: 'record-1', title: 'Task 1', number: 'INV-1', total: 100 }, localization: { defaultCurrency: 'ZAR', numberFormat: 'en-ZA' } });
    assert.equal(Boolean(email.subject), true);
    assert.equal(Boolean(email.text), true);
    assert.equal(Boolean(whatsapp.label), true);
    assert.equal(Boolean(whatsapp.text), true);
  }
});


test('task7 approval gate blocks invoice void until approved and executes once', async () => {
  const app = await buildApp();
  const admin = request.agent(app);
  const owner = request.agent(app);
  await admin.post('/api/auth/login').send({ email: 'admin-a@test.local', password: 'Password123!' });
  await owner.post('/api/auth/login').send({ email: 'owner-a@test.local', password: 'Password123!' });

  const policy = await owner.post('/api/approval-policies').send({ name: 'Invoice void control', eventType: 'INVOICE_VOID', thresholdAmount: 1, requiredApproverRole: 'OWNER', allowSelfApproval: false, reasonRequired: true });
  assert.equal(policy.status, 201);

  const blocked = await admin.post('/api/invoices/invoice-a/void').send({ reason: 'Duplicate invoice' });
  assert.equal(blocked.status, 202);
  assert.equal(blocked.body.data.approvalRequired, true);
  assert.equal(blocked.body.data.eventType, 'INVOICE_VOID');
  assert.equal(app.locals.testDb.invoices.find((invoice) => invoice.id === 'invoice-a').status !== 'VOID', true);

  const requestId = blocked.body.data.approvalRequestId;
  const approved = await owner.post('/api/approvals/' + requestId + '/approve').send({ decisionNote: 'Approved' });
  assert.equal(approved.status, 200);

  const executed = await owner.post('/api/approvals/' + requestId + '/execute').send({ decisionNote: 'Execute approved void' });
  assert.equal(executed.status, 200);
  assert.equal(app.locals.testDb.invoices.find((invoice) => invoice.id === 'invoice-a').status, 'VOID');

  const replay = await owner.post('/api/approvals/' + requestId + '/execute').send({ decisionNote: 'Replay' });
  assert.equal(replay.status, 409);
  assert.equal(app.locals.testDb.auditLogs.some((log) => log.action === 'APPROVAL_REQUIRED' && log.metadata && log.metadata.approvalRequestId === requestId), true);
});

test('task7 branch approval decisions are branch scoped and permissions are configurable', async () => {
  const app = await buildApp();
  const owner = request.agent(app);
  const admin = request.agent(app);
  await owner.post('/api/auth/login').send({ email: 'owner-a@test.local', password: 'Password123!' });
  await admin.post('/api/auth/login').send({ email: 'admin-a@test.local', password: 'Password123!' });

  const branchA = await owner.post('/api/branches').send({ name: 'North', code: 'NORTH' });
  const branchB = await owner.post('/api/branches').send({ name: 'South', code: 'SOUTH' });
  assert.equal(branchA.status, 201);
  assert.equal(branchB.status, 201);

  const permissions = await owner.get('/api/permissions');
  assert.equal(permissions.status, 200);
  assert.equal(permissions.body.data.keys.includes('payment.refund'), true);

  const access = await owner.post('/api/users/admin-a/branch-access').send({ branchId: branchA.body.data.id, permissions: ['approval.request.decide'] });
  assert.equal(access.status, 201);

  const policy = await owner.post('/api/approval-policies').send({ name: 'Branch refunds', branchId: branchB.body.data.id, eventType: 'PAYMENT_REFUND', thresholdAmount: 1, requiredApproverRole: 'ADMIN' });
  assert.equal(policy.status, 201);

  const requestBody = { policyId: policy.body.data.id, branchId: branchB.body.data.id, eventType: 'PAYMENT_REFUND', entityType: 'Payment', entityId: 'payment-a', actionKey: 'payment.refund', amount: 100, reason: 'Client refund' };
  const approval = await owner.post('/api/approvals').send(requestBody);
  assert.equal(approval.status, 201);

  const denied = await admin.post('/api/approvals/' + approval.body.data.id + '/approve').send({ decisionNote: 'Wrong branch' });
  assert.equal(denied.status, 403);

  const rejected = await owner.post('/api/approvals/' + approval.body.data.id + '/reject').send({ decisionNote: 'No refund' });
  assert.equal(rejected.status, 200);
  const executeRejected = await owner.post('/api/approvals/' + approval.body.data.id + '/execute').send({});
  assert.equal(executeRejected.status, 409);
});

test('task7 audit filters work and redact secret-like metadata', async () => {
  const app = await buildApp();
  const owner = request.agent(app);
  await owner.post('/api/auth/login').send({ email: 'owner-a@test.local', password: 'Password123!' });

  const policy = await owner.post('/api/approval-policies').send({ name: 'Stock control', eventType: 'STOCK_ADJUSTMENT', thresholdAmount: 1, requiredApproverRole: 'OWNER', allowSelfApproval: false });
  assert.equal(policy.status, 201);
  const item = await owner.post('/api/inventory/items').send({ name: 'Cable', sku: 'CBL-T7', unitOfMeasure: 'each' });
  const location = await owner.post('/api/stock-locations').send({ name: 'Main Store', type: 'WAREHOUSE' });
  const blocked = await owner.post('/api/inventory/adjustments').send({ itemId: item.body.data.id, locationId: location.body.data.id, movementType: 'ADJUSTMENT_IN', quantity: 10, unitCost: 5, reason: 'secretToken=abc should not leak' });
  assert.equal(blocked.status, 202);

  const logs = await owner.get('/api/audit-logs?action=APPROVAL_REQUIRED');
  assert.equal(logs.status, 200);
  assert.equal(logs.body.data.length >= 1, true);
  assert.equal(JSON.stringify(logs.body.data).includes('abc'), false);
});

test('task8 accounting provider connect stores encrypted tokens and syncs invoice idempotently', async () => {
  const app = await buildApp();
  const adminA = await login(app, 'admin-a@test.local');
  const adminB = await login(app, 'admin-b@test.local');

  const integration = await adminA.post('/api/finance/integrations').send({ provider: 'XERO', externalTenantId: 'tenant-a', config: { tenantName: 'A Books', webhookSecret: 'whsec-test' } });
  assert.equal(integration.status, 201);
  assert.equal(JSON.stringify(integration.body.data).includes('whsec-test'), false);

  const connected = await adminA.post('/api/finance/integrations/' + integration.body.data.id + '/connect').send({ mockMode: true, tokens: { accessToken: 'access-secret', refreshToken: 'refresh-secret' } });
  assert.equal(connected.status, 200);
  assert.equal(connected.body.data.integration.status, 'ACTIVE');
  assert.equal(JSON.stringify(connected.body).includes('access-secret'), false);
  assert.equal(app.locals.testDb.financeIntegrationSecrets.length, 2);
  assert.equal(JSON.stringify(app.locals.testDb.financeIntegrationSecrets).includes('access-secret'), false);

  const mapping = await adminA.put('/api/finance/mappings/XERO').send({ integrationId: integration.body.data.id, revenueAccountCode: '200', taxRateId: 'OUTPUT', paymentsAccountCode: '610', customerNamingRule: 'CUSTOMER_NAME' });
  assert.equal(mapping.status, 200);
  assert.equal(mapping.body.data.revenueAccountCode, '200');

  const synced = await adminA.post('/api/finance/integrations/' + integration.body.data.id + '/sync/invoices/invoice-a').send({});
  assert.equal(synced.status, 201);
  assert.equal(synced.body.data.link.externalId, 'xero-invoice-invoice-a');
  assert.equal(app.locals.testDb.externalRecordLinks.filter((link) => link.localType === 'INVOICE' && link.localId === 'invoice-a').length, 1);

  const retried = await adminA.post('/api/finance/integrations/' + integration.body.data.id + '/sync/invoices/invoice-a').send({});
  assert.equal(retried.status, 200);
  assert.equal(retried.body.data.skipped, true);
  assert.equal(app.locals.testDb.externalRecordLinks.filter((link) => link.localType === 'INVOICE' && link.localId === 'invoice-a').length, 1);

  assert.equal((await adminB.post('/api/finance/integrations/' + integration.body.data.id + '/sync/invoices/invoice-a').send({})).status, 404);
});

test('task8 disconnected and failed accounting syncs are logged safely', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');

  const integration = await admin.post('/api/finance/integrations').send({ provider: 'XERO', externalTenantId: 'tenant-a', config: { tenantName: 'A Books' } });
  assert.equal(integration.status, 201);

  const disconnected = await admin.post('/api/finance/integrations/' + integration.body.data.id + '/sync/invoices/invoice-a').send({});
  assert.equal(disconnected.status, 409);

  const connected = await admin.post('/api/finance/integrations/' + integration.body.data.id + '/connect').send({ mockMode: true });
  assert.equal(connected.status, 200);
  const updated = await admin.patch('/api/finance/integrations/' + integration.body.data.id).send({ config: { mockMode: true, failNextSync: true } });
  assert.equal(updated.status, 200);

  const failed = await admin.post('/api/finance/integrations/' + integration.body.data.id + '/sync/invoices/invoice-a').send({});
  assert.equal(failed.status, 502);
  assert.equal(failed.body.data.log.status, 'FAILED');

  const logs = await admin.get('/api/finance/sync-logs?provider=XERO');
  assert.equal(logs.status, 200);
  assert.equal(logs.body.data.some((log) => log.status === 'FAILED' && log.errorMessage.includes('Mock provider failure')), true);
});

test('task8 accounting webhooks reject bad signatures and record good events', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');

  const integration = await admin.post('/api/finance/integrations').send({ provider: 'XERO', externalTenantId: 'tenant-a', config: { webhookSecret: 'whsec-test', mockMode: true } });
  assert.equal(integration.status, 201);
  await admin.post('/api/finance/integrations/' + integration.body.data.id + '/connect').send({ mockMode: true });

  const bad = await request(app).post('/api/finance/webhooks/XERO/company-a').set('x-fieldcore-signature', 'bad').send({ eventId: 'evt-bad', eventType: 'invoice.updated' });
  assert.equal(bad.status, 401);

  const payload = { eventId: 'evt-good', eventType: 'invoice.updated' };
  const signature = crypto.createHmac('sha256', 'whsec-test').update(JSON.stringify(payload)).digest('hex');
  const good = await request(app).post('/api/finance/webhooks/XERO/company-a').set('x-fieldcore-signature', signature).send(payload);
  assert.equal(good.status, 200);
  assert.equal(good.body.data.event.status, 'PROCESSED');
  assert.equal(app.locals.testDb.financeWebhookEvents.some((event) => event.status === 'REJECTED'), true);
  assert.equal(app.locals.testDb.financeWebhookEvents.some((event) => event.eventId === 'evt-good' && event.signatureValid === true), true);

  const csv = await admin.get('/api/finance/export/invoices.csv');
  assert.equal(csv.status, 200);
  assert.equal(csv.headers['content-type'].includes('text/csv'), true);
});


test('task9 payment link webhook confirms trusted provider payment idempotently', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const client = await loginClient(app);

  const provider = await admin.post('/api/payment-providers').send({ provider: 'MOCK', status: 'ACTIVE', displayName: 'Mock collections', config: { mockMode: true, webhookSecret: 'pay-whsec' }, secrets: { apiKey: 'pay-secret' } });
  assert.equal(provider.status, 201);
  assert.equal(JSON.stringify(provider.body).includes('pay-secret'), false);
  assert.equal(JSON.stringify(provider.body).includes('pay-whsec'), false);

  const link = await admin.post('/api/invoices/invoice-a/payment-links').send({ providerConnectionId: provider.body.data.id, amount: 40, currency: 'USD', sendNow: true });
  assert.equal(link.status, 201);
  assert.equal(link.body.data.status, 'SENT');
  assert.equal(link.body.data.checkoutUrl.includes(link.body.data.reference), true);

  const bad = await request(app).post('/api/payment-webhooks/MOCK/company-a').set('x-fieldcore-payment-signature', 'bad').send({ eventId: 'payevt-bad', reference: link.body.data.reference, providerPaymentId: 'pp-bad', amount: 40, status: 'CONFIRMED' });
  assert.equal(bad.status, 401);

  const payload = { eventId: 'payevt-good', eventType: 'payment.succeeded', reference: link.body.data.reference, providerPaymentId: 'pp-good', amount: 40, currency: 'USD', status: 'CONFIRMED' };
  const signature = crypto.createHmac('sha256', 'pay-whsec').update(JSON.stringify(payload)).digest('hex');
  const good = await request(app).post('/api/payment-webhooks/MOCK/company-a').set('x-fieldcore-payment-signature', signature).send(payload);
  assert.equal(good.status, 200);
  assert.equal(app.locals.testDb.payments.filter((payment) => payment.providerPaymentId === 'pp-good').length, 1);
  assert.equal(app.locals.testDb.receipts.some((receipt) => receipt.paymentId === app.locals.testDb.payments.find((payment) => payment.providerPaymentId === 'pp-good').id), true);
  assert.equal(app.locals.testDb.invoices.find((invoice) => invoice.id === 'invoice-a').balanceDue, 60);

  const duplicate = await request(app).post('/api/payment-webhooks/MOCK/company-a').set('x-fieldcore-payment-signature', signature).send(payload);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.data.duplicate, true);
  assert.equal(app.locals.testDb.payments.filter((payment) => payment.providerPaymentId === 'pp-good').length, 1);

  const clientInvoice = await client.get('/api/client/invoices/invoice-a');
  assert.equal(clientInvoice.status, 200);
  assert.equal(clientInvoice.body.data.paymentLinks.some((item) => item.status === 'PAID'), true);
});

test('task9 reconciliation reminders and deposit schedule gate are safe', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');

  const settings = await admin.patch('/api/company/finance-settings').send({ enforceQuoteDepositBeforeScheduling: true, reminderThrottleHours: 24 });
  assert.equal(settings.status, 200);

  app.locals.testDb.quotes.push({ id: 'quote-deposit-a', companyId: 'company-a', customerId: 'customer-a', serviceId: 'service-a', jobId: 'job-a', title: 'Deposit quote', status: 'ACCEPTED', amount: 100, subtotal: 100, total: 100, balanceDue: 100, depositRequiredAmount: 25, createdAt: '2026-01-01T00:00:00.000Z' });
  const blockedSchedule = await admin.post('/api/jobs/job-a/schedule').send({ workerId: 'wp-a', startsAt: '2026-01-15T09:00:00.000Z', durationMinutes: 60, adminOverride: true });
  assert.equal(blockedSchedule.status, 409);

  app.locals.testDb.quotes.find((quote) => quote.id === 'quote-deposit-a').depositPaidAt = '2026-01-02T00:00:00.000Z';

  const imported = await admin.post('/api/reconciliation/imports').send({ provider: 'MANUAL_BANK', providerPaymentId: 'bank-1', reference: 'INV-A', amount: 30, currency: 'USD', payerName: 'Customer A' });
  assert.equal(imported.status, 201);
  const matched = await admin.post('/api/reconciliation/items/' + imported.body.data.id + '/match').send({ invoiceId: 'invoice-a', method: 'BANK_TRANSFER' });
  assert.equal(matched.status, 200);
  assert.equal(matched.body.data.item.status, 'MATCHED');
  assert.equal(app.locals.testDb.invoices.find((invoice) => invoice.id === 'invoice-a').balanceDue, 70);
  assert.equal((await admin.post('/api/reconciliation/items/' + imported.body.data.id + '/match').send({ invoiceId: 'invoice-a', method: 'BANK_TRANSFER' })).status, 409);

  const reminder = await admin.post('/api/collections/invoices/invoice-a/reminders').send({ channel: 'EMAIL' });
  assert.equal(reminder.status, 200);
  const throttled = await admin.post('/api/collections/invoices/invoice-a/reminders').send({ channel: 'EMAIL' });
  assert.equal(throttled.status, 202);
  assert.equal(throttled.body.data.throttled, true);

  const collections = await admin.get('/api/collections');
  assert.equal(collections.status, 200);
  assert.equal(typeof collections.body.data.buckets.days0to30, 'number');
});

test('task9 refunds create approval-gated refund records and credit notes', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const admin = await login(app, 'admin-a@test.local');

  const policy = await owner.post('/api/approval-policies').send({ name: 'Refunds', eventType: 'PAYMENT_REFUND', thresholdAmount: 1, requiredApproverRole: 'OWNER', allowSelfApproval: false });
  assert.equal(policy.status, 201);
  const payment = await admin.post('/api/invoices/invoice-a/payments').send({ amount: 10, method: 'CASH', status: 'CONFIRMED', reference: 'cash-refund-test' });
  assert.equal(payment.status, 201);
  const paymentId = app.locals.testDb.payments.find((item) => item.reference === 'cash-refund-test').id;
  const blocked = await admin.post('/api/payments/' + paymentId + '/refund').send({ amount: 10, reason: 'Customer refund' });
  assert.equal(blocked.status, 202);
  assert.equal(blocked.body.data.approvalRequired, true);
  assert.equal(app.locals.testDb.paymentRefunds.some((refund) => refund.paymentId === paymentId && refund.status === 'APPROVAL_REQUIRED'), true);

  app.locals.testDb.approvalPolicies = [];
  const provider = await owner.post('/api/payment-providers').send({ provider: 'MOCK', status: 'ACTIVE', config: { mockMode: true } });
  assert.equal(provider.status, 201);
  const refund = await owner.post('/api/payments/' + paymentId + '/refund').send({ amount: 10, reason: 'Approved refund', providerConnectionId: provider.body.data.id });
  assert.equal(refund.status, 200);
  assert.equal(refund.body.data.status, 'REFUNDED');
  assert.equal(app.locals.testDb.creditNotes.some((note) => note.invoiceId === 'invoice-a' && note.status === 'ISSUED'), true);
});


test('task10 revoked device cannot sync and admin can resolve conflicts', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');
  const owner = await login(app, 'owner-a@test.local');

  const registered = await worker.post('/api/worker/devices/register').send({ platform: 'ANDROID', deviceName: 'Samsung A22', deviceModel: 'SM-A226B', appVersion: '1.0.0', deviceId: 'device-task10-a' });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.data.active, true);

  const revoke = await owner.patch('/api/admin/worker-devices/' + registered.body.data.id + '/revoke').send({ reason: 'Lost phone' });
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.data.active, false);

  const blocked = await worker.post('/api/worker/sync/v2/push').send({ deviceId: 'device-task10-a', actions: [{ idempotencyKey: 'task10-revoked-note', actionType: 'JOB_NOTE', payload: { jobId: 'job-a', note: 'Should not sync' } }] });
  assert.equal(blocked.status, 403);

  app.locals.testDb.workerDevices.push({ id: 'device-active-task10', companyId: 'company-a', workerId: 'wp-a', userId: 'worker-a', platform: 'ANDROID', deviceId: 'device-task10-b', active: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  app.locals.testDb.jobs.find((job) => job.id === 'job-a').updatedAt = '2026-01-10T12:00:00.000Z';
  const conflict = await worker.post('/api/worker/sync/v2/push').send({ deviceId: 'device-task10-b', actions: [{ idempotencyKey: 'task10-conflict-001', actionType: 'JOB_NOTE', snapshotUpdatedAt: '2026-01-10T10:00:00.000Z', payload: { jobId: 'job-a', note: 'Old offline edit' } }] });
  assert.equal(conflict.status, 200);
  assert.equal(conflict.body.data.results[0].status, 'CONFLICT');

  const actionId = app.locals.testDb.offlineActionQueues.find((item) => item.idempotencyKey === 'task10-conflict-001').id;
  const resolved = await owner.post('/api/admin/offline-actions/' + actionId + '/resolve').send({ resolutionNote: 'Admin accepted server version' });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.data.status, 'RESOLVED');
});

test('task10 checklist completion blocks and then allows offline job completion', async () => {
  const app = await buildApp();
  const worker = await login(app, 'worker-a@test.local');
  const owner = await login(app, 'owner-a@test.local');

  const template = await owner.post('/api/checklist-templates').send({
    serviceId: 'service-a',
    name: 'Solar completion checklist',
    requiredForCompletion: true,
    items: [
      { label: 'Before photo captured', required: true, photoRequired: true, answerType: 'PHOTO' },
      { label: 'Panels inspected', required: true, passFail: true, answerType: 'PASS_FAIL' }
    ]
  });
  assert.equal(template.status, 201);
  const photoItem = template.body.data.items[0];
  const passItem = template.body.data.items[1];

  const registered = await worker.post('/api/worker/devices/register').send({ platform: 'ANDROID', deviceName: 'Field phone', deviceId: 'device-task10-checklist' });
  assert.equal(registered.status, 201);

  const blocked = await worker.post('/api/worker/sync/v2/push').send({ deviceId: 'device-task10-checklist', actions: [{ idempotencyKey: 'task10-complete-blocked', actionType: 'JOB_COMPLETE', payload: { jobId: 'job-a', completionNotes: 'Done offline' } }] });
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.data.results[0].status, 'FAILED');
  assert.equal(app.locals.testDb.jobs.find((job) => job.id === 'job-a').status, 'SCHEDULED');

  const checklist = await worker.post('/api/worker/sync/v2/push').send({ deviceId: 'device-task10-checklist', actions: [{ idempotencyKey: 'task10-checklist-001', actionType: 'CHECKLIST_COMPLETED', payload: { jobId: 'job-a', templateId: template.body.data.id, answers: [{ itemId: photoItem.id, photoUrl: '/uploads/proof/checklist.jpg', answer: 'Captured' }, { itemId: passItem.id, passed: true, answer: 'Pass' }] } }] });
  assert.equal(checklist.status, 200);
  assert.equal(checklist.body.data.results[0].status, 'PROCESSED');
  assert.equal(app.locals.testDb.jobChecklistAnswers.length, 2);

  const complete = await worker.post('/api/worker/sync/v2/push').send({ deviceId: 'device-task10-checklist', actions: [{ idempotencyKey: 'task10-complete-ok', actionType: 'JOB_COMPLETE', payload: { jobId: 'job-a', completionNotes: 'Checklist done' } }] });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.data.results[0].status, 'PROCESSED');
  assert.equal(app.locals.testDb.jobs.find((job) => job.id === 'job-a').status, 'COMPLETED');

  const duplicate = await worker.post('/api/worker/sync/v2/push').send({ deviceId: 'device-task10-checklist', actions: [{ idempotencyKey: 'task10-complete-ok', actionType: 'JOB_COMPLETE', payload: { jobId: 'job-a' } }] });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.data.results[0].status, 'DUPLICATE');
});

test('task11 preventive maintenance generates included then overage contract jobs', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  app.locals.testDb.assets.push({ id: 'asset-task11', companyId: 'company-a', customerId: 'customer-a', name: 'RTU 01', assetType: 'HVAC', warrantyEndAt: '2027-01-01T00:00:00.000Z', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z' });

  const contract = await admin.post('/api/service-contracts').send({ contractNumber: 'TASK11-C-1', name: 'Quarterly HVAC Care', customerId: 'customer-a', status: 'ACTIVE', startDate: '2026-01-01', contractValue: 1200, contractMonthlyValue: 100, billingInterval: 'MONTHLY', includedVisits: 1, overageBillingRate: 75, responseSlaHours: 4, completionSlaHours: 24 });
  assert.equal(contract.status, 201);
  const assetLink = await admin.post('/api/service-contracts/' + contract.body.data.id + '/assets').send({ assetId: 'asset-task11' });
  assert.equal(assetLink.status, 201);
  const line = await admin.post('/api/service-contracts/' + contract.body.data.id + '/service-lines').send({ serviceId: 'service-a', title: 'Quarterly PM', frequency: 'MONTHLY', visitsPerPeriod: 1, nextDueAt: '2026-01-01T09:00:00.000Z', defaultDurationMinutes: 60, requiresProofPhotos: true });
  assert.equal(line.status, 201);

  const generated = await admin.post('/api/service-contracts/' + contract.body.data.id + '/generate-planned-jobs').send({ through: '2026-01-02T00:00:00.000Z' });
  assert.equal(generated.status, 201);
  assert.equal(generated.body.data.generated.length, 1);
  assert.equal(generated.body.data.generated[0].contractBillingStatus, 'INCLUDED');
  assert.equal(app.locals.testDb.contractVisitUsages.length, 1);

  const overage = await admin.post('/api/service-contracts/' + contract.body.data.id + '/evaluate-entitlement').send({ serviceId: 'service-a', contractLineId: line.body.data.id });
  assert.equal(overage.status, 200);
  assert.equal(overage.body.data.billingStatus, 'OVERAGE');
});

test('task11 SLA evaluation waiver and warranty billing protection are safe', async () => {
  const app = await buildApp();
  const owner = await login(app, 'owner-a@test.local');
  const admin = await login(app, 'admin-a@test.local');
  app.locals.testDb.jobs.find((job) => job.id === 'job-a').completionDueAt = '2026-01-01T10:00:00.000Z';
  app.locals.testDb.jobs.find((job) => job.id === 'job-a').slaStatus = 'ON_TRACK';

  const breach = await admin.post('/api/jobs/job-a/sla/evaluate').send({ now: '2026-01-02T10:00:00.000Z' });
  assert.equal(breach.status, 200);
  assert.equal(breach.body.data.slaStatus, 'BREACHED');

  const policy = await owner.post('/api/approval-policies').send({ name: 'SLA waiver', eventType: 'SLA_WAIVE', requiredApproverRole: 'OWNER', allowSelfApproval: false });
  assert.equal(policy.status, 201);
  const waiver = await admin.post('/api/jobs/job-a/sla/waive').send({ reason: 'Customer approved weather delay' });
  assert.equal(waiver.status, 202);
  assert.equal(waiver.body.data.approvalRequired, true);

  app.locals.testDb.approvalPolicies = [];
  const warranty = await admin.post('/api/jobs/job-a/warranty').send({ warrantyRelated: true });
  assert.equal(warranty.status, 200);
  assert.equal(warranty.body.data.contractBillingStatus, 'WARRANTY');
  assert.equal(warranty.body.data.total, 0);
});

test('task11 asset history is tenant scoped and contract profitability summarizes margins', async () => {
  const app = await buildApp();
  const admin = await login(app, 'admin-a@test.local');
  const adminB = await login(app, 'admin-b@test.local');
  app.locals.testDb.assets.push({ id: 'asset-history-a', companyId: 'company-a', customerId: 'customer-a', name: 'Solar Inverter', assetType: 'Solar', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z' });
  app.locals.testDb.assets.push({ id: 'asset-history-b', companyId: 'company-b', customerId: 'customer-b', name: 'Other Asset', assetType: 'Solar', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z' });
  app.locals.testDb.jobAssets.push({ id: 'ja-task11', companyId: 'company-a', jobId: 'job-a', assetId: 'asset-history-a', primaryAsset: true, createdAt: '2026-01-01T00:00:00.000Z' });
  app.locals.testDb.jobPartUsages.push({ id: 'part-task11', companyId: 'company-a', jobId: 'job-a', itemId: 'item-task11', quantityUsed: 2, unitCost: 5, status: 'USED', createdAt: '2026-01-01T00:00:00.000Z' });
  app.locals.testDb.inventoryItems.push({ id: 'item-task11', companyId: 'company-a', sku: 'FUSE', name: 'Fuse', unitCost: 5, active: true, createdAt: '2026-01-01T00:00:00.000Z' });

  const incident = await admin.post('/api/assets/asset-history-a/incidents').send({ title: 'Breaker fault', severity: 'HIGH' });
  assert.equal(incident.status, 201);
  const doc = await admin.post('/api/assets/asset-history-a/compliance-documents').send({ title: 'Completion proof', documentType: 'PHOTO', url: '/uploads/proof/task11.jpg' });
  assert.equal(doc.status, 201);

  const history = await admin.get('/api/assets/asset-history-a/history');
  assert.equal(history.status, 200);
  assert.equal(history.body.data.incidents.length, 1);
  assert.equal(history.body.data.complianceDocuments.length, 1);
  assert.equal(history.body.data.partsUsed.length, 1);

  const blocked = await adminB.get('/api/assets/asset-history-a/history');
  assert.equal(blocked.status, 404);

  app.locals.testDb.serviceContracts.push({ id: 'contract-profit-task11', companyId: 'company-a', customerId: 'customer-a', contractNumber: 'PROFIT-1', name: 'Profit Contract', status: 'ACTIVE', startDate: '2026-01-01T00:00:00.000Z', contractMonthlyValue: 100, contractValue: 1200, billingInterval: 'MONTHLY', createdAt: '2026-01-01T00:00:00.000Z' });
  app.locals.testDb.jobs.find((job) => job.id === 'job-a').contractId = 'contract-profit-task11';
  app.locals.testDb.jobs.find((job) => job.id === 'job-a').contractBillingStatus = 'BILLABLE';
  app.locals.testDb.jobs.find((job) => job.id === 'job-a').status = 'COMPLETED';
  const report = await admin.get('/api/reports/contract-profitability');
  assert.equal(report.status, 200);
  const row = report.body.data.rows.find((item) => item.contractId === 'contract-profit-task11');
  assert.equal(Boolean(row), true);
  assert.equal(row.jobsDelivered, 1);
  assert.equal(row.partsCost, 10);
});
