-- AlterTable
ALTER TABLE "CompanySecuritySettings" ADD COLUMN     "auditLogRetentionDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN     "deletedCustomerPolicyNotes" TEXT,
ADD COLUMN     "failedLoginLockoutThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "inactiveUserDisableDays" INTEGER,
ADD COLUMN     "lockoutDurationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "notificationLogRetentionDays" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "proofPhotoRetentionDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN     "requirePasswordResetOnInvite" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 120;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "mustResetPassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorRecoveryCodes" JSONB,
ADD COLUMN     "twoFactorSecretHash" TEXT;

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityProviderConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "issuerUrl" TEXT,
    "clientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "scopes" JSONB,
    "config" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSession_companyId_userId_idx" ON "UserSession"("companyId", "userId");

-- CreateIndex
CREATE INDEX "UserSession_companyId_revokedAt_idx" ON "UserSession"("companyId", "revokedAt");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "IdentityProviderConfig_companyId_providerType_idx" ON "IdentityProviderConfig"("companyId", "providerType");

-- CreateIndex
CREATE INDEX "IdentityProviderConfig_companyId_status_idx" ON "IdentityProviderConfig"("companyId", "status");

-- CreateIndex
CREATE INDEX "SecurityEvent_companyId_createdAt_idx" ON "SecurityEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_companyId_eventType_idx" ON "SecurityEvent"("companyId", "eventType");

-- CreateIndex
CREATE INDEX "SecurityEvent_companyId_severity_idx" ON "SecurityEvent"("companyId", "severity");

-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

-- CreateIndex
CREATE INDEX "User_companyId_lockedUntil_idx" ON "User"("companyId", "lockedUntil");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityProviderConfig" ADD CONSTRAINT "IdentityProviderConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
