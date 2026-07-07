-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYFAST', 'YOCO', 'OZOW', 'PAYNOW', 'SNAPSCAN', 'ZAPPER', 'STRIPE', 'MANUAL_BANK', 'ECOCASH_MANUAL', 'MOCK');

-- CreateEnum
CREATE TYPE "PaymentProviderConnectionStatus" AS ENUM ('DISCONNECTED', 'CONFIGURED', 'ACTIVE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('CREATED', 'SENT', 'OPENED', 'PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentProviderEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED', 'FAILED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "PaymentReconciliationStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'DUPLICATE', 'SUSPICIOUS', 'IGNORED');

-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('REQUESTED', 'APPROVAL_REQUIRED', 'APPROVED', 'PROCESSING', 'REFUNDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "CollectionReminderStatus" AS ENUM ('QUEUED', 'SENT', 'SKIPPED', 'FAILED', 'THROTTLED');

-- AlterTable
ALTER TABLE "CompanyFinanceSettings" ADD COLUMN     "defaultQuoteDepositPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
ADD COLUMN     "enforceQuoteDepositBeforeScheduling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderThrottleHours" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "depositRequiredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "depositRequiredPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "lastReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "nextReminderAt" TIMESTAMP(3),
ADD COLUMN     "paymentPlanNotes" TEXT,
ADD COLUMN     "promisedPaymentDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paymentLinkId" TEXT,
ADD COLUMN     "provider" "PaymentProvider",
ADD COLUMN     "providerPaymentId" TEXT,
ADD COLUMN     "reconciliationItemId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "depositPaidAt" TIMESTAMP(3),
ADD COLUMN     "depositRequiredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "depositRequiredPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PaymentProviderConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "displayName" TEXT,
    "status" "PaymentProviderConnectionStatus" NOT NULL DEFAULT 'CONFIGURED',
    "config" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderSecret" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "keyName" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "quoteId" TEXT,
    "providerConnectionId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'CREATED',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reference" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "externalId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerConnectionId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT,
    "eventType" TEXT,
    "status" "PaymentProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "paymentLinkId" TEXT,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "payload" JSONB,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReconciliationItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "providerConnectionId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "providerPaymentId" TEXT,
    "reference" TEXT,
    "payerName" TEXT,
    "payerEmail" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paidAt" TIMESTAMP(3),
    "matchedInvoiceId" TEXT,
    "matchedPaymentId" TEXT,
    "matchedById" TEXT,
    "suspiciousReason" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReconciliationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "providerConnectionId" TEXT,
    "approvalRequestId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "providerRefundId" TEXT,
    "reason" TEXT,
    "requestedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentRefundId" TEXT,
    "number" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionReminderRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "template" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionReminderLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "CollectionReminderStatus" NOT NULL DEFAULT 'QUEUED',
    "reminderType" TEXT,
    "recipient" TEXT,
    "sentAt" TIMESTAMP(3),
    "nextAllowedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentProviderConnection_companyId_idx" ON "PaymentProviderConnection"("companyId");

-- CreateIndex
CREATE INDEX "PaymentProviderConnection_provider_idx" ON "PaymentProviderConnection"("provider");

-- CreateIndex
CREATE INDEX "PaymentProviderConnection_status_idx" ON "PaymentProviderConnection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConnection_companyId_provider_key" ON "PaymentProviderConnection"("companyId", "provider");

-- CreateIndex
CREATE INDEX "PaymentProviderSecret_companyId_idx" ON "PaymentProviderSecret"("companyId");

-- CreateIndex
CREATE INDEX "PaymentProviderSecret_connectionId_idx" ON "PaymentProviderSecret"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderSecret_connectionId_keyName_key" ON "PaymentProviderSecret"("connectionId", "keyName");

-- CreateIndex
CREATE INDEX "PaymentLink_companyId_invoiceId_idx" ON "PaymentLink"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "PaymentLink_companyId_status_idx" ON "PaymentLink"("companyId", "status");

-- CreateIndex
CREATE INDEX "PaymentLink_provider_externalId_idx" ON "PaymentLink"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_companyId_reference_key" ON "PaymentLink"("companyId", "reference");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_companyId_provider_idx" ON "PaymentProviderEvent"("companyId", "provider");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_companyId_eventId_idx" ON "PaymentProviderEvent"("companyId", "eventId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_status_idx" ON "PaymentProviderEvent"("status");

-- CreateIndex
CREATE INDEX "PaymentReconciliationItem_companyId_status_idx" ON "PaymentReconciliationItem"("companyId", "status");

-- CreateIndex
CREATE INDEX "PaymentReconciliationItem_companyId_reference_idx" ON "PaymentReconciliationItem"("companyId", "reference");

-- CreateIndex
CREATE INDEX "PaymentReconciliationItem_provider_providerPaymentId_idx" ON "PaymentReconciliationItem"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentRefund_companyId_paymentId_idx" ON "PaymentRefund"("companyId", "paymentId");

-- CreateIndex
CREATE INDEX "PaymentRefund_companyId_status_idx" ON "PaymentRefund"("companyId", "status");

-- CreateIndex
CREATE INDEX "CreditNote_companyId_invoiceId_idx" ON "CreditNote"("companyId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_companyId_number_key" ON "CreditNote"("companyId", "number");

-- CreateIndex
CREATE INDEX "CollectionReminderRule_companyId_active_idx" ON "CollectionReminderRule"("companyId", "active");

-- CreateIndex
CREATE INDEX "CollectionReminderLog_companyId_invoiceId_createdAt_idx" ON "CollectionReminderLog"("companyId", "invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "CollectionReminderLog_companyId_status_idx" ON "CollectionReminderLog"("companyId", "status");

-- CreateIndex
CREATE INDEX "Payment_companyId_provider_providerPaymentId_idx" ON "Payment"("companyId", "provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_paymentLinkId_idx" ON "Payment"("paymentLinkId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderConnection" ADD CONSTRAINT "PaymentProviderConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderSecret" ADD CONSTRAINT "PaymentProviderSecret_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderSecret" ADD CONSTRAINT "PaymentProviderSecret_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PaymentProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_providerConnectionId_fkey" FOREIGN KEY ("providerConnectionId") REFERENCES "PaymentProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliationItem" ADD CONSTRAINT "PaymentReconciliationItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_providerConnectionId_fkey" FOREIGN KEY ("providerConnectionId") REFERENCES "PaymentProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReminderRule" ADD CONSTRAINT "CollectionReminderRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReminderLog" ADD CONSTRAINT "CollectionReminderLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReminderLog" ADD CONSTRAINT "CollectionReminderLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
