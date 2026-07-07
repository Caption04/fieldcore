-- CreateTable
CREATE TABLE "CompanyImplementationSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "implementationMode" BOOLEAN NOT NULL DEFAULT true,
    "hideDemoData" BOOLEAN NOT NULL DEFAULT false,
    "resetAllowed" BOOLEAN NOT NULL DEFAULT true,
    "goLiveDate" TIMESTAMP(3),
    "implementationOwnerUserId" TEXT,
    "implementationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyImplementationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyOnboardingPackage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "onboardingFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "migrationFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "trainingPackage" TEXT,
    "implementationStatus" TEXT NOT NULL DEFAULT 'PLANNING',
    "goLiveChecklist" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyOnboardingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImportJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEWED',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "fileName" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB,
    "summary" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DataImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImportRowError" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "rawRow" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataImportRowError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyImplementationSettings_companyId_key" ON "CompanyImplementationSettings"("companyId");

-- CreateIndex
CREATE INDEX "CompanyImplementationSettings_companyId_implementationMode_idx" ON "CompanyImplementationSettings"("companyId", "implementationMode");

-- CreateIndex
CREATE INDEX "CompanyOnboardingPackage_companyId_implementationStatus_idx" ON "CompanyOnboardingPackage"("companyId", "implementationStatus");

-- CreateIndex
CREATE INDEX "DataImportJob_companyId_importType_createdAt_idx" ON "DataImportJob"("companyId", "importType", "createdAt");

-- CreateIndex
CREATE INDEX "DataImportJob_companyId_status_idx" ON "DataImportJob"("companyId", "status");

-- CreateIndex
CREATE INDEX "DataImportRowError_companyId_importJobId_idx" ON "DataImportRowError"("companyId", "importJobId");

-- CreateIndex
CREATE INDEX "DataImportRowError_companyId_rowNumber_idx" ON "DataImportRowError"("companyId", "rowNumber");

-- AddForeignKey
ALTER TABLE "CompanyImplementationSettings" ADD CONSTRAINT "CompanyImplementationSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOnboardingPackage" ADD CONSTRAINT "CompanyOnboardingPackage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImportJob" ADD CONSTRAINT "DataImportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImportRowError" ADD CONSTRAINT "DataImportRowError_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImportRowError" ADD CONSTRAINT "DataImportRowError_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "DataImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
