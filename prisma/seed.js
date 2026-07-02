const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

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
    update: { scheduledStart, scheduledEnd },
    create: { id: 'demo-job', companyId: company.id, customerId: customer.id, serviceId: service.id, workerId: worker.id, title: 'Rooftop unit inspection', description: 'Inspect rooftop HVAC units and capture service notes.', status: 'SCHEDULED', scheduledStart, scheduledEnd, total: 450 }
  });

  await prisma.scheduleItem.upsert({
    where: { id: 'demo-schedule' },
    update: { startsAt: scheduledStart, endsAt: scheduledEnd },
    create: { id: 'demo-schedule', companyId: company.id, jobId: job.id, workerId: worker.id, startsAt: scheduledStart, endsAt: scheduledEnd, notes: 'Bring filter set A.' }
  });

  const quote = await prisma.quote.upsert({
    where: { id: 'demo-quote' },
    update: { subtotal: 450, total: 450, amount: 450 },
    create: { id: 'demo-quote', companyId: company.id, customerId: customer.id, serviceId: service.id, jobId: job.id, title: 'Quarterly HVAC maintenance', status: 'SENT', sentAt: new Date(), amount: 450, subtotal: 450, total: 450 }
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
    create: { companyId: company.id, customerId: customer.id, serviceId: service.id, jobId: job.id, quoteId: quote.id, number: 'INV-0001', status: 'SENT', amount: 450, subtotal: 450, total: 450, balanceDue: 450, dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) }
  });

  await prisma.invoiceLineItem.upsert({
    where: { id: 'demo-invoice-line' },
    update: { unitPrice: 450, lineTotal: 450 },
    create: { id: 'demo-invoice-line', companyId: company.id, invoiceId: invoice.id, serviceId: service.id, description: 'Quarterly HVAC maintenance', quantity: 1, unitPrice: 450, lineTotal: 450 }
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
