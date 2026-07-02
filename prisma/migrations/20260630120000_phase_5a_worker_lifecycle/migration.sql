ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'DISPATCHED';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'ARRIVED';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

CREATE TYPE "JobActivityType" AS ENUM ('ASSIGNED', 'ARRIVED', 'STARTED', 'PAUSED', 'RESUMED', 'COMPLETED', 'ADMIN_NOTE', 'STATUS_CHANGED');

ALTER TABLE "Job"
ADD COLUMN "arrivedAt" TIMESTAMP(3),
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "resumedAt" TIMESTAMP(3);

CREATE TABLE "JobActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workerId" TEXT,
    "userId" TEXT,
    "type" "JobActivityType" NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobActivity_companyId_jobId_createdAt_idx" ON "JobActivity"("companyId", "jobId", "createdAt");
CREATE INDEX "JobActivity_companyId_workerId_createdAt_idx" ON "JobActivity"("companyId", "workerId", "createdAt");

ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
