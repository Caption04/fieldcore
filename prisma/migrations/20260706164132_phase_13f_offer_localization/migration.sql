-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'PAYFAST';
ALTER TYPE "PaymentMethod" ADD VALUE 'YOCO';
ALTER TYPE "PaymentMethod" ADD VALUE 'OZOW';
ALTER TYPE "PaymentMethod" ADD VALUE 'SNAPSCAN';
ALTER TYPE "PaymentMethod" ADD VALUE 'MANUAL_CARD';
ALTER TYPE "PaymentMethod" ADD VALUE 'EXTERNAL_PAYMENT_LINK';
ALTER TYPE "PaymentMethod" ADD VALUE 'CUSTOM_MANUAL';

-- AlterTable
ALTER TABLE "CompanyFinanceSettings" ADD COLUMN     "allowedPaymentMethods" JSONB,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'ZW',
ADD COLUMN     "dateFormat" TEXT NOT NULL DEFAULT 'yyyy-MM-dd',
ADD COLUMN     "numberFormat" TEXT NOT NULL DEFAULT 'en-ZW',
ADD COLUMN     "paymentInstructions" TEXT,
ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "quoteExpiryDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Harare';
