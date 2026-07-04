ALTER TABLE "BookingRequest" ADD COLUMN "publicReference" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN "city" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN "propertyType" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN "accessNotes" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN "customerFacingMessage" TEXT;

CREATE UNIQUE INDEX "BookingRequest_publicReference_key" ON "BookingRequest"("publicReference");
CREATE INDEX "BookingRequest_companyId_publicReference_idx" ON "BookingRequest"("companyId", "publicReference");

CREATE TABLE "BookingRequestPhoto" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bookingRequestId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingRequestPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingRequestPhoto_companyId_bookingRequestId_idx" ON "BookingRequestPhoto"("companyId", "bookingRequestId");

ALTER TABLE "BookingRequestPhoto" ADD CONSTRAINT "BookingRequestPhoto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingRequestPhoto" ADD CONSTRAINT "BookingRequestPhoto_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
