CREATE TYPE "BookingRequestStatus" AS ENUM ('NEW', 'REVIEWED', 'CONVERTED', 'DECLINED', 'CANCELLED');

CREATE TABLE "BookingRequest" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT,
  "serviceId" TEXT,
  "status" "BookingRequestStatus" NOT NULL DEFAULT 'NEW',
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "address" TEXT,
  "serviceName" TEXT,
  "preferredDate" TIMESTAMP(3),
  "preferredTimeWindow" TEXT,
  "notes" TEXT,
  "source" TEXT,
  "convertedJobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingRequest_convertedJobId_key" ON "BookingRequest"("convertedJobId");
CREATE INDEX "BookingRequest_companyId_status_createdAt_idx" ON "BookingRequest"("companyId", "status", "createdAt");
CREATE INDEX "BookingRequest_companyId_customerId_idx" ON "BookingRequest"("companyId", "customerId");
CREATE INDEX "BookingRequest_companyId_serviceId_idx" ON "BookingRequest"("companyId", "serviceId");

ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_convertedJobId_fkey" FOREIGN KEY ("convertedJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
