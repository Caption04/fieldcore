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

## TASK13 — Executive dashboards, enterprise analytics, and revenue leakage reporting

## Commercial reason

Enterprise buyers do not buy raw records. They buy visibility. FieldCore needs dashboards that make owners, operations managers, and finance managers see leakage, delays, productivity, cash, SLA risk, and branch performance.

## Objective

Build management dashboards and analytics screens from the existing reporting foundation.

## Existing foundation to build on

- `src/services/reporting.service.js`
- `reports.html`
- invoices/payments/jobs/quotes/schedules/workers/assets/contracts/branches/inventory models
- approval and audit logs

## Required outcomes

### 1. Executive overview dashboard

Add dashboard cards:

- MTD revenue
- outstanding invoices
- overdue invoices
- completed jobs
- jobs at risk
- SLA breaches
- technician utilization
- quote acceptance rate
- average quote-to-cash days
- proof missing count
- pending approvals
- low-stock critical items

### 2. Branch performance dashboard

For each branch:

- revenue
- completed jobs
- overdue jobs
- SLA breaches
- invoice aging
- worker productivity
- stock value
- pending approvals

### 3. Technician productivity dashboard

Metrics:

- jobs completed
- average job duration
- on-time arrival percentage if schedule data supports it
- proof completion rate
- rework count placeholder
- customer signature capture rate
- parts used
- idle/available time placeholder

### 4. Quote-to-cash dashboard

Show funnel:

- booking request
- quote sent
- quote accepted
- job scheduled
- job completed
- invoice issued
- payment collected

Metrics:

- conversion rate
- average days per stage
- stuck deals/jobs
- lost revenue estimate

### 5. Contract/SLA dashboard

Show:

- active contracts
- expiring contracts
- overdue planned maintenance
- SLA at risk
- SLA breached
- contract profitability
- renewal value

### 6. Inventory/procurement dashboard

Show:

- low stock
- stock value
- pending purchase requests
- open purchase orders
- supplier delays
- parts cost by job/contract

### 7. Export and scheduled reports

Support:

- CSV export per report
- PDF-ready print view if simple
- scheduled email report foundation
- role/permission restrictions for sensitive reports

### 8. UI expectations

Keep simple static pages, but make them useful:

- filters: date range, branch, worker, customer, contract
- clear empty states
- clear definitions/tooltips for key metrics
- avoid misleading metrics if data is incomplete

## Tests

Add tests for:

- reports are company-scoped.
- branch filters only show permitted branches.
- worker cannot access executive reports.
- quote-to-cash metrics calculate correctly from seeded data.
- overdue invoice aging buckets are correct.
- pending approval counts are correct.
- CSV export does not leak another tenant.

## Manual QA

Create seeded demo data with:

- multiple branches
- multiple technicians
- accepted/rejected quotes
- overdue invoices
- paid invoices
- SLA breach
- pending approvals
- low stock
- contracts

## Acceptance criteria

- A business owner can understand operational health in under 2 minutes.
- Dashboards support the $1,500/month Standard pitch.
- Reports expose cash leakage and service risk clearly.
