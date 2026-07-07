-- CreateEnum
CREATE TYPE "ContractBillingStatus" AS ENUM ('UNKNOWN', 'INCLUDED', 'BILLABLE', 'OVERAGE', 'WARRANTY');

-- CreateEnum
CREATE TYPE "AssetIncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AssetIncidentStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ComplianceDocumentType" AS ENUM ('PHOTO', 'DOCUMENT', 'CERTIFICATE', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "PreventiveMaintenanceStatus" AS ENUM ('PLANNED', 'GENERATED', 'SKIPPED', 'FAILED', 'REVIEW_REQUIRED');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "complianceStatus" TEXT,
ADD COLUMN     "lastServicedAt" TIMESTAMP(3),
ADD COLUMN     "nextServiceDueAt" TIMESTAMP(3),
ADD COLUMN     "warrantyNotes" TEXT,
ADD COLUMN     "warrantyProvider" TEXT;

-- AlterTable
ALTER TABLE "ContractServiceLine" ADD COLUMN     "autoGenerate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "blackoutDates" JSONB,
ADD COLUMN     "generatedJobStatus" "JobStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "preferredBranchId" TEXT,
ADD COLUMN     "preferredWorkerId" TEXT,
ADD COLUMN     "serviceWindowEnd" TEXT,
ADD COLUMN     "serviceWindowStart" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "contractBillingStatus" "ContractBillingStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "contractLineId" TEXT,
ADD COLUMN     "preventiveMaintenanceRunId" TEXT,
ADD COLUMN     "slaWaivedAt" TIMESTAMP(3),
ADD COLUMN     "slaWaivedById" TEXT,
ADD COLUMN     "slaWaiverApprovalId" TEXT,
ADD COLUMN     "warrantyBillingOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "warrantyOverrideReason" TEXT,
ADD COLUMN     "warrantyRelated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceContract" ADD COLUMN     "autoGenerateJobs" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "blackoutDates" JSONB,
ADD COLUMN     "cancellationNoticeDays" INTEGER,
ADD COLUMN     "contractMonthlyValue" DECIMAL(12,2),
ADD COLUMN     "excludedServices" JSONB,
ADD COLUMN     "overageBillingRate" DECIMAL(12,2),
ADD COLUMN     "renewalDate" TIMESTAMP(3),
ADD COLUMN     "reviewBeforeDispatch" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "serviceWindowEnd" TEXT,
ADD COLUMN     "serviceWindowStart" TEXT;

-- CreateTable
CREATE TABLE "AssetIncident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "jobId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "AssetIncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "AssetIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "technicianNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetComplianceDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "jobId" TEXT,
    "documentType" "ComplianceDocumentType" NOT NULL DEFAULT 'DOCUMENT',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "notes" TEXT,
    "capturedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVisitUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractLineId" TEXT,
    "jobId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "billingStatus" "ContractBillingStatus" NOT NULL DEFAULT 'UNKNOWN',
    "countedVisit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractVisitUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveMaintenanceRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractLineId" TEXT NOT NULL,
    "generatedJobId" TEXT,
    "status" "PreventiveMaintenanceStatus" NOT NULL DEFAULT 'PLANNED',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3),
    "skippedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventiveMaintenanceRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetIncident_companyId_assetId_idx" ON "AssetIncident"("companyId", "assetId");

-- CreateIndex
CREATE INDEX "AssetIncident_companyId_jobId_idx" ON "AssetIncident"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "AssetIncident_companyId_status_idx" ON "AssetIncident"("companyId", "status");

-- CreateIndex
CREATE INDEX "AssetComplianceDocument_companyId_assetId_idx" ON "AssetComplianceDocument"("companyId", "assetId");

-- CreateIndex
CREATE INDEX "AssetComplianceDocument_companyId_jobId_idx" ON "AssetComplianceDocument"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "AssetComplianceDocument_companyId_documentType_idx" ON "AssetComplianceDocument"("companyId", "documentType");

-- CreateIndex
CREATE INDEX "ContractVisitUsage_companyId_contractId_periodStart_idx" ON "ContractVisitUsage"("companyId", "contractId", "periodStart");

-- CreateIndex
CREATE INDEX "ContractVisitUsage_companyId_contractLineId_idx" ON "ContractVisitUsage"("companyId", "contractLineId");

-- CreateIndex
CREATE INDEX "ContractVisitUsage_companyId_billingStatus_idx" ON "ContractVisitUsage"("companyId", "billingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVisitUsage_companyId_contractId_jobId_key" ON "ContractVisitUsage"("companyId", "contractId", "jobId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceRun_companyId_contractId_idx" ON "PreventiveMaintenanceRun"("companyId", "contractId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceRun_companyId_contractLineId_idx" ON "PreventiveMaintenanceRun"("companyId", "contractLineId");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceRun_companyId_status_idx" ON "PreventiveMaintenanceRun"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PreventiveMaintenanceRun_companyId_contractLineId_dueAt_key" ON "PreventiveMaintenanceRun"("companyId", "contractLineId", "dueAt");

-- CreateIndex
CREATE INDEX "Job_companyId_contractBillingStatus_idx" ON "Job"("companyId", "contractBillingStatus");

-- CreateIndex
CREATE INDEX "Job_companyId_contractLineId_idx" ON "Job"("companyId", "contractLineId");
