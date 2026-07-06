-- CreateEnum
CREATE TYPE "ApprovalEventType" AS ENUM ('QUOTE_DISCOUNT', 'QUOTE_SEND', 'INVOICE_VOID', 'PAYMENT_REFUND', 'PURCHASE_ORDER_SEND', 'STOCK_ADJUSTMENT', 'JOB_RESCHEDULE', 'SLA_WAIVE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "CustomerProperty" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "ServiceContract" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "timezone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" "ApprovalEventType" NOT NULL,
    "thresholdAmount" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "policyId" TEXT,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" "ApprovalEventType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Branch_companyId_active_idx" ON "Branch"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_companyId_eventType_active_idx" ON "ApprovalPolicy"("companyId", "eventType", "active");

-- CreateIndex
CREATE INDEX "ApprovalRequest_companyId_status_createdAt_idx" ON "ApprovalRequest"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_companyId_entityType_entityId_idx" ON "ApprovalRequest"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_companyId_eventType_status_idx" ON "ApprovalRequest"("companyId", "eventType", "status");

-- CreateIndex
CREATE INDEX "Asset_companyId_branchId_idx" ON "Asset"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Customer_companyId_branchId_idx" ON "Customer"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "CustomerProperty_companyId_branchId_idx" ON "CustomerProperty"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_branchId_idx" ON "Invoice"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Job_companyId_branchId_idx" ON "Job"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Payment_companyId_branchId_idx" ON "Payment"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_branchId_idx" ON "PurchaseOrder"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_companyId_branchId_idx" ON "PurchaseRequest"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Quote_companyId_branchId_idx" ON "Quote"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Receipt_companyId_branchId_idx" ON "Receipt"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "ServiceContract_companyId_branchId_idx" ON "ServiceContract"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "StockLocation_companyId_branchId_idx" ON "StockLocation"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "WorkerProfile_companyId_branchId_idx" ON "WorkerProfile"("companyId", "branchId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ApprovalPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProperty" ADD CONSTRAINT "CustomerProperty_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
