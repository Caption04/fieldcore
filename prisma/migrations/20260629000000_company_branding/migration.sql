-- AlterTable
ALTER TABLE "Company" ADD COLUMN "legalName" TEXT;
ALTER TABLE "Company" ADD COLUMN "tradingName" TEXT;
ALTER TABLE "Company" ADD COLUMN "registrationNumber" TEXT;
ALTER TABLE "Company" ADD COLUMN "taxNumber" TEXT;
ALTER TABLE "Company" ADD COLUMN "address" TEXT;
ALTER TABLE "Company" ADD COLUMN "phone" TEXT;
ALTER TABLE "Company" ADD COLUMN "email" TEXT;

-- CreateTable
CREATE TABLE "CompanyBranding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "brandName" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "websiteUrl" TEXT,
    "invoiceFooter" TEXT,
    "invoiceTerms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBranding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBranding_companyId_key" ON "CompanyBranding"("companyId");

-- CreateIndex
CREATE INDEX "CompanyBranding_companyId_idx" ON "CompanyBranding"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyBranding" ADD CONSTRAINT "CompanyBranding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
