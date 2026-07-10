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
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: false, customBranding: false, multiLocation: false, apiAccess: false, annualFirst: false, implementationFee: false, customPricing: false, regionalPrices: { ZW: { currency: 'USD', price: 500 }, SA: { currency: 'ZAR', price: 9500 } } }
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
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: false, annualFirst: true, implementationFee: true, customPricing: false, regionalPrices: { ZW: { currency: 'USD', price: 1500 }, SA: { currency: 'ZAR', price: 28500 } } }
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
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: true, annualFirst: true, implementationFee: true, customPricing: true, advertisedPrice: 'Contact us', regionalPrices: { ZW: { currency: 'USD', price: null, label: 'Contact us' }, SA: { currency: 'ZAR', price: null, label: 'Contact us' } } }
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

const REGION_CONFIGS = {
  ZW: {
    market: 'ZW',
    companyId: 'fieldcore-zw-demo',
    companyName: 'FieldCore Zimbabwe Demo',
    legalName: 'FieldCore Zimbabwe Demo (Private) Limited',
    registrationNumber: 'ZW-DEMO-2026',
    taxNumber: 'ZW-VAT-DEMO',
    address: 'Demo House, Harare, Zimbabwe',
    phone: '+263 000 000 000',
    supportEmail: 'support.zw@fieldcore.test',
    websiteUrl: 'https://zw.fieldcore.test',
    branch: { code: 'HARARE', name: 'Harare Operations', city: 'Harare', country: 'ZW', timezone: 'Africa/Harare' },
    finance: {
      country: 'ZW',
      timezone: 'Africa/Harare',
      defaultCurrency: 'USD',
      allowedCurrencies: ['USD'],
      taxName: 'VAT',
      taxRate: 15,
      numberFormat: 'en-ZW',
      allowedPaymentMethods: ['CASH', 'BANK_TRANSFER', 'PAYNOW'],
      paymentInstructions: 'Use the invoice number as your payment reference. Bank transfer proof of payment is required unless the business confirms otherwise.'
    },
    users: {
      owner: 'owner.zw@fieldcore.test',
      admin: 'admin.zw@fieldcore.test',
      worker: 'worker.zw@fieldcore.test',
      client: 'client.zw@fieldcore.test'
    },
    people: { owner: 'Zimbabwe Demo Owner', admin: 'Zimbabwe Demo Admin', worker: 'Tariro Technician', client: 'Harare Demo Client' },
    sample: { customerName: 'Harare Facilities Client', customerPhone: '+263 000 000 120', customerAddress: 'Borrowdale, Harare', serviceName: 'Commercial Maintenance Visit', servicePrice: 450, invoiceNumber: 'ZW-INV-0001' }
  },
  SA: {
    market: 'SA',
    companyId: 'fieldcore-sa-demo',
    companyName: 'FieldCore South Africa Demo',
    legalName: 'FieldCore South Africa Demo (Pty) Ltd',
    registrationNumber: 'SA-DEMO-2026',
    taxNumber: 'SA-VAT-DEMO',
    address: 'Demo Office, Johannesburg, South Africa',
    phone: '+27 000 000 000',
    supportEmail: 'support.sa@fieldcore.test',
    websiteUrl: 'https://sa.fieldcore.test',
    branch: { code: 'JHB', name: 'Johannesburg Operations', city: 'Johannesburg', country: 'ZA', timezone: 'Africa/Johannesburg' },
    finance: {
      country: 'ZA',
      timezone: 'Africa/Johannesburg',
      defaultCurrency: 'ZAR',
      allowedCurrencies: ['ZAR'],
      taxName: 'VAT',
      taxRate: 15,
      numberFormat: 'en-ZA',
      allowedPaymentMethods: ['CASH', 'BANK_TRANSFER', 'OZOW', 'YOCO', 'PAYFAST', 'SNAPSCAN'],
      paymentInstructions: 'Use the invoice number as your payment reference. Proof of payment is required for bank transfers unless the business confirms otherwise.'
    },
    users: {
      owner: 'owner.sa@fieldcore.test',
      admin: 'admin.sa@fieldcore.test',
      worker: 'worker.sa@fieldcore.test',
      client: 'client.sa@fieldcore.test'
    },
    people: { owner: 'South Africa Demo Owner', admin: 'South Africa Demo Admin', worker: 'Thabo Technician', client: 'Johannesburg Demo Client' },
    sample: { customerName: 'Johannesburg Facilities Client', customerPhone: '+27 000 000 120', customerAddress: 'Rosebank, Johannesburg', serviceName: 'Commercial Maintenance Visit', servicePrice: 8500, invoiceNumber: 'SA-INV-0001' }
  }
};

function parseSeedRegions() {
  const raw = process.env.FIELDCORE_SEED_REGIONS || process.env.FIELDCORE_SEED_REGION || 'ZW,SA';
  const normalized = String(raw || '').toUpperCase();
  if (normalized === 'ALL') return ['ZW', 'SA'];
  const regions = normalized.split(',').map((item) => item.trim()).filter(Boolean).map((item) => item === 'ZA' ? 'SA' : item);
  const unique = [...new Set(regions)].filter((item) => REGION_CONFIGS[item]);
  return unique.length ? unique : ['ZW', 'SA'];
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function seedPlans() {
  if (!prisma.saaSPlan) return;
  for (const plan of saasPlans) {
    await prisma.saaSPlan.upsert({ where: { id: plan.id }, update: plan, create: plan });
  }
}

async function upsertUser({ email, name, role, companyId, passwordHash }) {
  return prisma.user.upsert({
    where: { email },
    update: { name, role, companyId, passwordHash },
    create: { companyId, email, name, role, passwordHash }
  });
}

async function seedCompany(config, passwordHash, includeSampleData) {
  const company = await prisma.company.upsert({
    where: { id: config.companyId },
    update: {
      name: config.companyName,
      legalName: config.legalName,
      tradingName: config.companyName,
      registrationNumber: config.registrationNumber,
      taxNumber: config.taxNumber,
      address: config.address,
      phone: config.phone,
      email: config.supportEmail
    },
    create: {
      id: config.companyId,
      name: config.companyName,
      legalName: config.legalName,
      tradingName: config.companyName,
      registrationNumber: config.registrationNumber,
      taxNumber: config.taxNumber,
      address: config.address,
      phone: config.phone,
      email: config.supportEmail
    }
  });

  if (prisma.companySubscription) {
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
      brandName: config.companyName,
      primaryColor: '#1d65bc',
      secondaryColor: '#ffe386',
      accentColor: '#12a96d',
      supportEmail: config.supportEmail,
      supportPhone: config.phone,
      websiteUrl: config.websiteUrl,
      invoiceFooter: `Thank you for choosing ${config.companyName}.`,
      invoiceTerms: 'Payment is due within the configured payment terms unless otherwise agreed.'
    },
    create: {
      companyId: company.id,
      brandName: config.companyName,
      primaryColor: '#1d65bc',
      secondaryColor: '#ffe386',
      accentColor: '#12a96d',
      supportEmail: config.supportEmail,
      supportPhone: config.phone,
      websiteUrl: config.websiteUrl,
      invoiceFooter: `Thank you for choosing ${config.companyName}.`,
      invoiceTerms: 'Payment is due within the configured payment terms unless otherwise agreed.'
    }
  });

  await prisma.companyFinanceSettings.upsert({
    where: { companyId: company.id },
    update: {
      ...config.finance,
      pricesIncludeTax: false,
      dateFormat: 'yyyy-MM-dd',
      invoicePrefix: config.market === 'SA' ? 'SA-INV' : 'ZW-INV',
      receiptPrefix: config.market === 'SA' ? 'SA-RCT' : 'ZW-RCT',
      quoteExpiryDays: 14,
      paymentTermsDays: 14,
      fiscalYearStartMonth: 1,
      invoiceFooter: `Thank you for choosing ${config.companyName}.`,
      bankTransferProofRequired: true,
      enforceQuoteDepositBeforeScheduling: false,
      defaultQuoteDepositPercent: 0,
      reminderThrottleHours: 24
    },
    create: {
      companyId: company.id,
      ...config.finance,
      pricesIncludeTax: false,
      dateFormat: 'yyyy-MM-dd',
      invoicePrefix: config.market === 'SA' ? 'SA-INV' : 'ZW-INV',
      receiptPrefix: config.market === 'SA' ? 'SA-RCT' : 'ZW-RCT',
      quoteExpiryDays: 14,
      paymentTermsDays: 14,
      fiscalYearStartMonth: 1,
      invoiceFooter: `Thank you for choosing ${config.companyName}.`,
      bankTransferProofRequired: true,
      enforceQuoteDepositBeforeScheduling: false,
      defaultQuoteDepositPercent: 0,
      reminderThrottleHours: 24
    }
  });

  await prisma.companySchedulingSettings.upsert({
    where: { companyId: company.id },
    update: { timezone: config.branch.timezone, defaultJobDurationMinutes: 90, defaultTravelBufferMinutes: 30, allowOverbooking: false, defaultJobStatus: 'NEW', requireCompletionNotes: true, requireProofPhotos: true, requireLocation: true, workingDayStart: '08:00', workingDayEnd: '17:00' },
    create: { companyId: company.id, timezone: config.branch.timezone, defaultJobDurationMinutes: 90, defaultTravelBufferMinutes: 30, allowOverbooking: false, defaultJobStatus: 'NEW', requireCompletionNotes: true, requireProofPhotos: true, requireLocation: true, workingDayStart: '08:00', workingDayEnd: '17:00' }
  });

  const branch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: config.branch.code } },
    update: { name: config.branch.name, country: config.branch.country, city: config.branch.city, timezone: config.branch.timezone, active: true },
    create: { companyId: company.id, name: config.branch.name, code: config.branch.code, country: config.branch.country, city: config.branch.city, timezone: config.branch.timezone, active: true }
  });

  const owner = await upsertUser({ email: config.users.owner, name: config.people.owner, role: 'OWNER', companyId: company.id, passwordHash });
  await upsertUser({ email: config.users.admin, name: config.people.admin, role: 'ADMIN', companyId: company.id, passwordHash });
  const workerUser = await upsertUser({ email: config.users.worker, name: config.people.worker, role: 'WORKER', companyId: company.id, passwordHash });

  const role = await prisma.workerRole.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Field Technician' } },
    update: { active: true },
    create: { companyId: company.id, name: 'Field Technician', active: true }
  });

  const worker = await prisma.workerProfile.upsert({
    where: { userId: workerUser.id },
    update: { companyId: company.id, branchId: branch.id, roleId: role.id, title: 'Field Technician', phone: config.phone, active: true },
    create: { companyId: company.id, branchId: branch.id, userId: workerUser.id, roleId: role.id, title: 'Field Technician', phone: config.phone, active: true }
  });

  await prisma.workerDevice.upsert({
    where: { companyId_deviceId: { companyId: company.id, deviceId: `${config.market.toLowerCase()}-demo-worker-device` } },
    update: { workerId: worker.id, userId: workerUser.id, lastSeenAt: new Date(), active: true },
    create: { companyId: company.id, workerId: worker.id, userId: workerUser.id, platform: 'ANDROID', deviceName: `${config.market} Demo Technician Phone`, deviceId: `${config.market.toLowerCase()}-demo-worker-device`, lastSeenAt: new Date(), active: true }
  });

  if (includeSampleData) {
    const customer = await prisma.customer.upsert({
      where: { id: `${config.companyId}-customer` },
      update: { companyId: company.id, branchId: branch.id, name: config.sample.customerName, email: config.users.client, phone: config.sample.customerPhone, address: config.sample.customerAddress },
      create: { id: `${config.companyId}-customer`, companyId: company.id, branchId: branch.id, name: config.sample.customerName, email: config.users.client, phone: config.sample.customerPhone, address: config.sample.customerAddress, notes: `${config.market} clean demo customer.` }
    });

    await prisma.clientAccount.upsert({
      where: { companyId_email: { companyId: company.id, email: config.users.client } },
      update: { customerId: customer.id, name: config.people.client, phone: config.sample.customerPhone, passwordHash, status: 'ACTIVE' },
      create: { companyId: company.id, customerId: customer.id, name: config.people.client, email: config.users.client, phone: config.sample.customerPhone, passwordHash, status: 'ACTIVE' }
    });

    const service = await prisma.service.upsert({
      where: { id: `${config.companyId}-service` },
      update: { companyId: company.id, name: config.sample.serviceName, price: config.sample.servicePrice, active: true },
      create: { id: `${config.companyId}-service`, companyId: company.id, name: config.sample.serviceName, description: `${config.market} sample service for QA.`, price: config.sample.servicePrice, active: true }
    });

    await prisma.companyInvoiceCounter.upsert({
      where: { companyId: company.id },
      update: { nextNumber: 2 },
      create: { companyId: company.id, nextNumber: 2 }
    });

    const invoice = await prisma.invoice.upsert({
      where: { companyId_number: { companyId: company.id, number: config.sample.invoiceNumber } },
      update: { branchId: branch.id, customerId: customer.id, serviceId: service.id, amount: config.sample.servicePrice, subtotal: config.sample.servicePrice, total: config.sample.servicePrice, balanceDue: config.sample.servicePrice, status: 'SENT' },
      create: { companyId: company.id, branchId: branch.id, customerId: customer.id, serviceId: service.id, number: config.sample.invoiceNumber, status: 'SENT', amount: config.sample.servicePrice, subtotal: config.sample.servicePrice, total: config.sample.servicePrice, balanceDue: config.sample.servicePrice, dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), sentAt: new Date() }
    });

    await prisma.invoiceLineItem.upsert({
      where: { id: `${config.companyId}-invoice-line` },
      update: { serviceId: service.id, description: config.sample.serviceName, unitPrice: config.sample.servicePrice, lineTotal: config.sample.servicePrice },
      create: { id: `${config.companyId}-invoice-line`, companyId: company.id, invoiceId: invoice.id, serviceId: service.id, description: config.sample.serviceName, quantity: 1, unitPrice: config.sample.servicePrice, lineTotal: config.sample.servicePrice }
    });
  }

  await prisma.auditLog.create({ data: { companyId: company.id, userId: owner.id, action: 'SEED', entity: 'Company', entityId: company.id, metadata: { market: config.market, sampleData: includeSampleData } } });

  return { company, users: config.users };
}

async function main() {
  const password = process.env.DEMO_PASSWORD || 'FieldCoreDemo2026!';
  const hash = await bcrypt.hash(password, 12);
  const regions = parseSeedRegions();
  const includeSampleData = boolEnv('FIELDCORE_SEED_SAMPLE_DATA', false);

  await seedPlans();
  const seeded = [];
  for (const region of regions) seeded.push(await seedCompany(REGION_CONFIGS[region], hash, includeSampleData));

  console.log('Seeded FieldCore clean regional data.');
  console.log(`Password for all seeded logins: ${password}`);
  for (const item of seeded) {
    const market = item.company.id === REGION_CONFIGS.SA.companyId ? 'South Africa' : 'Zimbabwe';
    console.log(`\n${market} tenant: ${item.company.name}`);
    console.log(`Owner:  ${item.users.owner}`);
    console.log(`Admin:  ${item.users.admin}`);
    console.log(`Worker: ${item.users.worker}`);
    if (includeSampleData) console.log(`Client: ${item.users.client}`);
  }
  if (!includeSampleData) console.log('\nNo sample customers/invoices were seeded. Set FIELDCORE_SEED_SAMPLE_DATA=true if you want one clean client invoice per region for QA.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
