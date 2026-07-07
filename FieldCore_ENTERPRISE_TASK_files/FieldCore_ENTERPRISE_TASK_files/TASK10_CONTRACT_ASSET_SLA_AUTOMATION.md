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

## TASK11 — Contract, asset, warranty, SLA, and preventive maintenance automation

## Commercial reason

The PDF research identified asset and service contract management as the biggest gap for serious buyers. The current foundation exists, but enterprise value comes from automation: recurring maintenance, entitlements, SLA countdowns, asset history, warranty controls, and compliance reports.

## Objective

Turn asset/contracts from records into the engine that creates, tracks, and enforces recurring service obligations.

## Existing foundation to build on

- `Asset`
- `JobAsset`
- `ServiceContract`
- `ServiceContractAsset`
- `ContractServiceLine`
- `RecurringJobRule`
- `Job.sla*` fields
- `JobSlaStatus`
- `CustomerProperty`
- `ScheduleItem`
- notifications
- reports
- `assets.html`
- `service-contracts.html`

## Required outcomes

### 1. Asset service history

Each asset should have a complete timeline:

- install date
- warranty expiry
- linked contracts
- linked jobs
- proof photos
- parts used
- incidents/failures
- last serviced date
- next due date
- technician notes
- compliance documents/photos

### 2. Contract entitlement engine

Contracts should define:

- covered assets
- included services
- frequency
- included visits per period
- excluded services
- response time SLA
- completion SLA
- billable vs included work
- overage billing rules
- contract start/end/renewal
- cancellation rules

When creating a job for a contract customer, system should determine whether the job is included, billable, or overage.

### 3. Preventive maintenance scheduler

Add an engine to generate planned jobs from contracts:

- daily/weekly/monthly/quarterly/annual frequencies
- service windows
- blackout dates
- branch/region assignment
- preferred worker/team
- auto-create draft jobs ahead of due date
- admin review before dispatch if setting enabled

### 4. SLA countdowns and alerts

Implement SLA states:

- not started
- at risk
- breached
- waived with approval
- met

Trigger notifications:

- SLA approaching breach
- SLA breached
- contract job overdue
- asset service overdue

SLA waiver must require approval from TASK7.

### 5. Warranty handling

Assets need warranty logic:

- warranty start/end
- warranty provider
- warranty notes
- warranty claim job type
- flag if job is warranty-related
- prevent accidental billing if warranty included, unless overridden with approval

### 6. Contract profitability

Track contract economics:

- contract monthly value
- jobs delivered
- parts used
- labour time estimate/actual if available
- overdue service count
- SLA breach count
- margin estimate

### 7. Customer-facing contract portal

Client portal should show:

- covered sites/assets
- upcoming maintenance
- completed maintenance
- proof-of-work
- open issues
- SLA status where appropriate

## Tests

Add tests for:

- recurring contract creates planned job.
- entitlement marks job included vs billable.
- overage rule marks job billable.
- SLA at-risk/breach logic works.
- SLA waiver requires approval.
- warranty job does not bill accidentally without override.
- asset history only shows same-company records.
- contract profitability reports correct totals.

## Manual QA

Seed a realistic enterprise demo:

- one facilities contractor
- one retail-chain customer
- 10 sites
- 30 assets
- quarterly contract
- SLA response window
- planned maintenance jobs
- one breach
- one warranty job

## Acceptance criteria

- FieldCore can credibly manage recurring service relationships, not only one-off jobs.
- Contracts generate operational work.
- Assets have useful service history.
- SLA risk is visible before customers complain.
