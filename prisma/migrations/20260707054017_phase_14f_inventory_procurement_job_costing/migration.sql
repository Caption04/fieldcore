-- AlterEnum
ALTER TYPE "ApprovalEventType" ADD VALUE 'PURCHASE_REQUEST_APPROVE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'APPROVAL_REQUIRED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchaseOrderApprovalThreshold" DECIMAL(12,2) NOT NULL DEFAULT 2500,
ADD COLUMN     "purchaseRequestApprovalThreshold" DECIMAL(12,2) NOT NULL DEFAULT 1000,
ADD COLUMN     "stockAdjustmentApprovalThreshold" DECIMAL(12,2) NOT NULL DEFAULT 500;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "itemCategory" TEXT,
ADD COLUMN     "minStockLevel" DECIMAL(12,3),
ADD COLUMN     "preferredSupplierId" TEXT,
ADD COLUMN     "serialNumberRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serialTracked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supplierLeadTimeDays" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "supplierInvoiceRef" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "backorderQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "estimatedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "StockLocation" ADD COLUMN     "vehicleIdentifier" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "leadTimeDays" INTEGER;

-- CreateTable
CREATE TABLE "PurchaseRequestLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "branchId" TEXT,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "estimatedUnitCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseRequestLine_companyId_purchaseRequestId_idx" ON "PurchaseRequestLine"("companyId", "purchaseRequestId");

-- CreateIndex
CREATE INDEX "PurchaseRequestLine_companyId_itemId_idx" ON "PurchaseRequestLine"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "PurchaseRequestLine_companyId_branchId_idx" ON "PurchaseRequestLine"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "InventoryItem_companyId_preferredSupplierId_idx" ON "InventoryItem"("companyId", "preferredSupplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_assetId_idx" ON "PurchaseOrder"("companyId", "assetId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_contractId_idx" ON "PurchaseOrder"("companyId", "contractId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_companyId_assetId_idx" ON "PurchaseRequest"("companyId", "assetId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_companyId_contractId_idx" ON "PurchaseRequest"("companyId", "contractId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestLine" ADD CONSTRAINT "PurchaseRequestLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestLine" ADD CONSTRAINT "PurchaseRequestLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestLine" ADD CONSTRAINT "PurchaseRequestLine_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestLine" ADD CONSTRAINT "PurchaseRequestLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
