-- Add explicit terminal financial states. Data backfill is deliberately kept
-- in the next migration because PostgreSQL cannot safely use a newly-added
-- enum value until the enum migration transaction has committed.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';
ALTER TYPE "PaymentLinkStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "PaymentLinkStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';
