CREATE TABLE "CompanySecuritySettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionLengthHours" INTEGER NOT NULL DEFAULT 8,
    "passwordMinimum" INTEGER NOT NULL DEFAULT 8,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySecuritySettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanySecuritySettings_companyId_key" ON "CompanySecuritySettings"("companyId");
CREATE INDEX "CompanySecuritySettings_companyId_idx" ON "CompanySecuritySettings"("companyId");

ALTER TABLE "CompanySecuritySettings"
ADD CONSTRAINT "CompanySecuritySettings_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
