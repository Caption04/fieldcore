# TASK3.md

# FieldCore Commercial Readiness - TASK3: Accounting and Local-Finance Integration Foundation

## Read First

Read `AGENTS.md` before making changes.

Work only inside:

```bash
/home/kuhlinji/code/FieldCore_Software
```

Do not work inside OneDrive.

Do not inspect Codex attachment paths.

Do not read:

```text
C:\Users\USER\.codex\attachments
C:\Users\USER\OneDrive
C:\Windows
```

Do not request escalated access unless the user explicitly approves it.

Do not fight the shell. If a command fails because of quoting, escaping, redirection, or sandbox permissions, do not retry the same approach more than once. Use direct file edits/patches instead.

Do not run repeated full test/build loops after every small edit.

Use the smallest relevant checks while developing, then run the final checks once.

---

# Current Product Context

FieldCore already has the foundation of a field-service SaaS:

```text
multi-tenant company system
owner/admin/worker roles
customers
client accounts
customer properties
services
jobs
scheduling
worker availability
quotes
invoices
payments
receipts
proof-of-work photos
completion location
customer signature
notifications
public booking requests
client portal
SaaS billing/subscription foundation
reporting foundation
```

The product is good enough to start customer conversations, but it is not yet deep enough to feel like an obvious $500+/month mid-market product.

The commercial target is medium-to-large service businesses, especially:

```text
commercial electrical contractors
HVAC and refrigeration service companies
fire protection service companies
access control / CCTV / electronic security installers
solar O&M and backup power maintenance companies
facilities maintenance contractors
multi-site commercial service teams
```

The goal is to move FieldCore from a job workflow app into a real operations system.

---

# Big Goal

Add the features needed to make FieldCore defensible at $500/month and above.

The priority is value, not feature noise.

The new system must help mid-market service businesses reduce:

```text
lost job information
missed maintenance visits
weak asset history
SLA misses
slow invoicing
parts confusion
stock shortages
manual finance retyping
branch-level blind spots
field proof disputes
connectivity problems for technicians
```

Do not change SaaS pricing in this phase.

Ignore all existing in-code pricing assumptions unless a task directly requires internal test data.

Do not make FieldCore industry-specific to one built-in service category. Keep it configurable for multiple field-service industries.

---

# Non-Negotiable Rules

## Multi-Tenant Safety

Every new business record must include `companyId` unless it is truly global system metadata.

Every query must be scoped to the authenticated user's `companyId`.

Company A must never see Company B data.

## Role Safety

Allowed financial/management access:

```text
OWNER
ADMIN
```

Worker access must be limited to their own assigned operational work.

Workers must not see:

```text
company-wide revenue
customer list
all contracts
all inventory costs
supplier pricing
branch financial performance
other workers' private data
```

Client portal users must only see their own customer/client data.

Public users must not access authenticated business data.

## Audit Logs

Create audit logs for important actions related to this task.

Examples across the full commercial-readiness phase:

```text
asset created/updated/retired
contract created/activated/suspended/cancelled
SLA breach override
stock adjustment
part used on job
purchase request created/approved/rejected
purchase order created/received/cancelled
finance export/sync action
approval request approved/rejected
branch created/updated
localization settings changed
```

## Validation

Validate every write route with Zod.

Do not trust client-provided totals, company IDs, user IDs, branch IDs, or worker IDs.

## Existing UI

Do not redesign the whole app.

Keep the current HTML/CSS style.

Add practical pages/cards/tables using the existing design language.

---

# Task Order

Complete these files in order:

```text
TASK1.md - Asset and service contract management
TASK2.md - Inventory, parts, and purchase workflow
TASK3.md - Accounting/local finance settings and export foundation
TASK4.md - Offline-first technician API foundation
TASK5.md - Multi-branch controls, approvals, and deeper reporting
TASK6.md - Offer-specific localization
```

This file covers only the task named in its title.

Do not jump ahead into later tasks unless a tiny compatibility change is required to keep the app compiling.

Do not leave half-created schema models without routes/tests.

Do not leave UI buttons pointing to missing endpoints.

Do not break existing tests.

---


# Migration Name

If Prisma asks for a migration name, use:

```bash
phase_13c_finance_localization
```

---

# TASK3: Accounting and Local-Finance Integration Foundation

## Why This Matters

For South Africa and Zimbabwe, buyers will not want another isolated admin screen.

They need:

```text
clean VAT/tax settings
currency flexibility
invoice exports
payment exports
receipt exports
less retyping into accounting software
clean reconciliation
finance confidence
```

This phase does not need full live Xero/Sage/QuickBooks sync yet.

First build the safe foundation.

## Required Data Models

### CompanyFinanceSettings

```text
id
companyId unique
defaultCurrency
allowedCurrencies Json optional
taxName
taxRate
pricesIncludeTax Boolean
invoicePrefix optional
receiptPrefix optional
fiscalYearStartMonth optional
invoiceFooter optional
createdAt
updatedAt
```

Examples:

```text
South Africa: ZAR, VAT
Zimbabwe: USD/ZiG configurable, VAT/Tax configurable
International: any ISO currency code entered safely
```

Do not hardcode one country as the only market.

### FinanceIntegration

```text
id
companyId
provider
status
externalTenantId optional
lastSyncAt optional
config Json optional
createdAt
updatedAt
```

Suggested providers:

```text
MANUAL_CSV
XERO
QUICKBOOKS
SAGE
ZOHO_BOOKS
CUSTOM
```

Do not store provider secrets in plain text.

If OAuth/API keys are not implemented, keep integration records as configuration placeholders only.

### ExternalRecordLink

Maps FieldCore records to external accounting records.

```text
id
companyId
provider
localType
localId
externalId
lastSyncedAt optional
createdAt
updatedAt
```

### FinanceExportLog

```text
id
companyId
exportType
provider
status
fileName optional
recordCount
createdById optional
createdAt
error optional
```

## Required API Endpoints

```text
GET   /company/finance-settings
PATCH /company/finance-settings

GET   /finance/integrations
POST  /finance/integrations
PATCH /finance/integrations/:id
POST  /finance/integrations/:id/test

GET   /finance/export/invoices.csv
GET   /finance/export/payments.csv
GET   /finance/export/receipts.csv
GET   /finance/export/customers.csv
POST  /finance/export/mark-exported
GET   /finance/export-logs
```

CSV exports must include company-scoped data only.

## Required UI

Update:

```text
settings.html
invoices.html
payments/receipts area if separate
reports.html
```

Minimum UI behavior:

```text
Admin can set default currency.
Admin can set tax/VAT name and rate.
Invoices and quotes display the configured currency/tax label.
Admin can export invoices/payments/receipts/customers as CSV.
Export logs are visible.
```

## Acceptance Criteria

This subphase is complete when:

```text
A company can configure currency and tax settings.
Invoices/quotes use the configured currency/tax display.
Finance CSV exports work.
Finance exports are company-scoped.
Exports create export logs.
No provider secrets are returned to the frontend.
No live third-party integration is faked.
```

---

---

# Final Checks

Run these at the end of this task:

```bash
npx prisma validate
npm run build
npm test
```

If migrations were added, run:

```bash
npx prisma migrate dev --name phase_13c_finance_localization
```

For deployment-style validation:

```bash
npx prisma migrate deploy
```

Do not run endless repeated test loops.

If a check fails, fix the direct cause and rerun the smallest relevant check first.

---

# Done Means Done

This task is complete only when:

```text
The schema validates.
The app builds.
Tests pass.
New features are company-scoped.
Worker/client/public access is safe.
The task-specific acceptance criteria above are satisfied.
Manual QA notes are updated if relevant.
Docs are honest about what is and is not implemented.
```

---

# Important Product Judgment

Do not add these features as decorative CRUD screens.

Each feature must support the commercial reason FieldCore can charge $500/month and above:

```text
asset history makes maintenance relationships sticky
contracts make recurring revenue visible
SLA timers reduce operational risk
parts/inventory prevent job delays
purchase workflow closes stock gaps
finance exports reduce admin retyping
localization makes the product fit South Africa/Zimbabwe better than generic tools
offline sync makes field adoption realistic
branches/approvals/reports make managers trust the system
```

The product should feel like a serious operating system for mid-market field-service businesses, not a generic booking app.
