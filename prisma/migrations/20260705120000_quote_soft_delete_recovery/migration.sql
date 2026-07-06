ALTER TABLE "Quote"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deleteExpiresAt" TIMESTAMP(3);

CREATE INDEX "Quote_companyId_deletedAt_idx" ON "Quote"("companyId", "deletedAt");
