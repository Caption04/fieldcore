const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const checks = [
  ['duplicate linked payments', `
    SELECT "companyId", "paymentLinkId", COUNT(*)::int AS count
    FROM "Payment" WHERE "paymentLinkId" IS NOT NULL
    GROUP BY "companyId", "paymentLinkId" HAVING COUNT(*) > 1`],
  ['duplicate provider refunds', `
    SELECT "companyId", "providerConnectionId", "providerRefundId", COUNT(*)::int AS count
    FROM "PaymentRefund" WHERE "providerRefundId" IS NOT NULL
    GROUP BY "companyId", "providerConnectionId", "providerRefundId" HAVING COUNT(*) > 1`],
  ['missing payment links', `
    SELECT p.id, p."companyId", p."paymentLinkId"
    FROM "Payment" p LEFT JOIN "PaymentLink" l ON l.id = p."paymentLinkId"
    WHERE p."paymentLinkId" IS NOT NULL AND l.id IS NULL`],
  ['orphaned payments', `
    SELECT p.id, p."companyId", p."invoiceId"
    FROM "Payment" p LEFT JOIN "Invoice" i ON i.id = p."invoiceId"
    WHERE i.id IS NULL`],
  ['cross-company payment invoices', `
    SELECT p.id, p."companyId", p."invoiceId", i."companyId" AS "invoiceCompanyId"
    FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
    WHERE p."companyId" <> i."companyId"`],
  ['cross-company payment links', `
    SELECT p.id, p."companyId", p."paymentLinkId", l."companyId" AS "linkCompanyId"
    FROM "Payment" p JOIN "PaymentLink" l ON l.id = p."paymentLinkId"
    WHERE p."companyId" <> l."companyId"`],
  ['cross-company refunds', `
    SELECT r.id, r."companyId", r."paymentId", p."companyId" AS "paymentCompanyId"
    FROM "PaymentRefund" r JOIN "Payment" p ON p.id = r."paymentId"
    WHERE r."companyId" <> p."companyId"`],
  ['orphaned refunds', `
    SELECT r.id, r."companyId", r."paymentId"
    FROM "PaymentRefund" r LEFT JOIN "Payment" p ON p.id = r."paymentId"
    WHERE p.id IS NULL`],
  ['refunded payments with paid links', `
    SELECT p.id, p."companyId", p."paymentLinkId"
    FROM "Payment" p JOIN "PaymentLink" l ON l.id = p."paymentLinkId"
    WHERE p.status::text = 'REFUNDED' AND l.status::text = 'PAID'`],
  ['disputed payments with paid links', `
    SELECT p.id, p."companyId", p."paymentLinkId"
    FROM "Payment" p JOIN "PaymentLink" l ON l.id = p."paymentLinkId"
    WHERE p.status::text = 'DISPUTED' AND l.status::text = 'PAID'`, 'explicitDisputedStatus'],
  ['ambiguous legacy disputed failures', `
    SELECT p.id, p."companyId", p."paymentLinkId"
    FROM "Payment" p
    WHERE p.status::text = 'FAILED'
      AND p.notes ILIKE '%disput%'
      AND p.notes <> 'Payment disputed with provider'`],
  ['refunded provider states without reversal', `
    SELECT l.id, l."companyId", l."invoiceId"
    FROM "PaymentLink" l
    LEFT JOIN "Payment" p ON p."paymentLinkId" = l.id AND p."companyId" = l."companyId"
    LEFT JOIN "PaymentRefund" r ON r."paymentId" = p.id AND r."companyId" = p."companyId" AND r.status::text = 'REFUNDED'
    WHERE UPPER(COALESCE(l."providerStatus", '')) = 'REFUNDED'
      AND p.status::text = 'CONFIRMED' AND r.id IS NULL`, 'providerStatus'],
  ['multiple receipts for one provider payment', `
    SELECT p."companyId", p.provider::text AS provider, p."providerPaymentId", COUNT(r.id)::int AS count
    FROM "Payment" p JOIN "Receipt" r ON r."paymentId" = p.id
    WHERE p."providerPaymentId" IS NOT NULL
    GROUP BY p."companyId", p.provider, p."providerPaymentId" HAVING COUNT(r.id) > 1`],
  ['duplicate provider transactions', `
    SELECT "providerConnectionId", "providerPaymentId", COUNT(*)::int AS count
    FROM "PaymentLink"
    WHERE "providerConnectionId" IS NOT NULL AND "providerPaymentId" IS NOT NULL
    GROUP BY "providerConnectionId", "providerPaymentId" HAVING COUNT(*) > 1`, 'providerPaymentId'],
  ['duplicate Paynow merchant traces', `
    SELECT "providerConnectionId", "merchantTrace", COUNT(*)::int AS count
    FROM "PaymentLink"
    WHERE "providerConnectionId" IS NOT NULL AND "merchantTrace" IS NOT NULL
    GROUP BY "providerConnectionId", "merchantTrace" HAVING COUNT(*) > 1`, 'merchantTrace'],
  ['refund totals above payment amount', `
    SELECT p.id, p."companyId", p.amount, COALESCE(SUM(r.amount), 0) AS "refundTotal"
    FROM "Payment" p
    JOIN "PaymentRefund" r ON r."paymentId" = p.id AND r."companyId" = p."companyId" AND r.status::text = 'REFUNDED'
    GROUP BY p.id, p."companyId", p.amount
    HAVING COALESCE(SUM(r.amount), 0) > p.amount`],
  ['duplicate receipt numbers', `
    SELECT "companyId", "receiptNumber", COUNT(*)::int AS count
    FROM "Receipt" GROUP BY "companyId", "receiptNumber" HAVING COUNT(*) > 1`],
  ['duplicate credit note numbers', `
    SELECT "companyId", number, COUNT(*)::int AS count
    FROM "CreditNote" GROUP BY "companyId", number HAVING COUNT(*) > 1`],
  ['multiple active payment attempts for one invoice and provider', `
    SELECT "companyId", "invoiceId", "providerConnectionId", COUNT(*)::int AS count
    FROM "PaymentLink"
    WHERE status::text IN ('CREATED', 'SENT', 'OPENED', 'PENDING')
      AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
    GROUP BY "companyId", "invoiceId", "providerConnectionId" HAVING COUNT(*) > 1`],
  ['active payment links on closed invoices', `
    SELECT l.id, l."companyId", l."invoiceId", i.status::text AS "invoiceStatus"
    FROM "PaymentLink" l JOIN "Invoice" i ON i.id = l."invoiceId" AND i."companyId" = l."companyId"
    WHERE l.status::text IN ('CREATED', 'SENT', 'OPENED', 'PENDING')
      AND i.status::text IN ('PAID', 'VOID')`],
  ['cross-company provider links', `
    SELECT l.id, l."companyId", l."providerConnectionId", c."companyId" AS "connectionCompanyId"
    FROM "PaymentLink" l JOIN "PaymentProviderConnection" c ON c.id = l."providerConnectionId"
    WHERE l."companyId" <> c."companyId"`],
  ['deposit marked paid without enough usable payment', `
    SELECT q.id, q."companyId", q."depositRequiredAmount", COALESCE(ledger."usablePaid", 0) AS "usablePaid"
    FROM "Quote" q
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        CASE WHEN p.status::text = 'CONFIRMED'
          THEN p.amount - COALESCE((SELECT SUM(r.amount) FROM "PaymentRefund" r WHERE r."paymentId" = p.id AND r."companyId" = p."companyId" AND r.status::text = 'REFUNDED'), 0)
          ELSE 0 END
      ), 0) AS "usablePaid"
      FROM "Invoice" i
      LEFT JOIN "Payment" p ON p."invoiceId" = i.id AND p."companyId" = i."companyId"
      WHERE i."quoteId" = q.id AND i."companyId" = q."companyId"
    ) ledger ON TRUE
    WHERE q."depositPaidAt" IS NOT NULL
      AND q."depositRequiredAmount" > 0
      AND COALESCE(ledger."usablePaid", 0) < q."depositRequiredAmount"`],
  ['unapplied credit above usable payment', `
    SELECT c.id, c."companyId", c."paymentId", c.amount,
           GREATEST(p.amount - COALESCE((SELECT SUM(r.amount) FROM "PaymentRefund" r WHERE r."paymentId" = p.id AND r."companyId" = p."companyId" AND r.status::text = 'REFUNDED'), 0), 0) AS "usableAmount"
    FROM "UnappliedCustomerCredit" c
    JOIN "Payment" p ON p.id = c."paymentId" AND p."companyId" = c."companyId"
    WHERE c.status IN ('OPEN', 'LOCKED')
      AND c.amount > GREATEST(p.amount - COALESCE((SELECT SUM(r.amount) FROM "PaymentRefund" r WHERE r."paymentId" = p.id AND r."companyId" = p."companyId" AND r.status::text = 'REFUNDED'), 0), 0)`, null, 'UnappliedCustomerCredit'],
  ['invoice balance does not match net applied payments', `
    SELECT i.id, i."companyId", i."balanceDue",
           GREATEST(COALESCE(i.total, i.amount, 0) - COALESCE(ledger."appliedAmount", 0), 0) AS "expectedBalance"
    FROM "Invoice" i
    LEFT JOIN LATERAL (
      SELECT SUM(CASE WHEN p.status::text = 'CONFIRMED' THEN GREATEST(
        p.amount
        - COALESCE((SELECT SUM(r.amount) FROM "PaymentRefund" r WHERE r."paymentId" = p.id AND r."companyId" = p."companyId" AND r.status::text = 'REFUNDED'), 0)
        - COALESCE((SELECT SUM(c.amount) FROM "UnappliedCustomerCredit" c WHERE c."paymentId" = p.id AND c."companyId" = p."companyId" AND c.status IN ('OPEN', 'LOCKED')), 0), 0)
        ELSE 0 END) AS "appliedAmount"
      FROM "Payment" p WHERE p."invoiceId" = i.id AND p."companyId" = i."companyId"
    ) ledger ON TRUE
    WHERE i.status::text <> 'VOID'
      AND ABS(i."balanceDue" - GREATEST(COALESCE(i.total, i.amount, 0) - COALESCE(ledger."appliedAmount", 0), 0)) > 0.009`, null, 'UnappliedCustomerCredit'],
  ['deposit marked paid with insufficient net applied payment', `
    SELECT q.id, q."companyId", q."depositRequiredAmount", COALESCE(ledger."usablePaid", 0) AS "usablePaid"
    FROM "Quote" q
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(CASE WHEN p.status::text = 'CONFIRMED' THEN GREATEST(
        p.amount
        - COALESCE((SELECT SUM(r.amount) FROM "PaymentRefund" r WHERE r."paymentId" = p.id AND r."companyId" = p."companyId" AND r.status::text = 'REFUNDED'), 0)
        - COALESCE((SELECT SUM(c.amount) FROM "UnappliedCustomerCredit" c WHERE c."paymentId" = p.id AND c."companyId" = p."companyId" AND c.status IN ('OPEN', 'LOCKED')), 0), 0)
        ELSE 0 END), 0) AS "usablePaid"
      FROM "Invoice" i
      LEFT JOIN "Payment" p ON p."invoiceId" = i.id AND p."companyId" = i."companyId"
      WHERE i."quoteId" = q.id AND i."companyId" = q."companyId"
    ) ledger ON TRUE
    WHERE q."depositPaidAt" IS NOT NULL
      AND q."depositRequiredAmount" > 0
      AND COALESCE(ledger."usablePaid", 0) < q."depositRequiredAmount"`, null, 'UnappliedCustomerCredit'],
  ['active links missing a credential version', `
    SELECT l.id, l."companyId", l."providerConnectionId"
    FROM "PaymentLink" l
    JOIN "PaymentProviderConnection" c ON c.id = l."providerConnectionId"
    WHERE l.status::text IN ('CREATED', 'SENT', 'OPENED', 'PENDING')
      AND l."credentialVersionId" IS NULL
      AND c.provider::text IN ('PAYNOW', 'OZOW')`, 'credentialVersionId', 'PaymentProviderCredentialVersion'],
  ['duplicate callback tokens', `
    SELECT "callbackToken", COUNT(*)::int AS count
    FROM "PaymentProviderConnection"
    WHERE "callbackToken" IS NOT NULL
    GROUP BY "callbackToken" HAVING COUNT(*) > 1`, null, 'PaymentProviderConnection']


];

async function main() {
  let blockers = 0;
  const columns = await prisma.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
  const tables = new Set(columns.map((row) => row.table_name));
  const paymentLinkColumns = new Set(columns.filter((row) => row.table_name === 'PaymentLink').map((row) => row.column_name));
  const providerStatusColumn = paymentLinkColumns.has('providerStatus');
  const disputedEnumValue = await prisma.$queryRawUnsafe(`SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'PaymentStatus' AND e.enumlabel = 'DISPUTED' LIMIT 1`);
  const legacyDisputes = await prisma.$queryRawUnsafe(`SELECT id, "companyId", "paymentLinkId" FROM "Payment" WHERE status::text = 'FAILED' AND notes = 'Payment disputed with provider'`);
  console.log(`INFO: ${legacyDisputes.length} exact legacy dispute record(s) are eligible for the safe migration conversion.`);
  const paymentMigrations = await prisma.$queryRawUnsafe(`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name LIKE '20260713%' ORDER BY migration_name`);
  for (const migration of paymentMigrations) console.log(`INFO: migration ${migration.migration_name} is ${migration.rolled_back_at ? 'rolled back' : migration.finished_at ? 'applied' : 'unfinished'}.`);
  for (const [label, query, requiredColumn, requiredTable] of checks) {
    if (requiredTable && !tables.has(requiredTable)) {
      console.log(`OK: ${label} (${requiredTable} is not present yet)`);
      continue;
    }
    if (requiredColumn === 'providerStatus' && !providerStatusColumn) {
      console.log(`OK: ${label} (provider status column is not present yet)`);
      continue;
    }
    if (requiredColumn === 'explicitDisputedStatus' && !disputedEnumValue.length) {
      console.log(`OK: ${label} (explicit disputed status is not present yet)`);
      continue;
    }
    if (requiredColumn && !['providerStatus', 'explicitDisputedStatus'].includes(requiredColumn) && !paymentLinkColumns.has(requiredColumn)) {
      console.log(`OK: ${label} (${requiredColumn} is not present yet)`);
      continue;
    }
    const rows = await prisma.$queryRawUnsafe(query);
    if (!rows.length) {
      console.log(`OK: ${label}`);
      continue;
    }
    blockers += rows.length;
    console.error(`BLOCKER: ${label} (${rows.length})`);
    for (const row of rows) console.error(JSON.stringify(row));
  }
  if (blockers) {
    console.error(`Preflight stopped: ${blockers} financial integrity blocker(s). Review these IDs; no records were changed.`);
    process.exitCode = 1;
  } else {
    console.log('Payment migration preflight is clean. No records were changed.');
  }
}

main().catch((error) => {
  console.error(`Preflight could not run: ${String(error && error.message || error).split('\n')[0]}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
