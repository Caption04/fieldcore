CREATE TABLE "CustomerProperty" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "clientAccountId" TEXT,
  "label" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT,
  "notes" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerProperty_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerProperty_companyId_customerId_idx" ON "CustomerProperty"("companyId", "customerId");
CREATE INDEX "CustomerProperty_companyId_clientAccountId_idx" ON "CustomerProperty"("companyId", "clientAccountId");
CREATE INDEX "CustomerProperty_companyId_customerId_isDefault_idx" ON "CustomerProperty"("companyId", "customerId", "isDefault");

ALTER TABLE "CustomerProperty" ADD CONSTRAINT "CustomerProperty_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerProperty" ADD CONSTRAINT "CustomerProperty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerProperty" ADD CONSTRAINT "CustomerProperty_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "ClientAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
