-- Provider refund identifiers are scoped to the tenant connection. PostgreSQL
-- permits multiple NULL values, preserving manual refunds without provider ids.
CREATE UNIQUE INDEX "PaymentRefund_companyId_providerConnectionId_providerRefundId_key"
  ON "PaymentRefund"("companyId", "providerConnectionId", "providerRefundId");
