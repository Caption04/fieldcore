CREATE TYPE "OnboardingState" AS ENUM ('ACCOUNT_CREATED', 'PLAN_SELECTION_REQUIRED', 'PLAN_SELECTED', 'COMPLETED');
CREATE TYPE "AccessScopeType" AS ENUM ('COMPANY', 'BRANCH', 'TEAM', 'SELF');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

ALTER TABLE "Company"
  ADD COLUMN "market" TEXT,
  ADD COLUMN "verticalKey" TEXT NOT NULL DEFAULT 'generic',
  ADD COLUMN "teamSizeBand" TEXT,
  ADD COLUMN "onboardingState" "OnboardingState" NOT NULL DEFAULT 'COMPLETED';

ALTER TABLE "CompanySubscription"
  ADD COLUMN "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "PermissionRoleTemplate"
  DROP CONSTRAINT IF EXISTS "PermissionRoleTemplate_companyId_role_key";

ALTER TABLE "PermissionRoleTemplate"
  ADD COLUMN "key" TEXT,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "verticalKey" TEXT NOT NULL DEFAULT 'generic',
  ADD COLUMN "systemRole" "Role" NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "isSystemTemplate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defaultPermissions" JSONB,
  ADD COLUMN "defaultScopeType" "AccessScopeType" NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

UPDATE "PermissionRoleTemplate"
SET "key" = lower("role"::text),
    "name" = initcap(lower("role"::text)),
    "systemRole" = "role",
    "defaultPermissions" = "permissions";

ALTER TABLE "PermissionRoleTemplate"
  ALTER COLUMN "key" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "defaultPermissions" SET NOT NULL,
  DROP COLUMN "permissions",
  DROP COLUMN "role";

CREATE UNIQUE INDEX "PermissionRoleTemplate_companyId_key_verticalKey_key"
  ON "PermissionRoleTemplate"("companyId", "key", "verticalKey");
CREATE INDEX "PermissionRoleTemplate_companyId_active_idx"
  ON "PermissionRoleTemplate"("companyId", "active");
CREATE INDEX "PermissionRoleTemplate_verticalKey_isSystemTemplate_active_idx"
  ON "PermissionRoleTemplate"("verticalKey", "isSystemTemplate", "active");

ALTER TABLE "User"
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "roleTemplateId" TEXT,
  ADD COLUMN "defaultScopeType" "AccessScopeType" NOT NULL DEFAULT 'COMPANY';
ALTER TABLE "User" ADD CONSTRAINT "User_roleTemplateId_fkey"
  FOREIGN KEY ("roleTemplateId") REFERENCES "PermissionRoleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_companyId_roleTemplateId_idx" ON "User"("companyId", "roleTemplateId");

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Team" ADD CONSTRAINT "Team_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Team_companyId_name_key" ON "Team"("companyId", "name");
CREATE INDEX "Team_companyId_branchId_active_idx" ON "Team"("companyId", "branchId", "active");

CREATE TABLE "TeamMembership" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "isLead" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "TeamMembership_companyId_teamId_userId_key" ON "TeamMembership"("companyId", "teamId", "userId");
CREATE INDEX "TeamMembership_companyId_userId_active_idx" ON "TeamMembership"("companyId", "userId", "active");

CREATE TABLE "UserAccessGrant" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scopeType" "AccessScopeType" NOT NULL,
  "branchId" TEXT,
  "teamId" TEXT,
  "permissions" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserAccessGrant_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "UserAccessGrant_companyId_userId_active_idx" ON "UserAccessGrant"("companyId", "userId", "active");
CREATE INDEX "UserAccessGrant_companyId_branchId_active_idx" ON "UserAccessGrant"("companyId", "branchId", "active");
CREATE INDEX "UserAccessGrant_companyId_teamId_active_idx" ON "UserAccessGrant"("companyId", "teamId", "active");

CREATE TABLE "MemberInvitation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "acceptedByUserId" TEXT,
  "roleTemplateId" TEXT,
  "systemRole" "Role" NOT NULL DEFAULT 'ADMIN',
  "jobTitle" TEXT,
  "permissions" JSONB,
  "fullAccess" BOOLEAN NOT NULL DEFAULT false,
  "scopeType" "AccessScopeType" NOT NULL DEFAULT 'COMPANY',
  "scopeConfig" JSONB,
  "tokenHash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberInvitation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MemberInvitation" ADD CONSTRAINT "MemberInvitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberInvitation" ADD CONSTRAINT "MemberInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberInvitation" ADD CONSTRAINT "MemberInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemberInvitation" ADD CONSTRAINT "MemberInvitation_roleTemplateId_fkey" FOREIGN KEY ("roleTemplateId") REFERENCES "PermissionRoleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "MemberInvitation_tokenHash_key" ON "MemberInvitation"("tokenHash");
CREATE INDEX "MemberInvitation_companyId_email_status_idx" ON "MemberInvitation"("companyId", "email", "status");
CREATE INDEX "MemberInvitation_companyId_status_expiresAt_idx" ON "MemberInvitation"("companyId", "status", "expiresAt");

ALTER TABLE "Job" ADD COLUMN "teamId" TEXT;
ALTER TABLE "Job" ADD CONSTRAINT "Job_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Job_companyId_teamId_idx" ON "Job"("companyId", "teamId");
