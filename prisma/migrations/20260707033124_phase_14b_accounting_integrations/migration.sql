-- CreateEnum
CREATE TYPE "FinanceSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'RETRYING', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FinanceWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED', 'FAILED');

-- AlterTable
ALTER TABLE "FinanceIntegration" ADD COLUMN     "connectedAt" TIMESTAMP(3),
ADD COLUMN     "disconnectedAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastTestAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FinanceIntegrationSecret" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "secretType" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceIntegrationSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceMapping" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationId" TEXT,
    "provider" "FinanceProvider" NOT NULL,
    "revenueAccountCode" TEXT,
    "taxRateId" TEXT,
    "paymentsAccountCode" TEXT,
    "discountsAccountCode" TEXT,
    "stockAccountCode" TEXT,
    "branchTrackingCategoryId" TEXT,
    "trackingCategoryId" TEXT,
    "invoicePrefix" TEXT,
    "customerNamingRule" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSyncLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationId" TEXT,
    "provider" "FinanceProvider" NOT NULL,
    "localType" "ExternalLocalType" NOT NULL,
    "localId" TEXT NOT NULL,
    "status" "FinanceSyncStatus" NOT NULL DEFAULT 'PENDING',
    "operation" TEXT NOT NULL,
    "externalId" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceWebhookEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationId" TEXT,
    "provider" "FinanceProvider" NOT NULL,
    "eventId" TEXT,
    "eventType" TEXT,
    "status" "FinanceWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceIntegrationSecret_companyId_idx" ON "FinanceIntegrationSecret"("companyId");

-- CreateIndex
CREATE INDEX "FinanceIntegrationSecret_integrationId_idx" ON "FinanceIntegrationSecret"("integrationId");

-- CreateIndex
CREATE INDEX "FinanceIntegrationSecret_secretType_idx" ON "FinanceIntegrationSecret"("secretType");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceIntegrationSecret_integrationId_secretType_key" ON "FinanceIntegrationSecret"("integrationId", "secretType");

-- CreateIndex
CREATE INDEX "FinanceMapping_companyId_idx" ON "FinanceMapping"("companyId");

-- CreateIndex
CREATE INDEX "FinanceMapping_provider_idx" ON "FinanceMapping"("provider");

-- CreateIndex
CREATE INDEX "FinanceMapping_integrationId_idx" ON "FinanceMapping"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceMapping_companyId_provider_key" ON "FinanceMapping"("companyId", "provider");

-- CreateIndex
CREATE INDEX "FinanceSyncLog_companyId_createdAt_idx" ON "FinanceSyncLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceSyncLog_companyId_provider_localType_localId_idx" ON "FinanceSyncLog"("companyId", "provider", "localType", "localId");

-- CreateIndex
CREATE INDEX "FinanceSyncLog_status_idx" ON "FinanceSyncLog"("status");

-- CreateIndex
CREATE INDEX "FinanceSyncLog_integrationId_idx" ON "FinanceSyncLog"("integrationId");

-- CreateIndex
CREATE INDEX "FinanceWebhookEvent_companyId_receivedAt_idx" ON "FinanceWebhookEvent"("companyId", "receivedAt");

-- CreateIndex
CREATE INDEX "FinanceWebhookEvent_companyId_provider_idx" ON "FinanceWebhookEvent"("companyId", "provider");

-- CreateIndex
CREATE INDEX "FinanceWebhookEvent_integrationId_idx" ON "FinanceWebhookEvent"("integrationId");

-- CreateIndex
CREATE INDEX "FinanceWebhookEvent_eventId_idx" ON "FinanceWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "FinanceWebhookEvent_status_idx" ON "FinanceWebhookEvent"("status");

-- AddForeignKey
ALTER TABLE "FinanceIntegrationSecret" ADD CONSTRAINT "FinanceIntegrationSecret_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceIntegrationSecret" ADD CONSTRAINT "FinanceIntegrationSecret_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "FinanceIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMapping" ADD CONSTRAINT "FinanceMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMapping" ADD CONSTRAINT "FinanceMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "FinanceIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSyncLog" ADD CONSTRAINT "FinanceSyncLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSyncLog" ADD CONSTRAINT "FinanceSyncLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "FinanceIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSyncLog" ADD CONSTRAINT "FinanceSyncLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceWebhookEvent" ADD CONSTRAINT "FinanceWebhookEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceWebhookEvent" ADD CONSTRAINT "FinanceWebhookEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "FinanceIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
