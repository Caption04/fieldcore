-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('BREVO', 'META_WHATSAPP_CLOUD', 'CLICKATELL', 'AFRICAS_TALKING', 'CLOUDFLARE_R2');

-- CreateEnum
CREATE TYPE "IntegrationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS', 'STORAGE');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'CONFIGURED', 'ACTIVE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "channel" "IntegrationChannel" NOT NULL,
    "displayName" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "config" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestError" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSecret" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationConnectionId" TEXT NOT NULL,
    "keyName" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationConnectionId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "channel" "IntegrationChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "bookingId" TEXT,
    "jobId" TEXT,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "notificationLogId" TEXT,
    "recipientMasked" TEXT,
    "recipientHash" TEXT,
    "senderMasked" TEXT,
    "providerMessageId" TEXT,
    "providerStatus" TEXT,
    "errorCode" TEXT,
    "errorMessageSanitized" TEXT,
    "templateName" TEXT,
    "metadata" JSONB,
    "queuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageObject" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationConnectionId" TEXT,
    "provider" "IntegrationProvider" NOT NULL DEFAULT 'CLOUDFLARE_R2',
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "safeUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" TEXT,
    "bookingId" TEXT,
    "jobId" TEXT,
    "customerId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageUsageMonthly" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL DEFAULT 'CLOUDFLARE_R2',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "objectCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageUsageMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationConnection_companyId_idx" ON "IntegrationConnection"("companyId");
CREATE UNIQUE INDEX "IntegrationConnection_companyId_provider_key" ON "IntegrationConnection"("companyId", "provider");
CREATE INDEX "IntegrationConnection_provider_idx" ON "IntegrationConnection"("provider");
CREATE INDEX "IntegrationConnection_channel_idx" ON "IntegrationConnection"("channel");
CREATE INDEX "IntegrationConnection_status_idx" ON "IntegrationConnection"("status");
CREATE INDEX "IntegrationConnection_createdAt_idx" ON "IntegrationConnection"("createdAt");
CREATE UNIQUE INDEX "IntegrationSecret_integrationConnectionId_keyName_key" ON "IntegrationSecret"("integrationConnectionId", "keyName");
CREATE INDEX "IntegrationSecret_companyId_idx" ON "IntegrationSecret"("companyId");
CREATE INDEX "IntegrationSecret_integrationConnectionId_idx" ON "IntegrationSecret"("integrationConnectionId");
CREATE INDEX "MessageLog_companyId_idx" ON "MessageLog"("companyId");
CREATE INDEX "MessageLog_provider_idx" ON "MessageLog"("provider");
CREATE INDEX "MessageLog_channel_idx" ON "MessageLog"("channel");
CREATE INDEX "MessageLog_status_idx" ON "MessageLog"("status");
CREATE INDEX "MessageLog_bookingId_idx" ON "MessageLog"("bookingId");
CREATE INDEX "MessageLog_jobId_idx" ON "MessageLog"("jobId");
CREATE INDEX "MessageLog_customerId_idx" ON "MessageLog"("customerId");
CREATE INDEX "MessageLog_createdAt_idx" ON "MessageLog"("createdAt");
CREATE INDEX "StorageObject_companyId_idx" ON "StorageObject"("companyId");
CREATE INDEX "StorageObject_provider_idx" ON "StorageObject"("provider");
CREATE INDEX "StorageObject_bucket_idx" ON "StorageObject"("bucket");
CREATE INDEX "StorageObject_jobId_idx" ON "StorageObject"("jobId");
CREATE INDEX "StorageObject_bookingId_idx" ON "StorageObject"("bookingId");
CREATE INDEX "StorageObject_customerId_idx" ON "StorageObject"("customerId");
CREATE INDEX "StorageObject_createdAt_idx" ON "StorageObject"("createdAt");
CREATE UNIQUE INDEX "StorageUsageMonthly_companyId_provider_year_month_key" ON "StorageUsageMonthly"("companyId", "provider", "year", "month");
CREATE INDEX "StorageUsageMonthly_companyId_idx" ON "StorageUsageMonthly"("companyId");
CREATE INDEX "StorageUsageMonthly_provider_idx" ON "StorageUsageMonthly"("provider");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSecret" ADD CONSTRAINT "IntegrationSecret_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSecret" ADD CONSTRAINT "IntegrationSecret_integrationConnectionId_fkey" FOREIGN KEY ("integrationConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_integrationConnectionId_fkey" FOREIGN KEY ("integrationConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "BookingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_notificationLogId_fkey" FOREIGN KEY ("notificationLogId") REFERENCES "NotificationLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_integrationConnectionId_fkey" FOREIGN KEY ("integrationConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "BookingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StorageUsageMonthly" ADD CONSTRAINT "StorageUsageMonthly_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
