-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'RETIRED');

-- CreateEnum
CREATE TYPE "ServiceContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "JobSlaStatus" AS ENUM ('NOT_APPLICABLE', 'ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'WAIVED');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "contractId" TEXT,
ADD COLUMN "responseDueAt" TIMESTAMP(3),
ADD COLUMN "completionDueAt" TIMESTAMP(3),
ADD COLUMN "slaStatus" "JobSlaStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN "slaBreachedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "propertyId" TEXT,
  "serviceId" TEXT,
  "name" TEXT NOT NULL,
  "assetType" TEXT NOT NULL,
  "assetTag" TEXT,
  "serialNumber" TEXT,
  "manufacturer" TEXT,
  "modelNumber" TEXT,
  "locationLabel" TEXT,
  "installedAt" TIMESTAMP(3),
  "warrantyStartAt" TIMESTAMP(3),
  "warrantyEndAt" TIMESTAMP(3),
  "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "customFields" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAsset" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "primaryAsset" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceContract" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "propertyId" TEXT,
  "contractNumber" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ServiceContractStatus" NOT NULL DEFAULT 'DRAFT',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "contractValue" DECIMAL(12,2),
  "billingInterval" "BillingInterval",
  "responseSlaHours" INTEGER,
  "completionSlaHours" INTEGER,
  "includedVisits" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceContractAsset" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceContractAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractServiceLine" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "serviceId" TEXT,
  "title" TEXT NOT NULL,
  "frequency" "RecurringFrequency" NOT NULL,
  "interval" INTEGER NOT NULL DEFAULT 1,
  "visitsPerPeriod" INTEGER,
  "nextDueAt" TIMESTAMP(3),
  "lastGeneratedJobAt" TIMESTAMP(3),
  "defaultDurationMinutes" INTEGER,
  "requiresProofPhotos" BOOLEAN NOT NULL DEFAULT false,
  "requiresSignature" BOOLEAN NOT NULL DEFAULT false,
  "requiresLocation" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractServiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_companyId_assetTag_key" ON "Asset"("companyId", "assetTag");
CREATE INDEX "Asset_companyId_customerId_idx" ON "Asset"("companyId", "customerId");
CREATE INDEX "Asset_companyId_propertyId_idx" ON "Asset"("companyId", "propertyId");
CREATE INDEX "Asset_companyId_status_idx" ON "Asset"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobAsset_companyId_jobId_assetId_key" ON "JobAsset"("companyId", "jobId", "assetId");
CREATE INDEX "JobAsset_companyId_jobId_idx" ON "JobAsset"("companyId", "jobId");
CREATE INDEX "JobAsset_companyId_assetId_idx" ON "JobAsset"("companyId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContract_companyId_contractNumber_key" ON "ServiceContract"("companyId", "contractNumber");
CREATE INDEX "ServiceContract_companyId_customerId_idx" ON "ServiceContract"("companyId", "customerId");
CREATE INDEX "ServiceContract_companyId_status_idx" ON "ServiceContract"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContractAsset_companyId_contractId_assetId_key" ON "ServiceContractAsset"("companyId", "contractId", "assetId");
CREATE INDEX "ServiceContractAsset_companyId_contractId_idx" ON "ServiceContractAsset"("companyId", "contractId");
CREATE INDEX "ServiceContractAsset_companyId_assetId_idx" ON "ServiceContractAsset"("companyId", "assetId");

-- CreateIndex
CREATE INDEX "ContractServiceLine_companyId_contractId_idx" ON "ContractServiceLine"("companyId", "contractId");
CREATE INDEX "ContractServiceLine_companyId_nextDueAt_idx" ON "ContractServiceLine"("companyId", "nextDueAt");

-- CreateIndex
CREATE INDEX "Job_companyId_contractId_idx" ON "Job"("companyId", "contractId");
CREATE INDEX "Job_companyId_slaStatus_idx" ON "Job"("companyId", "slaStatus");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "CustomerProperty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAsset" ADD CONSTRAINT "JobAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobAsset" ADD CONSTRAINT "JobAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobAsset" ADD CONSTRAINT "JobAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "CustomerProperty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractAsset" ADD CONSTRAINT "ServiceContractAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceContractAsset" ADD CONSTRAINT "ServiceContractAsset_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceContractAsset" ADD CONSTRAINT "ServiceContractAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractServiceLine" ADD CONSTRAINT "ContractServiceLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractServiceLine" ADD CONSTRAINT "ContractServiceLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractServiceLine" ADD CONSTRAINT "ContractServiceLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
