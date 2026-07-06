# TASK2.md

# FieldCore Commercial Readiness - TASK2: Inventory, Parts, and Purchase Workflow

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
phase_13b_inventory_purchasing
```

---

# TASK2: Inventory, Parts, and Purchase Workflow

## Why This Matters

Electrical, HVAC, fire, solar, refrigeration, and maintenance buyers need more than job scheduling.

They need to know:

```text
what parts are available
what parts were used
what parts are reserved
what parts are short
when purchasing is needed
which supplier is involved
whether stock movement is auditable
```

Without this, FieldCore will lose stronger mid-market buyers.

## Required Data Models

### Supplier

```text
id
companyId
name
email optional
phone optional
address optional
taxNumber optional
notes optional
active Boolean
createdAt
updatedAt
```

### StockLocation

Represents a warehouse, branch store, vehicle, or technician stock bag.

```text
id
companyId
branchId optional
name
type
address optional
workerId optional
active Boolean
createdAt
updatedAt
```

Suggested types:

```text
WAREHOUSE
BRANCH
VEHICLE
TECHNICIAN
OTHER
```

### InventoryItem

```text
id
companyId
sku optional
name
description optional
category optional
unitOfMeasure
unitCost optional
salePrice optional
reorderPoint optional
active Boolean
createdAt
updatedAt
```

### InventoryStock

Tracks quantity per item/location.

```text
id
companyId
itemId
locationId
quantityOnHand
quantityReserved
createdAt
updatedAt
```

### StockMovement

Auditable stock ledger.

```text
id
companyId
itemId
locationId
jobId optional
purchaseOrderId optional
movementType
quantity
unitCost optional
reason optional
createdById optional
createdAt
```

Suggested movement types:

```text
ADJUSTMENT_IN
ADJUSTMENT_OUT
RESERVED
RESERVATION_RELEASED
JOB_USED
JOB_RETURNED
PURCHASE_RECEIVED
TRANSFER_IN
TRANSFER_OUT
```

### JobPartUsage

Parts used or needed on a job.

```text
id
companyId
jobId
itemId
locationId optional
workerId optional
quantityPlanned optional
quantityUsed optional
unitCost optional
notes optional
status
createdAt
updatedAt
```

Suggested statuses:

```text
PLANNED
RESERVED
USED
SHORT
RETURNED
CANCELLED
```

### PurchaseRequest

```text
id
companyId
requestedById optional
jobId optional
status
reason optional
createdAt
updatedAt
```

Suggested statuses:

```text
DRAFT
REQUESTED
APPROVED
REJECTED
ORDERED
CLOSED
```

### PurchaseOrder and PurchaseOrderLine

```text
PurchaseOrder:
id
companyId
supplierId optional
purchaseRequestId optional
status
orderNumber
expectedAt optional
receivedAt optional
notes optional
createdAt
updatedAt

PurchaseOrderLine:
id
companyId
purchaseOrderId
itemId
quantity
unitCost optional
receivedQuantity
createdAt
updatedAt
```

Suggested PO statuses:

```text
DRAFT
SENT
PARTIALLY_RECEIVED
RECEIVED
CANCELLED
```

## Required API Endpoints

Owner/admin endpoints:

```text
GET    /suppliers
POST   /suppliers
PATCH  /suppliers/:id

GET    /stock-locations
POST   /stock-locations
PATCH  /stock-locations/:id

GET    /inventory/items
POST   /inventory/items
GET    /inventory/items/:id
PATCH  /inventory/items/:id
GET    /inventory/items/:id/stock
GET    /inventory/low-stock

POST   /inventory/adjustments
POST   /inventory/transfers
GET    /inventory/movements

GET    /jobs/:id/parts
POST   /jobs/:id/parts
PATCH  /jobs/:id/parts/:partId
DELETE /jobs/:id/parts/:partId
POST   /jobs/:id/parts/:partId/reserve
POST   /jobs/:id/parts/:partId/use
POST   /jobs/:id/parts/:partId/return

GET    /purchase-requests
POST   /purchase-requests
PATCH  /purchase-requests/:id
POST   /purchase-requests/:id/approve
POST   /purchase-requests/:id/reject

GET    /purchase-orders
POST   /purchase-orders
GET    /purchase-orders/:id
PATCH  /purchase-orders/:id
POST   /purchase-orders/:id/send
POST   /purchase-orders/:id/receive
POST   /purchase-orders/:id/cancel
```

Worker endpoints:

```text
GET  /worker/jobs/:id/parts
POST /worker/jobs/:id/parts-used
POST /worker/jobs/:id/part-shortage
```

Workers can record usage and shortages only for assigned jobs.

Workers must not see supplier pricing unless explicitly needed.

## Required UI

Add or update:

```text
inventory.html
purchase-requests.html
purchase-orders.html
jobs.html
worker job screen / jobs.html worker view if applicable
reports.html
```

Minimum UI behavior:

```text
Admins can create inventory items.
Admins can create stock locations.
Admins can adjust stock with a reason.
Admins can see low-stock items.
Admins can add planned parts to a job.
Admins can reserve stock for a job.
Workers can record parts used on assigned jobs.
Workers can report shortages.
Admins can turn shortages into purchase requests.
Admins can create purchase orders.
Admins can receive purchase orders and increase stock.
Stock movements are visible and auditable.
```

## Acceptance Criteria

This subphase is complete when:

```text
A job can have planned parts.
Stock can be reserved for a job.
Stock can be deducted when parts are marked used.
Shortage can be recorded by a worker.
Shortage can create a purchase request.
Purchase order receiving increases stock.
All stock changes create StockMovement records.
Company isolation is tested.
Worker restrictions are tested.
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
npx prisma migrate dev --name phase_13b_inventory_purchasing
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
