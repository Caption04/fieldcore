-- CreateEnum
CREATE TYPE "FinanceProvider" AS ENUM ('MANUAL_CSV', 'XERO', 'QUICKBOOKS', 'SAGE', 'ZOHO_BOOKS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FinanceIntegrationStatus" AS ENUM ('DISCONNECTED', 'CONFIGURED', 'ACTIVE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "FinanceExportType" AS ENUM ('INVOICES', 'PAYMENTS', 'RECEIPTS', 'CUSTOMERS');

-- CreateEnum
CREATE TYPE "FinanceExportStatus" AS ENUM ('COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExternalLocalType" AS ENUM ('INVOICE', 'PAYMENT', 'RECEIPT', 'CUSTOMER', 'QUOTE', 'JOB');

-- CreateTable
CREATE TABLE "CompanyFinanceSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "allowedCurrencies" JSONB,
    "taxName" TEXT NOT NULL DEFAULT 'Tax',
    "taxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
    "invoicePrefix" TEXT,
    "receiptPrefix" TEXT,
    "fiscalYearStartMonth" INTEGER,
    "invoiceFooter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFinanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceIntegration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "FinanceProvider" NOT NULL,
    "status" "FinanceIntegrationStatus" NOT NULL DEFAULT 'CONFIGURED',
    "externalTenantId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalRecordLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "FinanceProvider" NOT NULL,
    "localType" "ExternalLocalType" NOT NULL,
    "localId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalRecordLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExportLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "exportType" "FinanceExportType" NOT NULL,
    "provider" "FinanceProvider" NOT NULL DEFAULT 'MANUAL_CSV',
    "status" "FinanceExportStatus" NOT NULL DEFAULT 'COMPLETED',
    "fileName" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFinanceSettings_companyId_key" ON "CompanyFinanceSettings"("companyId");

-- CreateIndex
CREATE INDEX "CompanyFinanceSettings_companyId_idx" ON "CompanyFinanceSettings"("companyId");

-- CreateIndex
CREATE INDEX "FinanceIntegration_companyId_idx" ON "FinanceIntegration"("companyId");

-- CreateIndex
CREATE INDEX "FinanceIntegration_provider_idx" ON "FinanceIntegration"("provider");

-- CreateIndex
CREATE INDEX "FinanceIntegration_status_idx" ON "FinanceIntegration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceIntegration_companyId_provider_key" ON "FinanceIntegration"("companyId", "provider");

-- CreateIndex
CREATE INDEX "ExternalRecordLink_companyId_idx" ON "ExternalRecordLink"("companyId");

-- CreateIndex
CREATE INDEX "ExternalRecordLink_provider_idx" ON "ExternalRecordLink"("provider");

-- CreateIndex
CREATE INDEX "ExternalRecordLink_localType_localId_idx" ON "ExternalRecordLink"("localType", "localId");

-- CreateIndex
CREATE INDEX "ExternalRecordLink_externalId_idx" ON "ExternalRecordLink"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRecordLink_companyId_provider_localType_localId_key" ON "ExternalRecordLink"("companyId", "provider", "localType", "localId");

-- CreateIndex
CREATE INDEX "FinanceExportLog_companyId_createdAt_idx" ON "FinanceExportLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceExportLog_companyId_exportType_idx" ON "FinanceExportLog"("companyId", "exportType");

-- CreateIndex
CREATE INDEX "FinanceExportLog_provider_idx" ON "FinanceExportLog"("provider");

-- CreateIndex
CREATE INDEX "FinanceExportLog_status_idx" ON "FinanceExportLog"("status");

-- AddForeignKey
ALTER TABLE "CompanyFinanceSettings" ADD CONSTRAINT "CompanyFinanceSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceIntegration" ADD CONSTRAINT "FinanceIntegration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalRecordLink" ADD CONSTRAINT "ExternalRecordLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExportLog" ADD CONSTRAINT "FinanceExportLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExportLog" ADD CONSTRAINT "FinanceExportLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
