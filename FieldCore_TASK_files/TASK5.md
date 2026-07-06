# TASK5.md

# FieldCore Commercial Readiness - TASK5: Multi-Branch Controls, Approvals, and Deeper Reporting

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
phase_13e_branches_approvals_reports
```

---

# TASK5: Multi-Branch Controls, Approvals, and Deeper Reporting

## Why This Matters

Above $1k/month, buyers need management control.

They want to know:

```text
which branch is performing
which technicians are productive
which services are profitable
which invoices are aging
which jobs are breaching SLA
which approvals are waiting
where operational leakage is happening
```

## Required Data Models

### Branch

```text
id
companyId
name
code optional
country optional
city optional
address optional
timezone optional
active Boolean
createdAt
updatedAt
```

Add optional `branchId` to relevant models where practical:

```text
Customer
CustomerProperty
WorkerProfile
Job
Quote
Invoice
Payment
Receipt
Asset
ServiceContract
StockLocation
PurchaseRequest
PurchaseOrder
```

Do not make branch required for old data.

### ApprovalPolicy

```text
id
companyId
name
eventType
thresholdAmount optional
active Boolean
createdAt
updatedAt
```

Suggested event types:

```text
QUOTE_DISCOUNT
QUOTE_SEND
INVOICE_VOID
PAYMENT_REFUND
PURCHASE_ORDER_SEND
STOCK_ADJUSTMENT
JOB_RESCHEDULE
SLA_WAIVE
```

### ApprovalRequest

```text
id
companyId
policyId optional
requestedById
approvedById optional
entityType
entityId
eventType
status
reason optional
decisionNote optional
createdAt
decidedAt optional
updatedAt
```

Suggested statuses:

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

## Required API Endpoints

```text
GET    /branches
POST   /branches
PATCH  /branches/:id

GET    /approvals
GET    /approvals/pending
POST   /approvals/:id/approve
POST   /approvals/:id/reject

GET    /reports/branch-performance
GET    /reports/service-profitability
GET    /reports/technician-productivity
GET    /reports/sla-performance
GET    /reports/inventory-value
GET    /reports/purchase-spend
GET    /reports/accounts-receivable-aging
```

If the existing reporting service already has similar endpoints, extend it instead of creating duplicates.

## Required UI

Add or update:

```text
branches.html
approvals.html
reports.html
dashboard
jobs.html
invoices.html
inventory.html
purchase-orders.html
```

Minimum UI behavior:

```text
Admin can create branches.
Admin can assign workers/jobs/customers/assets/contracts to branches.
Core lists can filter by branch.
Dashboard can filter by branch.
Approvals page shows pending requests.
Reports show branch-level and company-level views.
```

## Acceptance Criteria

This subphase is complete when:

```text
Branch records exist and are company-scoped.
Jobs/workers/customers can optionally belong to a branch.
Reports can filter by branch.
Approval requests can be created, approved, and rejected.
Important approval decisions are audit logged.
Company isolation is tested.
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
npx prisma migrate dev --name phase_13e_branches_approvals_reports
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
