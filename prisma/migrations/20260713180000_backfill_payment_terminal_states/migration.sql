-- The exact marker below was written by the previous provider update flow and
-- is the only legacy dispute representation safe enough to convert.
UPDATE "Payment"
SET "status" = 'DISPUTED'
WHERE "status" = 'FAILED'
  AND "notes" = 'Payment disputed with provider';

UPDATE "PaymentLink" AS link
SET "status" = 'DISPUTED'
FROM "Payment" AS payment
WHERE payment."paymentLinkId" = link."id"
  AND payment."companyId" = link."companyId"
  AND payment."status" = 'DISPUTED'
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" AS other
    WHERE other."paymentLinkId" = link."id"
      AND other."id" <> payment."id"
  );

UPDATE "PaymentLink" AS link
SET "status" = 'REFUNDED'
FROM "Payment" AS payment
WHERE payment."paymentLinkId" = link."id"
  AND payment."companyId" = link."companyId"
  AND payment."status" = 'REFUNDED'
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" AS other
    WHERE other."paymentLinkId" = link."id"
      AND other."id" <> payment."id"
  );
