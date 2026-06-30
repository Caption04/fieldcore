INSERT INTO "WorkerRole" ("id", "companyId", "name", "active", "createdAt", "updatedAt")
SELECT 'role_' || md5(source."companyId" || ':' || source."name"), source."companyId", source."name", true, NOW(), NOW()
FROM (
  SELECT DISTINCT "companyId", btrim("title") AS "name"
  FROM "WorkerProfile"
  WHERE "title" IS NOT NULL AND btrim("title") <> ''
) AS source
ON CONFLICT ("companyId", "name") DO NOTHING;

UPDATE "WorkerProfile" AS worker
SET "roleId" = role."id"
FROM "WorkerRole" AS role
WHERE worker."companyId" = role."companyId"
  AND btrim(worker."title") = role."name"
  AND worker."roleId" IS NULL;