-- Keep provider transaction data in separate nullable fields so existing links remain valid.
ALTER TABLE "PaymentProviderConnection"
  ADD COLUMN "signedResponseVerifiedAt" TIMESTAMP(3);

ALTER TABLE "PaymentLink"
  ADD COLUMN "providerPaymentId" TEXT,
  ADD COLUMN "pollUrl" TEXT,
  ADD COLUMN "merchantTrace" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "providerStatusMessage" TEXT,
  ADD COLUMN "providerIsTest" BOOLEAN,
  ADD COLUMN "lastProviderVerifiedAt" TIMESTAMP(3);

CREATE INDEX "PaymentLink_companyId_provider_providerPaymentId_idx"
  ON "PaymentLink"("companyId", "provider", "providerPaymentId");
CREATE INDEX "PaymentLink_companyId_provider_merchantTrace_idx"
  ON "PaymentLink"("companyId", "provider", "merchantTrace");

-- Existing rows may contain repeated legacy event ids. Preserve the first and
-- make the remainder unique before enforcing callback replay protection.
UPDATE "PaymentProviderEvent" AS event
SET "eventId" = event."eventId" || ':legacy:' || event."id"
WHERE event."eventId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "PaymentProviderEvent" AS earlier
    WHERE earlier."companyId" = event."companyId"
      AND earlier."provider" = event."provider"
      AND earlier."eventId" = event."eventId"
      AND earlier."id" < event."id"
  );

CREATE UNIQUE INDEX "PaymentProviderEvent_companyId_provider_eventId_key"
  ON "PaymentProviderEvent"("companyId", "provider", "eventId");

-- A payment link is one provider attempt and may create at most one original
-- payment. NULL legacy/manual rows remain unrestricted by PostgreSQL.
CREATE UNIQUE INDEX "Payment_companyId_paymentLinkId_key"
  ON "Payment"("companyId", "paymentLinkId");
