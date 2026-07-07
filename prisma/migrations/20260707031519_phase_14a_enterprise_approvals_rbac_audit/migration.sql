-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApprovalEventType" ADD VALUE 'INVOICE_DISCOUNT';
ALTER TYPE "ApprovalEventType" ADD VALUE 'PURCHASE_ORDER_APPROVE';
ALTER TYPE "ApprovalEventType" ADD VALUE 'JOB_REASSIGN_AFTER_DISPATCH';
ALTER TYPE "ApprovalEventType" ADD VALUE 'CONTRACT_CANCEL';

-- AlterTable
ALTER TABLE "ApprovalPolicy" ADD COLUMN     "allowSelfApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "expiresAfterHours" INTEGER,
ADD COLUMN     "reasonRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiredApproverRole" "Role" NOT NULL DEFAULT 'OWNER';

-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "actionKey" TEXT,
ADD COLUMN     "actionPayload" JSONB,
ADD COLUMN     "amount" DECIMAL(12,2),
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "executedAt" TIMESTAMP(3),
ADD COLUMN     "executionResult" JSONB,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "thresholdAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "PermissionRoleTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "role" "Role" NOT NULL,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionRoleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranchAccess" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "permissions" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermissionRoleTemplate_companyId_idx" ON "PermissionRoleTemplate"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionRoleTemplate_companyId_role_key" ON "PermissionRoleTemplate"("companyId", "role");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_companyId_permissionKey_idx" ON "UserPermissionOverride"("companyId", "permissionKey");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_companyId_userId_idx" ON "UserPermissionOverride"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionOverride_companyId_userId_permissionKey_branc_key" ON "UserPermissionOverride"("companyId", "userId", "permissionKey", "branchId");

-- CreateIndex
CREATE INDEX "UserBranchAccess_companyId_branchId_idx" ON "UserBranchAccess"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "UserBranchAccess_companyId_userId_active_idx" ON "UserBranchAccess"("companyId", "userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "UserBranchAccess_companyId_userId_branchId_key" ON "UserBranchAccess"("companyId", "userId", "branchId");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_companyId_branchId_eventType_active_idx" ON "ApprovalPolicy"("companyId", "branchId", "eventType", "active");

-- CreateIndex
CREATE INDEX "ApprovalRequest_companyId_branchId_status_createdAt_idx" ON "ApprovalRequest"("companyId", "branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_companyId_actionKey_status_idx" ON "ApprovalRequest"("companyId", "actionKey", "status");

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRoleTemplate" ADD CONSTRAINT "PermissionRoleTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
