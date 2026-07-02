CREATE TYPE "ClientAccountStatus" AS ENUM ('ACTIVE', 'DISABLED', 'INVITED');

CREATE TABLE "ClientAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "ClientAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BookingRequest" ADD COLUMN "clientAccountId" TEXT;

CREATE UNIQUE INDEX "ClientAccount_companyId_email_key" ON "ClientAccount"("companyId", "email");
CREATE INDEX "ClientAccount_companyId_idx" ON "ClientAccount"("companyId");
CREATE INDEX "ClientAccount_companyId_customerId_idx" ON "ClientAccount"("companyId", "customerId");
CREATE INDEX "BookingRequest_companyId_clientAccountId_idx" ON "BookingRequest"("companyId", "clientAccountId");

ALTER TABLE "ClientAccount" ADD CONSTRAINT "ClientAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAccount" ADD CONSTRAINT "ClientAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "ClientAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
