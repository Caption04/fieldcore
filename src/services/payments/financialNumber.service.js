const { AppError } = require('../../errors');

const NUMBER_KINDS = Object.freeze({
  RECEIPT: { field: 'receiptNextNumber', defaultPrefix: 'RCT', settingsField: 'receiptPrefix', model: 'receipt', numberField: 'receiptNumber' },
  CREDIT_NOTE: { field: 'creditNoteNextNumber', defaultPrefix: 'CN', settingsField: null, model: 'creditNote', numberField: 'number' }
});

async function lockCounter(tx, companyId) {
  try {
    await tx.companyInvoiceCounter.upsert({ where: { companyId }, update: {}, create: { companyId } });
  } catch (error) {
    if (error && error.code === 'P2002') error.paymentRetryKind = 'FINANCIAL_COUNTER_CREATE';
    throw error;
  }
  if (typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw`SELECT "companyId" FROM "CompanyInvoiceCounter" WHERE "companyId" = ${companyId} FOR UPDATE`;
  }
  return tx.companyInvoiceCounter.findUnique({ where: { companyId } });
}

async function allocateFinancialNumber(tx, companyId, kind) {
  const definition = NUMBER_KINDS[kind];
  if (!definition) throw new Error('Unknown financial number type');
  const counter = await lockCounter(tx, companyId);
  const settings = await tx.companyFinanceSettings.findUnique({ where: { companyId } });
  const prefix = definition.settingsField && settings && settings[definition.settingsField]
    ? String(settings[definition.settingsField]).trim()
    : definition.defaultPrefix;
  let next = Number(counter && counter[definition.field] || 1);
  const padding = Math.max(4, Number(counter && counter.padding || 4));

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = `${prefix}-${String(next).padStart(padding, '0')}`;
    const existing = await tx[definition.model].findFirst({ where: { companyId, [definition.numberField]: candidate } });
    await tx.companyInvoiceCounter.update({ where: { companyId }, data: { [definition.field]: next + 1 } });
    next += 1;
    if (!existing) return candidate;
  }
  throw new AppError(409, `Could not allocate ${kind === 'RECEIPT' ? 'receipt' : 'credit note'} number`);
}

module.exports = { NUMBER_KINDS, allocateFinancialNumber };
