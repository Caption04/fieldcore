-- Atomic company counters for payment documents.
ALTER TABLE "CompanyInvoiceCounter"
  ADD COLUMN "receiptNextNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "creditNoteNextNumber" INTEGER NOT NULL DEFAULT 1;

-- Start after the largest numeric suffix already used where possible. The
-- allocator still checks the unique indexes, so non-standard legacy numbers
-- remain safe.
UPDATE "CompanyInvoiceCounter" counter
SET "receiptNextNumber" = GREATEST(
      counter."receiptNextNumber",
      COALESCE((SELECT MAX((substring(r."receiptNumber" FROM '([0-9]+)$'))::integer) + 1
                FROM "Receipt" r
                WHERE r."companyId" = counter."companyId"
                  AND r."receiptNumber" ~ '[0-9]+$'), 1)
    ),
    "creditNoteNextNumber" = GREATEST(
      counter."creditNoteNextNumber",
      COALESCE((SELECT MAX((substring(c.number FROM '([0-9]+)$'))::integer) + 1
                FROM "CreditNote" c
                WHERE c."companyId" = counter."companyId"
                  AND c.number ~ '[0-9]+$'), 1)
    );

-- Opaque callback identity for newly created provider URLs.
ALTER TABLE "PaymentProviderConnection"
  ADD COLUMN "callbackToken" TEXT;
CREATE UNIQUE INDEX "PaymentProviderConnection_callbackToken_key"
  ON "PaymentProviderConnection"("callbackToken");

-- Encrypted credential versions preserve verification for unresolved attempts
-- after a business rotates its current merchant details.
CREATE TABLE "PaymentProviderCredentialVersion" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "keyVersion" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'test',
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentProviderCredentialVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentProviderCredentialVersion_connectionId_version_key"
  ON "PaymentProviderCredentialVersion"("connectionId", "version");
CREATE INDEX "PaymentProviderCredentialVersion_companyId_connectionId_idx"
  ON "PaymentProviderCredentialVersion"("companyId", "connectionId");
CREATE INDEX "PaymentProviderCredentialVersion_connectionId_retiredAt_idx"
  ON "PaymentProviderCredentialVersion"("connectionId", "retiredAt");
ALTER TABLE "PaymentProviderCredentialVersion"
  ADD CONSTRAINT "PaymentProviderCredentialVersion_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderCredentialVersion"
  ADD CONSTRAINT "PaymentProviderCredentialVersion_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "PaymentProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the invoice and credential state used to create each attempt,
-- prevent repeated Ozow form submission, and support bounded status recovery.
ALTER TABLE "PaymentLink"
  ADD COLUMN "credentialVersionId" TEXT,
  ADD COLUMN "invoiceUpdatedAtSnapshot" TIMESTAMP(3),
  ADD COLUMN "invoiceBalanceSnapshot" DECIMAL(12,2),
  ADD COLUMN "invoiceTotalSnapshot" DECIMAL(12,2),
  ADD COLUMN "customerIdSnapshot" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "nextStatusCheckAt" TIMESTAMP(3),
  ADD COLUMN "statusCheckAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastStatusCheckAt" TIMESTAMP(3),
  ADD COLUMN "lastStatusCheckErrorCode" TEXT,
  ADD COLUMN "reconciliationState" TEXT,
  ADD COLUMN "abandonedAt" TIMESTAMP(3);
ALTER TABLE "PaymentLink"
  ADD CONSTRAINT "PaymentLink_credentialVersionId_fkey"
  FOREIGN KEY ("credentialVersionId") REFERENCES "PaymentProviderCredentialVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PaymentLink_credentialVersionId_idx" ON "PaymentLink"("credentialVersionId");
CREATE INDEX "PaymentLink_nextStatusCheckAt_status_idx" ON "PaymentLink"("nextStatusCheckAt", "status");

-- One upstream provider transaction and one Paynow merchant trace may only
-- belong to one FieldCore attempt. PostgreSQL allows multiple NULL values.
CREATE UNIQUE INDEX "PaymentLink_providerConnectionId_providerPaymentId_key"
  ON "PaymentLink"("providerConnectionId", "providerPaymentId");
CREATE UNIQUE INDEX "PaymentLink_providerConnectionId_merchantTrace_key"
  ON "PaymentLink"("providerConnectionId", "merchantTrace");
CREATE UNIQUE INDEX "CreditNote_companyId_paymentRefundId_key"
  ON "CreditNote"("companyId", "paymentRefundId");


-- Reconciliation records use a stable dedupe key so callback replay and
-- concurrent background checks cannot create duplicate review items.
ALTER TABLE "PaymentReconciliationItem" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "PaymentReconciliationItem_dedupeKey_key"
  ON "PaymentReconciliationItem"("dedupeKey");

-- Real provider-confirmed excess money is retained instead of being dropped.
CREATE TABLE "UnappliedCustomerCredit" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "paymentId" TEXT NOT NULL,
  "paymentLinkId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UnappliedCustomerCredit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UnappliedCustomerCredit_paymentId_key" ON "UnappliedCustomerCredit"("paymentId");
CREATE INDEX "UnappliedCustomerCredit_companyId_customerId_status_idx" ON "UnappliedCustomerCredit"("companyId", "customerId", "status");
CREATE INDEX "UnappliedCustomerCredit_companyId_invoiceId_idx" ON "UnappliedCustomerCredit"("companyId", "invoiceId");
ALTER TABLE "UnappliedCustomerCredit" ADD CONSTRAINT "UnappliedCustomerCredit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnappliedCustomerCredit" ADD CONSTRAINT "UnappliedCustomerCredit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnappliedCustomerCredit" ADD CONSTRAINT "UnappliedCustomerCredit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UnappliedCustomerCredit" ADD CONSTRAINT "UnappliedCustomerCredit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnappliedCustomerCredit" ADD CONSTRAINT "UnappliedCustomerCredit_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Financial notifications are queued after money commits, so provider replay
-- or email/WhatsApp outages cannot roll back or duplicate accounting.
CREATE TABLE "PaymentNotificationOutbox" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentNotificationOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentNotificationOutbox_companyId_eventKey_key" ON "PaymentNotificationOutbox"("companyId", "eventKey");
CREATE INDEX "PaymentNotificationOutbox_status_nextAttemptAt_idx" ON "PaymentNotificationOutbox"("status", "nextAttemptAt");
ALTER TABLE "PaymentNotificationOutbox" ADD CONSTRAINT "PaymentNotificationOutbox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
