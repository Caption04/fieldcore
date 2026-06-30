-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "roleId" TEXT;

-- CreateTable
CREATE TABLE "WorkerRole" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAvailability" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerRole_companyId_idx" ON "WorkerRole"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerRole_companyId_name_key" ON "WorkerRole"("companyId", "name");

-- CreateIndex
CREATE INDEX "RoleAvailability_companyId_roleId_dayOfWeek_idx" ON "RoleAvailability"("companyId", "roleId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "WorkerProfile_companyId_roleId_idx" ON "WorkerProfile"("companyId", "roleId");

-- AddForeignKey
ALTER TABLE "WorkerRole" ADD CONSTRAINT "WorkerRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkerRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAvailability" ADD CONSTRAINT "RoleAvailability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAvailability" ADD CONSTRAINT "RoleAvailability_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkerRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
