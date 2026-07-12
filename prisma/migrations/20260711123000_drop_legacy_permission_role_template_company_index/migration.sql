-- Remove the legacy single-column company index left behind when
-- PermissionRoleTemplate moved to the newer role-template structure.
-- The current Prisma schema no longer declares this index.
DROP INDEX IF EXISTS "PermissionRoleTemplate_companyId_idx";
