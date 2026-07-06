# TASK6.md

# FieldCore Commercial Readiness - TASK6: Offer-Specific Localization

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
phase_13f_offer_localization
```

---

# TASK6: Offer-Specific Localization

## Why This Matters

FieldCore cannot outbuild global platforms feature-for-feature yet.

It can win by feeling more local and practical for South Africa, Zimbabwe, and similar markets.

Localization should support:

```text
local tax labels
currency flexibility
local invoice expectations
WhatsApp-first communication
payment method flexibility
clean proof-of-work for disputes
simple onboarding language
country/timezone-aware scheduling
```

## Required Improvements

### Company Localization Settings

Add or extend settings for:

```text
country
timezone
defaultCurrency
allowedCurrencies
taxName
taxRate
dateFormat
numberFormat
invoicePrefix
receiptPrefix
quoteExpiryDays
paymentTermsDays
```

Use existing company/scheduling/finance settings where possible.

Do not duplicate settings unnecessarily.

### Currency and Tax Display

Ensure these areas respect company settings:

```text
quotes
invoices
receipts
reports
payments
client portal
public booking confirmation where money is shown
```

### Payment Method Flexibility

Support configurable payment methods without hardcoding one country.

Examples:

```text
cash
bank transfer
Paynow
PayFast
Yoco
Ozow
SnapScan
manual card
external payment link
custom manual method
```

Do not fake a live integration.

If credentials/provider code are not present, store external reference details manually.

### WhatsApp-First Communication

Preserve and extend existing notification systems where practical.

Do not break current email/WhatsApp provider abstractions.

Useful event templates:

```text
contract activated
maintenance visit due
SLA at risk
SLA breached
job proof ready
invoice overdue
payment received
purchase shortage blocking job
```

## Acceptance Criteria

This subphase is complete when:

```text
Company timezone/currency/tax settings are respected.
Quotes/invoices/receipts show correct local labels.
Payment method options are configurable.
WhatsApp/email notification templates exist for new high-value events.
No existing notification behavior is broken.
```

---

# Required Seed Data

Update `prisma/seed.js` carefully.

Add demo data for:

```text
1 branch
2 assets
1 active service contract
1 contract service line
1 job linked to an asset and contract
1 supplier
1 stock location
5 inventory items
1 low-stock item
1 purchase request
1 purchase order
1 finance settings record
1 worker device if useful
```

Seed data must not break existing demo login or tests.

---

# Required Tests

Add focused tests. Do not rely only on manual clicking.

Minimum test coverage:

```text
asset CRUD is company-scoped
service contract CRUD is company-scoped
job can link to asset/contract
worker can only view assets on assigned jobs
inventory stock adjustment creates StockMovement
job part usage deducts or records stock correctly
worker cannot record parts on another worker's job
purchase request approval flow works
finance settings update is company-scoped
CSV finance export is company-scoped
offline sync idempotency prevents duplicates
branch filter does not leak cross-company data
approval approve/reject flow works
```

If the current test structure makes full coverage too large, add at least one strong integration test per subphase.

---

# Required Manual QA Update

Update `MANUAL_QA_SIMULATION.md` with a new Phase 13 section.

Include manual checks for:

```text
create asset
create service contract
link asset to contract
link asset/contract to job
view asset history
create inventory item
adjust stock
reserve stock for job
worker records part used
worker reports shortage
admin creates purchase request
admin creates purchase order
receive purchase order
configure finance settings
export invoices CSV
register worker device
simulate duplicate sync action
create branch
filter reports by branch
approve/reject approval request
check client portal cannot see other customer data
check worker cannot see financial data
```

---

# Required Documentation Update

Update `README.md` or `BACKEND.md` with:

```text
new models summary
new endpoints summary
worker offline sync contract
finance export behavior
localization settings
manual provider/integration limitation
```

Do not claim live accounting integrations exist unless they are actually implemented.

Use honest wording:

```text
CSV export foundation implemented.
Provider configuration placeholder implemented.
Live Xero/Sage/QuickBooks sync not implemented yet.
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
npx prisma migrate dev --name phase_13f_offer_localization
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
