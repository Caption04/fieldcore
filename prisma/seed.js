const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const saasPlans = [
  {
    id: 'starter',
    name: 'Basic',
    description: '10–15 field workers, one office team, and recurring commercial jobs.',
    price: 500,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    limits: { maxUsers: 6, maxWorkers: 15, maxClients: 500, maxJobsPerMonth: 750, maxPublicBookingsPerMonth: 250, maxStorageMb: 10240, maxWhatsAppNotificationsPerMonth: 500, maxEmailNotificationsPerMonth: 2500 },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: false, customBranding: false, multiLocation: false, apiAccess: false, annualFirst: false, implementationFee: false, customPricing: false }
  },
  {
    id: 'growth',
    name: 'Standard',
    description: '15–40 field workers, multi-site work, stronger reporting, and client portal usage.',
    price: 1500,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    limits: { maxUsers: 20, maxWorkers: 40, maxClients: 2500, maxJobsPerMonth: 5000, maxPublicBookingsPerMonth: 1500, maxStorageMb: 51200, maxWhatsAppNotificationsPerMonth: 5000, maxEmailNotificationsPerMonth: 25000 },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: false, annualFirst: true, implementationFee: true, customPricing: false }
  },
  {
    id: 'business',
    name: 'Enterprise',
    description: 'Multi-branch, high-volume operations with contracts, SLA controls, integrations, and onboarding.',
    price: 3500,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    limits: { maxUsers: null, maxWorkers: null, maxClients: null, maxJobsPerMonth: null, maxPublicBookingsPerMonth: null, maxStorageMb: null, maxWhatsAppNotificationsPerMonth: null, maxEmailNotificationsPerMonth: null },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: true, annualFirst: true, implementationFee: true, customPricing: true, advertisedPrice: 'Contact us' }
  },
  {
    id: 'free-internal',
    name: 'Free Internal',
    description: 'Internal, demo, and test companies.',
    price: 0,
    currency: 'USD',
    interval: 'month',
    isActive: false,
    limits: { maxUsers: null, maxWorkers: null, maxClients: null, maxJobsPerMonth: null, maxPublicBookingsPerMonth: null, maxStorageMb: null, maxWhatsAppNotificationsPerMonth: null, maxEmailNotificationsPerMonth: null },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: true }
  }
];

async function main() {
  const password = process.env.DEMO_PASSWORD || 'FieldCoreDemo2026!';
  const hash = await bcrypt.hash(password, 12);
  const company = await prisma.company.upsert({
    where: { id: 'demo-company' },
    update: {
      name: 'FieldCore Demo Services',
      legalName: 'FieldCore Demo Services (Private) Limited',
      tradingName: 'FieldCore Demo Services',
      registrationNumber: 'DEMO-2026',
      taxNumber: 'TAX-DEMO-001',
      address: 'Demo House, Harare',
      phone: '+263 000 000 000',
      email: 'support@fieldcore.test'
    },
    create: {
      id: 'demo-company',
      name: 'FieldCore Demo Services',
      legalName: 'FieldCore Demo Services (Private) Limited',
      tradingName: 'FieldCore Demo Services',
      registrationNumber: 'DEMO-2026',
      taxNumber: 'TAX-DEMO-001',
      address: 'Demo House, Harare',
      phone: '+263 000 000 000',
      email: 'support@fieldcore.test'
    }
  });

  if (prisma.saaSPlan && prisma.companySubscription) {
    for (const plan of saasPlans) {
      await prisma.saaSPlan.upsert({ where: { id: plan.id }, update: plan, create: plan });
    }

    await prisma.companySubscription.upsert({
      where: { companyId: company.id },
      update: {
        planId: 'free-internal',
        status: 'FREE_INTERNAL',
        provider: 'manual',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      create: {
        companyId: company.id,
        planId: 'free-internal',
        status: 'FREE_INTERNAL',
        provider: 'manual',
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
  }


  await prisma.companyBranding.upsert({
    where: { companyId: company.id },
    update: {
      brandName: 'FieldCore Demo Services',
      primaryColor: '#1d65bc',
      secondaryColor: '#ffe386',
      accentColor: '#12a96d',
      supportEmail: 'support@fieldcore.test',
      supportPhone: '+263 000 000 000',
      websiteUrl: 'https://fieldcore.test',
      invoiceFooter: 'Thank you for choosing FieldCore Demo Services.',
      invoiceTerms: 'Payment is due within 14 days unless otherwise agreed.'
    },
    create: {
      companyId: company.id,
      brandName: 'FieldCore Demo Services',
      primaryColor: '#1d65bc',
      secondaryColor: '#ffe386',
      accentColor: '#12a96d',
      supportEmail: 'support@fieldcore.test',
      supportPhone: '+263 000 000 000',
      websiteUrl: 'https://fieldcore.test',
      invoiceFooter: 'Thank you for choosing FieldCore Demo Services.',
      invoiceTerms: 'Payment is due within 14 days unless otherwise agreed.'
    }
  });



  await prisma.companyFinanceSettings.upsert({
    where: { companyId: company.id },
    update: {
      country: 'ZW',
      timezone: 'Africa/Harare',
      defaultCurrency: 'USD',
      allowedCurrencies: ['USD', 'ZAR'],
      taxName: 'VAT',
      taxRate: 15,
      pricesIncludeTax: false,
      dateFormat: 'yyyy-MM-dd',
      numberFormat: 'en-ZW',
      invoicePrefix: 'INV',
      receiptPrefix: 'RCT',
      quoteExpiryDays: 14,
      paymentTermsDays: 14,
      allowedPaymentMethods: ['CASH', 'BANK_TRANSFER', 'PAYNOW', 'PAYFAST', 'YOCO', 'OZOW', 'SNAPSCAN', 'MANUAL_CARD', 'EXTERNAL_PAYMENT_LINK', 'CUSTOM_MANUAL'],
      paymentInstructions: 'Demo bank transfer, Paynow, or manual external payment reference.'
    },
    create: {
      companyId: company.id,
      country: 'ZW',
      timezone: 'Africa/Harare',
      defaultCurrency: 'USD',
      allowedCurrencies: ['USD', 'ZAR'],
      taxName: 'VAT',
      taxRate: 15,
      pricesIncludeTax: false,
      dateFormat: 'yyyy-MM-dd',
      numberFormat: 'en-ZW',
      invoicePrefix: 'INV',
      receiptPrefix: 'RCT',
      quoteExpiryDays: 14,
      paymentTermsDays: 14,
      allowedPaymentMethods: ['CASH', 'BANK_TRANSFER', 'PAYNOW', 'PAYFAST', 'YOCO', 'OZOW', 'SNAPSCAN', 'MANUAL_CARD', 'EXTERNAL_PAYMENT_LINK', 'CUSTOM_MANUAL'],
      paymentInstructions: 'Demo bank transfer, Paynow, or manual external payment reference.'
    }
  });

  const owner = await prisma.user.upsert({
    where: { email: process.env.DEMO_OWNER_EMAIL || 'owner@fieldcore.test' },
    update: { passwordHash: hash, role: 'OWNER', companyId: company.id },
    create: { companyId: company.id, email: process.env.DEMO_OWNER_EMAIL || 'owner@fieldcore.test', name: 'Demo Owner', role: 'OWNER', passwordHash: hash }
  });

  await prisma.user.upsert({
    where: { email: 'admin@fieldcore.test' },
    update: { passwordHash: hash, role: 'ADMIN', companyId: company.id },
    create: { companyId: company.id, email: 'admin@fieldcore.test', name: 'Demo Admin', role: 'ADMIN', passwordHash: hash }
  });

  const workerUser = await prisma.user.upsert({
    where: { email: 'worker@fieldcore.test' },
    update: { passwordHash: hash, role: 'WORKER', companyId: company.id },
    create: { companyId: company.id, email: 'worker@fieldcore.test', name: 'Sam Technician', role: 'WORKER', passwordHash: hash }
  });

  const fieldTechnicianRole = await prisma.workerRole.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Field Technician' } },
    update: { active: true },
    create: { companyId: company.id, name: 'Field Technician', active: true }
  });

  const worker = await prisma.workerProfile.upsert({
    where: { userId: workerUser.id },
    update: { companyId: company.id, roleId: fieldTechnicianRole.id, title: 'Field Technician', phone: '+1 555 0104', active: true },
    create: { companyId: company.id, userId: workerUser.id, roleId: fieldTechnicianRole.id, title: 'Field Technician', phone: '+1 555 0104', active: true }
  });



  const branch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: 'HARARE' } },
    update: { name: 'Harare Operations', country: 'ZW', city: 'Harare', timezone: 'Africa/Harare', active: true },
    create: { companyId: company.id, name: 'Harare Operations', code: 'HARARE', country: 'ZW', city: 'Harare', timezone: 'Africa/Harare', active: true }
  });

  const customer = await prisma.customer.upsert({
    where: { id: 'demo-customer' },
    update: {},
    create: { id: 'demo-customer', companyId: company.id, name: 'North Ridge Apartments', email: 'ops@northridge.test', phone: '+1 555 0120', address: '1400 Ridge Avenue', notes: 'Preferred morning appointments.' }
  });

  const service = await prisma.service.upsert({
    where: { id: 'demo-service' },
    update: {},
    create: { id: 'demo-service', companyId: company.id, name: 'HVAC Preventive Maintenance', description: 'Quarterly inspection and filter replacement.', price: 450 }
  });

  const scheduledStart = new Date();
  scheduledStart.setHours(10, 0, 0, 0);
  const scheduledEnd = new Date(scheduledStart);
  scheduledEnd.setHours(12, 0, 0, 0);

  const job = await prisma.job.upsert({
    where: { id: 'demo-job' },
    update: { scheduledStart, scheduledEnd, branchId: branch.id },
    create: { id: 'demo-job', companyId: company.id, branchId: branch.id, customerId: customer.id, serviceId: service.id, workerId: worker.id, title: 'Rooftop unit inspection', description: 'Inspect rooftop HVAC units and capture service notes.', status: 'SCHEDULED', scheduledStart, scheduledEnd, total: 450 }
  });

  await prisma.scheduleItem.upsert({
    where: { id: 'demo-schedule' },
    update: { startsAt: scheduledStart, endsAt: scheduledEnd },
    create: { id: 'demo-schedule', companyId: company.id, jobId: job.id, workerId: worker.id, startsAt: scheduledStart, endsAt: scheduledEnd, notes: 'Bring filter set A.' }
  });

  const quote = await prisma.quote.upsert({
    where: { id: 'demo-quote' },
    update: { subtotal: 450, total: 450, amount: 450 },
    create: { id: 'demo-quote', companyId: company.id, branchId: branch.id, customerId: customer.id, serviceId: service.id, jobId: job.id, title: 'Quarterly HVAC maintenance', status: 'SENT', sentAt: new Date(), amount: 450, subtotal: 450, total: 450 }
  });

  await prisma.quoteLineItem.upsert({
    where: { id: 'demo-quote-line' },
    update: { unitPrice: 450, lineTotal: 450 },
    create: { id: 'demo-quote-line', companyId: company.id, quoteId: quote.id, serviceId: service.id, description: 'Quarterly HVAC maintenance', quantity: 1, unitPrice: 450, lineTotal: 450 }
  });

  await prisma.companyInvoiceCounter.upsert({
    where: { companyId: company.id },
    update: { nextNumber: 2 },
    create: { companyId: company.id, nextNumber: 2 }
  });

  const invoice = await prisma.invoice.upsert({
    where: { companyId_number: { companyId: company.id, number: 'INV-0001' } },
    update: { subtotal: 450, total: 450, amount: 450, balanceDue: 450 },
    create: { companyId: company.id, branchId: branch.id, customerId: customer.id, serviceId: service.id, jobId: job.id, quoteId: quote.id, number: 'INV-0001', status: 'SENT', amount: 450, subtotal: 450, total: 450, balanceDue: 450, dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) }
  });

  await prisma.invoiceLineItem.upsert({
    where: { id: 'demo-invoice-line' },
    update: { unitPrice: 450, lineTotal: 450 },
    create: { id: 'demo-invoice-line', companyId: company.id, invoiceId: invoice.id, serviceId: service.id, description: 'Quarterly HVAC maintenance', quantity: 1, unitPrice: 450, lineTotal: 450 }
  });



  const asset = await prisma.asset.upsert({
    where: { companyId_assetTag: { companyId: company.id, assetTag: 'HVAC-RTU-001' } },
    update: { branchId: branch.id, customerId: customer.id, serviceId: service.id, status: 'ACTIVE' },
    create: { companyId: company.id, branchId: branch.id, customerId: customer.id, serviceId: service.id, name: 'Rooftop HVAC Unit 1', assetType: 'HVAC', assetTag: 'HVAC-RTU-001', locationLabel: 'Roof Block A', status: 'ACTIVE' }
  });

  const assetTwo = await prisma.asset.upsert({
    where: { companyId_assetTag: { companyId: company.id, assetTag: 'HVAC-RTU-002' } },
    update: { branchId: branch.id, customerId: customer.id, serviceId: service.id, status: 'ACTIVE' },
    create: { companyId: company.id, branchId: branch.id, customerId: customer.id, serviceId: service.id, name: 'Rooftop HVAC Unit 2', assetType: 'HVAC', assetTag: 'HVAC-RTU-002', locationLabel: 'Roof Block B', status: 'ACTIVE' }
  });

  const contract = await prisma.serviceContract.upsert({
    where: { companyId_contractNumber: { companyId: company.id, contractNumber: 'DEMO-SLA-001' } },
    update: { branchId: branch.id, status: 'ACTIVE', currency: 'USD', contractValue: 5400 },
    create: { companyId: company.id, branchId: branch.id, customerId: customer.id, contractNumber: 'DEMO-SLA-001', name: 'North Ridge HVAC SLA', status: 'ACTIVE', startDate: new Date(), currency: 'USD', contractValue: 5400, billingInterval: 'QUARTERLY', responseSlaHours: 8, completionSlaHours: 48, includedVisits: 4 }
  });

  await prisma.serviceContractAsset.upsert({
    where: { companyId_contractId_assetId: { companyId: company.id, contractId: contract.id, assetId: asset.id } },
    update: {},
    create: { companyId: company.id, contractId: contract.id, assetId: asset.id }
  });

  await prisma.contractServiceLine.upsert({
    where: { id: 'demo-contract-service-line' },
    update: { nextDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    create: { id: 'demo-contract-service-line', companyId: company.id, contractId: contract.id, serviceId: service.id, title: 'Quarterly HVAC visit', frequency: 'QUARTERLY', nextDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), defaultDurationMinutes: 120, requiresProofPhotos: true, requiresSignature: true }
  });

  await prisma.job.update({ where: { id: job.id }, data: { branchId: branch.id, contractId: contract.id } });
  await prisma.jobAsset.upsert({
    where: { companyId_jobId_assetId: { companyId: company.id, jobId: job.id, assetId: asset.id } },
    update: { primaryAsset: true },
    create: { companyId: company.id, jobId: job.id, assetId: asset.id, primaryAsset: true }
  });

  const supplier = await prisma.supplier.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Demo Parts Supplier' } },
    update: { active: true, leadTimeDays: 5 },
    create: { companyId: company.id, name: 'Demo Parts Supplier', email: 'parts@supplier.test', phone: '+263 000 000 101', leadTimeDays: 5, active: true }
  });

  const warehouse = await prisma.stockLocation.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Harare Warehouse' } },
    update: { branchId: branch.id, active: true },
    create: { companyId: company.id, branchId: branch.id, name: 'Harare Warehouse', type: 'WAREHOUSE', active: true }
  });

  const technicianVan = await prisma.stockLocation.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Demo Technician Van' } },
    update: { branchId: branch.id, workerId: worker.id, vehicleIdentifier: 'DEMO-VAN-1', active: true },
    create: { companyId: company.id, branchId: branch.id, workerId: worker.id, name: 'Demo Technician Van', type: 'VEHICLE', vehicleIdentifier: 'DEMO-VAN-1', active: true }
  });

  const demoItems = [
    ['FILTER-A', 'Filter Set A', 25, 5],
    ['BELT-13', 'Drive Belt 13mm', 8, 10],
    ['FUSE-10A', '10A Fuse', 2, 20],
    ['CLEANER', 'Coil Cleaner', 12, 6],
    ['LOW-STOCK', 'Low Stock Control Board', 120, 1]
  ];
  const itemRecords = [];
  for (const [sku, name, unitCost, reorderPoint] of demoItems) {
    const item = await prisma.inventoryItem.upsert({
      where: { companyId_sku: { companyId: company.id, sku } },
      update: { name, unitCost, reorderPoint, minStockLevel: Math.max(reorderPoint - 2, 0), preferredSupplierId: supplier.id, supplierLeadTimeDays: supplier.leadTimeDays, active: true },
      create: { companyId: company.id, sku, name, unitCost, reorderPoint, minStockLevel: Math.max(reorderPoint - 2, 0), preferredSupplierId: supplier.id, supplierLeadTimeDays: supplier.leadTimeDays, unitOfMeasure: 'each', active: true }
    });
    itemRecords.push(item);
  }

  await prisma.inventoryStock.upsert({
    where: { companyId_itemId_locationId: { companyId: company.id, itemId: itemRecords[0].id, locationId: warehouse.id } },
    update: { quantityOnHand: 20 },
    create: { companyId: company.id, itemId: itemRecords[0].id, locationId: warehouse.id, quantityOnHand: 20 }
  });
  await prisma.inventoryStock.upsert({
    where: { companyId_itemId_locationId: { companyId: company.id, itemId: itemRecords[4].id, locationId: warehouse.id } },
    update: { quantityOnHand: 1 },
    create: { companyId: company.id, itemId: itemRecords[4].id, locationId: warehouse.id, quantityOnHand: 1 }
  });

  await prisma.inventoryStock.upsert({
    where: { companyId_itemId_locationId: { companyId: company.id, itemId: itemRecords[0].id, locationId: technicianVan.id } },
    update: { quantityOnHand: 3 },
    create: { companyId: company.id, itemId: itemRecords[0].id, locationId: technicianVan.id, quantityOnHand: 3 }
  });

  const purchaseRequest = await prisma.purchaseRequest.upsert({
    where: { id: 'demo-purchase-request' },
    update: { status: 'REQUESTED', branchId: branch.id, source: 'LOW_STOCK', estimatedTotal: 240 },
    create: { id: 'demo-purchase-request', companyId: company.id, branchId: branch.id, requestedById: owner.id, jobId: job.id, source: 'LOW_STOCK', status: 'REQUESTED', reason: 'Low stock demo item', estimatedTotal: 240 }
  });

  await prisma.purchaseRequestLine.upsert({
    where: { id: 'demo-purchase-request-line' },
    update: { quantity: 2, estimatedUnitCost: 120, branchId: branch.id },
    create: { id: 'demo-purchase-request-line', companyId: company.id, purchaseRequestId: purchaseRequest.id, branchId: branch.id, itemId: itemRecords[4].id, quantity: 2, estimatedUnitCost: 120, notes: 'Seeded low-stock line' }
  });

  const purchaseOrder = await prisma.purchaseOrder.upsert({
    where: { companyId_orderNumber: { companyId: company.id, orderNumber: 'PO-0001' } },
    update: { branchId: branch.id, supplierId: supplier.id, purchaseRequestId: purchaseRequest.id, status: 'SENT' },
    create: { companyId: company.id, branchId: branch.id, supplierId: supplier.id, purchaseRequestId: purchaseRequest.id, orderNumber: 'PO-0001', status: 'SENT' }
  });

  await prisma.purchaseOrderLine.upsert({
    where: { id: 'demo-po-line' },
    update: { quantity: 2, unitCost: 120, receivedQuantity: 1, backorderQuantity: 1 },
    create: { id: 'demo-po-line', companyId: company.id, purchaseOrderId: purchaseOrder.id, itemId: itemRecords[4].id, quantity: 2, unitCost: 120, receivedQuantity: 1, backorderQuantity: 1 }
  });

  await prisma.workerDevice.upsert({
    where: { companyId_deviceId: { companyId: company.id, deviceId: 'demo-worker-device' } },
    update: { lastSeenAt: new Date(), active: true },
    create: { companyId: company.id, workerId: worker.id, userId: workerUser.id, platform: 'ANDROID', deviceName: 'Demo Technician Phone', deviceId: 'demo-worker-device', lastSeenAt: new Date(), active: true }
  });

  await prisma.auditLog.create({ data: { companyId: company.id, userId: owner.id, action: 'SEED', entity: 'Company', entityId: company.id, metadata: { invoiceId: invoice.id } } });

  console.log('Seeded FieldCore demo data');
  console.log(`Owner login: ${process.env.DEMO_OWNER_EMAIL || 'owner@fieldcore.test'} / ${password}`);
  console.log(`Worker login: worker@fieldcore.test / ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
