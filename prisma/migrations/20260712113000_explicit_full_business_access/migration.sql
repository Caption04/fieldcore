-- Subscription access must be an explicit company-wide grant.
ALTER TABLE "User"
ADD COLUMN "fullBusinessAccess" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "fullBusinessAccess" = true
WHERE "role" = 'OWNER';

UPDATE "User" AS u
SET "fullBusinessAccess" = true
FROM "MemberInvitation" AS invitation
WHERE invitation."acceptedByUserId" = u."id"
  AND invitation."status" = 'ACCEPTED'
  AND invitation."fullAccess" = true
  AND invitation."scopeType" = 'COMPANY';
