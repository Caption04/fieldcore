ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'PROOF_PHOTO_ADDED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'PROOF_PHOTO_REMOVED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'SIGNATURE_ADDED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'SIGNATURE_REMOVED';

ALTER TABLE "Job"
ADD COLUMN "requiresProofPhotos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "minimumProofPhotos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "requiresSignature" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "proofCompletedAt" TIMESTAMP(3),
ADD COLUMN "signatureCompletedAt" TIMESTAMP(3);

CREATE TABLE "JobProofPhoto" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workerId" TEXT,
    "uploadedById" TEXT,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobProofPhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobSignature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "capturedById" TEXT,
    "signerName" TEXT,
    "signatureUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSignature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobSignature_jobId_key" ON "JobSignature"("jobId");
CREATE INDEX "JobProofPhoto_companyId_jobId_idx" ON "JobProofPhoto"("companyId", "jobId");
CREATE INDEX "JobProofPhoto_companyId_workerId_idx" ON "JobProofPhoto"("companyId", "workerId");
CREATE INDEX "JobProofPhoto_companyId_uploadedById_idx" ON "JobProofPhoto"("companyId", "uploadedById");
CREATE INDEX "JobSignature_companyId_jobId_idx" ON "JobSignature"("companyId", "jobId");
CREATE INDEX "JobSignature_companyId_capturedById_idx" ON "JobSignature"("companyId", "capturedById");

ALTER TABLE "JobProofPhoto" ADD CONSTRAINT "JobProofPhoto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobProofPhoto" ADD CONSTRAINT "JobProofPhoto_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobProofPhoto" ADD CONSTRAINT "JobProofPhoto_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobProofPhoto" ADD CONSTRAINT "JobProofPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobSignature" ADD CONSTRAINT "JobSignature_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobSignature" ADD CONSTRAINT "JobSignature_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobSignature" ADD CONSTRAINT "JobSignature_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
