-- CreateEnum
CREATE TYPE "TimeOffStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('SCHEDULED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "ScheduleConflictStatus" AS ENUM ('CLEAR', 'CONFLICT', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "ScheduleConflictType" AS ENUM ('OVERLAP', 'TIME_OFF', 'OUTSIDE_AVAILABILITY', 'OUTSIDE_WORKING_HOURS', 'INVALID_TIME', 'JOB_NOT_SCHEDULABLE');

-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "recurrenceRuleId" TEXT,
ADD COLUMN     "rescheduledFromId" TEXT,
ADD COLUMN     "travelBufferMinutes" INTEGER;

-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN     "conflictStatus" "ScheduleConflictStatus" NOT NULL DEFAULT 'CLEAR',
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN     "travelBufferMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "CompanySchedulingSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "defaultJobDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "defaultTravelBufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "allowOverbooking" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "workingDayStart" TEXT NOT NULL DEFAULT '08:00',
    "workingDayEnd" TEXT NOT NULL DEFAULT '17:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySchedulingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerAvailability" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerTimeOff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "TimeOffStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleConflict" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "conflictingJobId" TEXT,
    "conflictType" "ScheduleConflictType" NOT NULL,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringJobRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT,
    "workerId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "RecurringFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "preferredTime" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringJobRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanySchedulingSettings_companyId_key" ON "CompanySchedulingSettings"("companyId");

-- CreateIndex
CREATE INDEX "CompanySchedulingSettings_companyId_idx" ON "CompanySchedulingSettings"("companyId");

-- CreateIndex
CREATE INDEX "WorkerAvailability_companyId_workerId_dayOfWeek_idx" ON "WorkerAvailability"("companyId", "workerId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "WorkerTimeOff_companyId_workerId_startsAt_idx" ON "WorkerTimeOff"("companyId", "workerId", "startsAt");

-- CreateIndex
CREATE INDEX "ScheduleConflict_companyId_jobId_idx" ON "ScheduleConflict"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "ScheduleConflict_companyId_workerId_idx" ON "ScheduleConflict"("companyId", "workerId");

-- CreateIndex
CREATE INDEX "RecurringJobRule_companyId_nextRunAt_idx" ON "RecurringJobRule"("companyId", "nextRunAt");

-- CreateIndex
CREATE INDEX "ScheduleItem_companyId_workerId_startsAt_idx" ON "ScheduleItem"("companyId", "workerId", "startsAt");

-- CreateIndex
CREATE INDEX "ScheduleItem_companyId_jobId_idx" ON "ScheduleItem"("companyId", "jobId");

-- AddForeignKey
ALTER TABLE "CompanySchedulingSettings" ADD CONSTRAINT "CompanySchedulingSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAvailability" ADD CONSTRAINT "WorkerAvailability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAvailability" ADD CONSTRAINT "WorkerAvailability_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerTimeOff" ADD CONSTRAINT "WorkerTimeOff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerTimeOff" ADD CONSTRAINT "WorkerTimeOff_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJobRule" ADD CONSTRAINT "RecurringJobRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJobRule" ADD CONSTRAINT "RecurringJobRule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJobRule" ADD CONSTRAINT "RecurringJobRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJobRule" ADD CONSTRAINT "RecurringJobRule_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
