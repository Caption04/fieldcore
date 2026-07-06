# TASK1.md

# FieldCore Commercial Readiness - TASK1: Asset and Service Contract Management

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
phase_13a_assets_contracts
```

---

# TASK1: Asset and Service Contract Management

## Why This Matters

Mid-market buyers do not only care about isolated jobs.

They care about:

```text
asset history
maintenance schedules
warranties
service contracts
contract entitlements
SLA timers
recurring compliance
proof that agreed maintenance was done
```

Without this layer, FieldCore feels like a job tracker. With this layer, it starts feeling like a real field-service operations platform.

## Required Data Models

Add models similar to the following. Adjust field names to match existing project style.

### Asset

Tracks equipment, systems, or serviceable things owned by a customer.

Minimum fields:

```text
id
companyId
customerId
propertyId optional
serviceId optional
name
assetType
assetTag optional
serialNumber optional
manufacturer optional
modelNumber optional
locationLabel optional
installedAt optional
warrantyStartAt optional
warrantyEndAt optional
status
notes optional
customFields Json optional
createdAt
updatedAt
```

Suggested statuses:

```text
ACTIVE
INACTIVE
UNDER_REPAIR
RETIRED
```

Examples:

```text
Solar inverter
Rooftop PV array
HVAC unit
Fire alarm panel
CCTV recorder
Access control gate motor
Generator
Compressor
Cold room
Water pump
```

### JobAsset

Join table between jobs and assets.

Minimum fields:

```text
id
companyId
jobId
assetId
primaryAsset Boolean
notes optional
createdAt
```

A job may involve many assets.

An asset may have many jobs.

### ServiceContract

Tracks a customer's service relationship.

Minimum fields:

```text
id
companyId
customerId
propertyId optional
contractNumber
name
status
startDate
endDate optional
currency
contractValue optional
billingInterval optional
responseSlaHours optional
completionSlaHours optional
includedVisits optional
notes optional
createdAt
updatedAt
```

Suggested statuses:

```text
DRAFT
ACTIVE
SUSPENDED
EXPIRED
CANCELLED
```

### ServiceContractAsset

Links contracts to covered assets.

Minimum fields:

```text
id
companyId
contractId
assetId
createdAt
```

### ContractServiceLine

Defines recurring services or entitlements inside a contract.

Minimum fields:

```text
id
companyId
contractId
serviceId optional
title
frequency
interval
visitsPerPeriod optional
nextDueAt optional
lastGeneratedJobAt optional
defaultDurationMinutes optional
requiresProofPhotos Boolean
requiresSignature Boolean
requiresLocation Boolean
notes optional
createdAt
updatedAt
```

Reuse the existing recurring frequency enum if practical.

### SLA Fields on Job

Add optional fields to `Job`:

```text
contractId optional
responseDueAt optional
completionDueAt optional
slaStatus optional
slaBreachedAt optional
```

Suggested SLA statuses:

```text
NOT_APPLICABLE
ON_TRACK
AT_RISK
BREACHED
MET
WAIVED
```

Do not force SLA onto every job.

## Required API Endpoints

Add owner/admin endpoints:

```text
GET    /assets
POST   /assets
GET    /assets/:id
PATCH  /assets/:id
DELETE /assets/:id or POST /assets/:id/retire
GET    /assets/:id/history

GET    /service-contracts
POST   /service-contracts
GET    /service-contracts/:id
PATCH  /service-contracts/:id
POST   /service-contracts/:id/activate
POST   /service-contracts/:id/suspend
POST   /service-contracts/:id/cancel
GET    /service-contracts/:id/assets
POST   /service-contracts/:id/assets
DELETE /service-contracts/:id/assets/:assetId
GET    /service-contracts/:id/service-lines
POST   /service-contracts/:id/service-lines
PATCH  /service-contracts/:id/service-lines/:lineId
DELETE /service-contracts/:id/service-lines/:lineId
POST   /service-contracts/:id/preview-jobs
POST   /service-contracts/:id/generate-due-jobs

GET    /jobs/:id/assets
POST   /jobs/:id/assets
DELETE /jobs/:id/assets/:assetId
```

Worker endpoints:

```text
GET /worker/jobs/:id/assets
```

Workers may view assets linked to their assigned jobs, but not the full asset database.

Client portal endpoints:

```text
GET /client/assets
GET /client/assets/:id
GET /client/service-contracts
GET /client/service-contracts/:id
```

Client access must only show records linked to that client's customer account.

## Required UI

Add or update pages:

```text
assets.html
service-contracts.html
customers.html
jobs.html
schedule.html
client-portal.html
reports.html
```

Minimum UI behavior:

```text
Admins can create/edit assets.
Admins can link assets to customers and properties.
Admins can create/edit service contracts.
Admins can link assets to contracts.
Admins can link assets/contracts to jobs.
Asset detail page shows job history, proof history, invoices if connected, and warranty status.
Contract detail page shows active assets, service lines, upcoming due work, SLA settings, and contract status.
Job page shows linked asset(s), contract, and SLA status.
Schedule page highlights SLA-at-risk or SLA-breached jobs.
Client portal can show customer asset/service history safely.
```

## Acceptance Criteria

This subphase is complete when:

```text
An admin can create an asset for a customer.
An admin can create a service contract for a customer.
An admin can add a serviceable asset to that contract.
An admin can link a job to an asset and contract.
The asset history shows linked jobs.
A contract can show upcoming due work.
SLA due times can be stored and shown on jobs.
Workers can see linked assets only for their assigned jobs.
Client users can see only their own linked assets/contracts.
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
npx prisma migrate dev --name phase_13a_assets_contracts
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
