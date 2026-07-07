# FieldCore Enterprise Readiness Task

These tasks assume the current codebase is the uploaded `FieldCore_Software(52).zip` project: Node/Express, Prisma/PostgreSQL, static HTML/CSS/JS UI, JWT auth, multi-tenant company scoping, existing assets/contracts, inventory/purchasing, finance localization, offline worker sync foundation, branches, approvals, reports, notifications, integrations, and SaaS billing foundations.

General rules for Codex:

- Work on one task file at a time.
- Do not remove or weaken existing features.
- Preserve company-level tenant isolation. Never trust client-provided `companyId`.
- Keep existing static UI patterns unless explicitly asked to redesign.
- Add Prisma migrations for schema changes.
- Add/extend seed data so manual QA has realistic enterprise examples.
- Add/extend automated tests in `test/api.security.test.js` or new test files.
- Run `npm run build` and `npm test` before marking the task complete.
- Update `README.md`, `BACKEND.md`, and relevant docs when behavior changes.
- Any live third-party integration must be disabled safely unless env vars are configured.
- Do not claim real provider sync/payment works unless the provider call, webhook handling, retry behavior, audit logs, and tests exist.

## TASK12 — Enterprise inventory, procurement, supplier, and job-costing depth

## Commercial reason

Electrical, HVAC, refrigeration, fire, solar, and security buyers often care about parts availability, purchasing control, stock movement, and job profitability. Basic inventory is not enough for mid-market operations.

## Objective

Upgrade the inventory/purchasing foundation into a serious operational control layer tied to jobs, assets, branches, suppliers, approvals, and profitability.

## Existing foundation to build on

- `Supplier`
- `StockLocation`
- `InventoryItem`
- `InventoryStock`
- `StockMovement`
- `JobPartUsage`
- `PurchaseRequest`
- `PurchaseOrder`
- `PurchaseOrderLine`
- `Branch`
- `Job`
- `Invoice`
- `ApprovalRequest`
- `inventory.html`
- `purchase-requests.html`
- `purchase-orders.html`

## Required outcomes

### 1. Stock controls

Add:

- minimum stock level
- reorder point
- preferred supplier
- supplier lead time
- item category
- serialized item support for expensive equipment
- stock transfer between branches/vehicles/stores
- adjustment reason required
- approval for high-value adjustment

### 2. Technician vehicle stock

Treat worker vehicles as stock locations:

- assign stock to worker/vehicle
- technician can consume stock on job
- technician can request replenishment
- admin can see vehicle stock
- transfer stock from branch store to vehicle

### 3. Purchase request workflow

Improve PR flow:

- request parts from job
- request parts from low-stock alert
- branch manager approval
- convert approved request to PO
- reject request with reason
- link PR/PO to job/asset/contract

### 4. Purchase order lifecycle

Support:

- draft
- approval required above threshold
- sent
- partially received
- received
- cancelled
- supplier invoice reference
- expected delivery date
- received quantities
- backorder quantity

### 5. Job costing

For each job, calculate:

- quoted revenue
- invoiced revenue
- parts cost
- estimated labour cost placeholder
- travel cost placeholder
- gross margin estimate
- unbilled parts warning
- contract included vs billable parts

### 6. Inventory valuation

Reports should include:

- stock on hand value
- branch stock value
- slow-moving items
- low stock items
- stock adjustments
- parts used by job/customer/contract

### 7. Supplier performance

Track:

- on-time delivery
- average lead time
- cancelled POs
- partial deliveries
- spend by supplier

## Tests

Add tests for:

- stock cannot go negative unless company setting permits.
- stock transfer updates both locations.
- technician cannot consume stock from another vehicle/location.
- PR approval required above threshold.
- PO receipt increases stock.
- partial PO receipt works.
- job costing includes parts used.
- tenant isolation for inventory and suppliers.

## Manual QA

Seed:

- branch store
- technician van
- supplier
- low stock item
- job requiring parts
- purchase request
- purchase order
- partial receipt
- completed job with margin report

## Acceptance criteria

- FieldCore supports parts-heavy trades better than lightweight job apps.
- Inventory links directly to jobs, contracts, and profitability.
- Procurement has approval and audit controls.
