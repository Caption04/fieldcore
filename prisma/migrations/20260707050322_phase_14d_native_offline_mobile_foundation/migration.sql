/*
  Warnings:

  - A unique constraint covering the columns `[companyId,jobId,syncId]` on the table `JobProofPhoto` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OfflineActionStatus" ADD VALUE 'CONFLICT';
ALTER TYPE "OfflineActionStatus" ADD VALUE 'RESOLVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OfflineActionType" ADD VALUE 'GPS_CHECKPOINT';
ALTER TYPE "OfflineActionType" ADD VALUE 'CHECKLIST_COMPLETED';
ALTER TYPE "OfflineActionType" ADD VALUE 'ISSUE_NOTE';
ALTER TYPE "OfflineActionType" ADD VALUE 'CUSTOMER_UNAVAILABLE';

-- DropIndex
DROP INDEX "WorkerDevice_companyId_workerId_idx";

-- AlterTable
ALTER TABLE "OfflineActionQueue" ADD COLUMN     "clientActionId" TEXT,
ADD COLUMN     "conflictReason" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "result" JSONB,
ADD COLUMN     "snapshotUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkerDevice" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "deviceModel" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedById" TEXT,
ADD COLUMN     "revokedReason" TEXT,
ADD COLUMN     "trustedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "JobChecklistTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serviceId" TEXT,
    "contractId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requiredForCompletion" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobChecklistItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "answerType" TEXT NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "photoRequired" BOOLEAN NOT NULL DEFAULT false,
    "passFail" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobChecklistAnswer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "workerId" TEXT,
    "capturedById" TEXT,
    "answer" TEXT,
    "passed" BOOLEAN,
    "note" TEXT,
    "photoUrl" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineCreatedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "syncId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobChecklistAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobChecklistTemplate_companyId_serviceId_active_idx" ON "JobChecklistTemplate"("companyId", "serviceId", "active");

-- CreateIndex
CREATE INDEX "JobChecklistTemplate_companyId_contractId_active_idx" ON "JobChecklistTemplate"("companyId", "contractId", "active");

-- CreateIndex
CREATE INDEX "JobChecklistItem_companyId_templateId_active_idx" ON "JobChecklistItem"("companyId", "templateId", "active");

-- CreateIndex
CREATE INDEX "JobChecklistAnswer_companyId_jobId_idx" ON "JobChecklistAnswer"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobChecklistAnswer_companyId_templateId_idx" ON "JobChecklistAnswer"("companyId", "templateId");

-- CreateIndex
CREATE INDEX "JobChecklistAnswer_companyId_workerId_idx" ON "JobChecklistAnswer"("companyId", "workerId");

-- CreateIndex
CREATE UNIQUE INDEX "JobChecklistAnswer_companyId_jobId_itemId_key" ON "JobChecklistAnswer"("companyId", "jobId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "JobProofPhoto_companyId_jobId_syncId_key" ON "JobProofPhoto"("companyId", "jobId", "syncId");

-- CreateIndex
CREATE INDEX "OfflineActionQueue_companyId_clientActionId_idx" ON "OfflineActionQueue"("companyId", "clientActionId");

-- CreateIndex
CREATE INDEX "WorkerDevice_companyId_workerId_active_idx" ON "WorkerDevice"("companyId", "workerId", "active");

-- CreateIndex
CREATE INDEX "WorkerDevice_companyId_revokedAt_idx" ON "WorkerDevice"("companyId", "revokedAt");

-- AddForeignKey
ALTER TABLE "WorkerDevice" ADD CONSTRAINT "WorkerDevice_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistTemplate" ADD CONSTRAINT "JobChecklistTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistTemplate" ADD CONSTRAINT "JobChecklistTemplate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistTemplate" ADD CONSTRAINT "JobChecklistTemplate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistItem" ADD CONSTRAINT "JobChecklistItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistItem" ADD CONSTRAINT "JobChecklistItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistAnswer" ADD CONSTRAINT "JobChecklistAnswer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistAnswer" ADD CONSTRAINT "JobChecklistAnswer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistAnswer" ADD CONSTRAINT "JobChecklistAnswer_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistAnswer" ADD CONSTRAINT "JobChecklistAnswer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "JobChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistAnswer" ADD CONSTRAINT "JobChecklistAnswer_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistAnswer" ADD CONSTRAINT "JobChecklistAnswer_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
