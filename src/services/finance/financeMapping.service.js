function getPrisma() {
  return require('../../db').prisma;
}

function defaultFinanceMapping(companyId, provider) {
  return {
    id: null,
    companyId,
    integrationId: null,
    provider,
    revenueAccountCode: null,
    taxRateId: null,
    paymentsAccountCode: null,
    discountsAccountCode: null,
    stockAccountCode: null,
    branchTrackingCategoryId: null,
    trackingCategoryId: null,
    invoicePrefix: null,
    customerNamingRule: 'CUSTOMER_NAME',
    config: {}
  };
}

async function getFinanceMapping(companyId, provider) {
  const prisma = getPrisma();
  const existing = await prisma.financeMapping.findUnique({ where: { companyId_provider: { companyId, provider } } });
  return existing || defaultFinanceMapping(companyId, provider);
}

async function saveFinanceMapping(companyId, provider, data = {}) {
  const payload = {
    integrationId: data.integrationId || null,
    revenueAccountCode: data.revenueAccountCode || null,
    taxRateId: data.taxRateId || null,
    paymentsAccountCode: data.paymentsAccountCode || null,
    discountsAccountCode: data.discountsAccountCode || null,
    stockAccountCode: data.stockAccountCode || null,
    branchTrackingCategoryId: data.branchTrackingCategoryId || null,
    trackingCategoryId: data.trackingCategoryId || null,
    invoicePrefix: data.invoicePrefix || null,
    customerNamingRule: data.customerNamingRule || 'CUSTOMER_NAME',
    config: data.config || {}
  };
  const prisma = getPrisma();
  return prisma.financeMapping.upsert({
    where: { companyId_provider: { companyId, provider } },
    update: payload,
    create: { companyId, provider, ...payload }
  });
}

module.exports = { defaultFinanceMapping, getFinanceMapping, saveFinanceMapping };
