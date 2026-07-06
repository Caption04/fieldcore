-- CreateEnum
CREATE TYPE "OfflineActionStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "OfflineActionType" AS ENUM ('JOB_ARRIVE', 'JOB_START', 'JOB_PAUSE', 'JOB_RESUME', 'JOB_COMPLETE', 'JOB_NOTE', 'PROOF_PHOTO_UPLOADED', 'SIGNATURE_CAPTURED', 'LOCATION_CAPTURED', 'PART_USED', 'PART_SHORTAGE');

-- AlterTable
ALTER TABLE "JobActivity" ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "offlineCreatedAt" TIMESTAMP(3),
ADD COLUMN     "syncId" TEXT;

-- AlterTable
ALTER TABLE "JobCompletionLocation" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "offlineCreatedAt" TIMESTAMP(3),
ADD COLUMN     "syncId" TEXT;

-- AlterTable
ALTER TABLE "JobProofPhoto" ADD COLUMN     "accuracy" DOUBLE PRECISION,
ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "offlineCreatedAt" TIMESTAMP(3),
ADD COLUMN     "syncId" TEXT;

-- AlterTable
ALTER TABLE "JobSignature" ADD COLUMN     "accuracy" DOUBLE PRECISION,
ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "offlineCreatedAt" TIMESTAMP(3),
ADD COLUMN     "syncId" TEXT;

-- CreateTable
CREATE TABLE "WorkerDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineActionQueue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workerDeviceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "actionType" "OfflineActionType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OfflineActionStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineActionQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerDevice_companyId_workerId_idx" ON "WorkerDevice"("companyId", "workerId");

-- CreateIndex
CREATE INDEX "WorkerDevice_companyId_userId_idx" ON "WorkerDevice"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerDevice_companyId_deviceId_key" ON "WorkerDevice"("companyId", "deviceId");

-- CreateIndex
CREATE INDEX "OfflineActionQueue_companyId_workerId_receivedAt_idx" ON "OfflineActionQueue"("companyId", "workerId", "receivedAt");

-- CreateIndex
CREATE INDEX "OfflineActionQueue_companyId_status_idx" ON "OfflineActionQueue"("companyId", "status");

-- CreateIndex
CREATE INDEX "OfflineActionQueue_companyId_actionType_idx" ON "OfflineActionQueue"("companyId", "actionType");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineActionQueue_companyId_idempotencyKey_key" ON "OfflineActionQueue"("companyId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "WorkerDevice" ADD CONSTRAINT "WorkerDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDevice" ADD CONSTRAINT "WorkerDevice_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDevice" ADD CONSTRAINT "WorkerDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineActionQueue" ADD CONSTRAINT "OfflineActionQueue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineActionQueue" ADD CONSTRAINT "OfflineActionQueue_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineActionQueue" ADD CONSTRAINT "OfflineActionQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineActionQueue" ADD CONSTRAINT "OfflineActionQueue_workerDeviceId_fkey" FOREIGN KEY ("workerDeviceId") REFERENCES "WorkerDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
