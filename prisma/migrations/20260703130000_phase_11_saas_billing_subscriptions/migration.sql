-- Phase 11: SaaS billing and subscriptions.
CREATE TABLE "SaaSPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "limits" JSONB,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaaSPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanySubscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TRIALING',
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "providerCustomerId" TEXT,
    "providerSubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaaSBillingEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" TEXT,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(65,30),
    "currency" TEXT,
    "providerRef" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaaSBillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanySubscription_companyId_key" ON "CompanySubscription"("companyId");
CREATE INDEX "SaaSPlan_isActive_idx" ON "SaaSPlan"("isActive");
CREATE INDEX "CompanySubscription_companyId_status_idx" ON "CompanySubscription"("companyId", "status");
CREATE INDEX "CompanySubscription_planId_idx" ON "CompanySubscription"("planId");
CREATE INDEX "CompanySubscription_provider_providerSubId_idx" ON "CompanySubscription"("provider", "providerSubId");
CREATE INDEX "SaaSBillingEvent_companyId_createdAt_idx" ON "SaaSBillingEvent"("companyId", "createdAt");
CREATE INDEX "SaaSBillingEvent_companyId_eventType_providerRef_idx" ON "SaaSBillingEvent"("companyId", "eventType", "providerRef");

ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SaaSPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaaSBillingEvent" ADD CONSTRAINT "SaaSBillingEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaaSBillingEvent" ADD CONSTRAINT "SaaSBillingEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CompanySubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
