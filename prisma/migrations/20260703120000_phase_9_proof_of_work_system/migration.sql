CREATE TYPE "ProofPhotoCategory" AS ENUM ('BEFORE', 'AFTER', 'GENERAL', 'DAMAGE', 'ISSUE', 'EXTRA_WORK', 'CUSTOMER_APPROVAL');

ALTER TYPE "JobActivityType" ADD VALUE 'COMPLETION_LOCATION_CAPTURED';

ALTER TABLE "Job" ADD COLUMN "completedById" TEXT;
ALTER TABLE "Job" ADD COLUMN "requiresBeforePhotos" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "requiresAfterPhotos" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "requiresLocation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CompanySchedulingSettings" ADD COLUMN "requireBeforePhotos" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanySchedulingSettings" ADD COLUMN "requireAfterPhotos" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanySchedulingSettings" ADD COLUMN "requireLocation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "JobProofPhoto" ADD COLUMN "category" "ProofPhotoCategory" NOT NULL DEFAULT 'GENERAL';

CREATE TABLE "JobCompletionLocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "capturedById" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "source" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCompletionLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobCompletionLocation_jobId_key" ON "JobCompletionLocation"("jobId");
CREATE INDEX "JobCompletionLocation_companyId_jobId_idx" ON "JobCompletionLocation"("companyId", "jobId");
CREATE INDEX "JobCompletionLocation_companyId_capturedById_idx" ON "JobCompletionLocation"("companyId", "capturedById");

ALTER TABLE "Job" ADD CONSTRAINT "Job_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobCompletionLocation" ADD CONSTRAINT "JobCompletionLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobCompletionLocation" ADD CONSTRAINT "JobCompletionLocation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobCompletionLocation" ADD CONSTRAINT "JobCompletionLocation_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
