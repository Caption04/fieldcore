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

## TASK15 — Advanced dispatch, capacity planning, routing, and scheduling intelligence

## Commercial reason

Scheduling and technician utilization are core field-service pain points. Enterprise buyers pay when the system reduces wasted field time, missed appointments, travel chaos, and manual dispatch decisions.

## Objective

Upgrade scheduling from basic records into a manager-grade dispatch and capacity planning layer.

## Existing foundation to build on

- `ScheduleItem`
- `ScheduleStatus`
- `ScheduleConflict`
- `ScheduleConflictType`
- `CompanySchedulingSettings`
- `WorkerAvailability`
- `RoleAvailability`
- `WorkerTimeOff`
- `WorkerLocation`
- `Job`
- `Branch`
- `map.html`
- `schedule.html`

## Required outcomes

### 1. Dispatch board

Create an improved dispatch view:

- jobs by date/status
- unscheduled jobs
- technicians/workers by availability
- branch filter
- conflict badges
- SLA risk badges
- drag/drop optional if simple; otherwise action buttons are fine
- assign/reassign worker/team

### 2. Capacity planning

Show:

- available technician hours by day
- scheduled hours
- overbooked days
- branch capacity
- role-based capacity
- upcoming time off
- unassigned jobs

### 3. Smart assignment suggestions

Create simple rules-based suggestions first:

- worker role match
- branch match
- availability
- distance from last known location if available
- current workload
- SLA urgency
- required parts availability if TASK12 data exists

Return ranked suggestions with explanation, not black-box AI.

### 4. Route planning foundation

Do not overpromise full Google Maps optimization unless API configured.

Add:

- job/site coordinates where available
- worker last location
- route sequence field
- travel time placeholder/manual estimate
- provider-ready interface for future Google Maps/Mapbox
- route print/export view

### 5. Conflict handling

Improve conflict detection:

- worker double-booked
- outside availability
- branch mismatch
- time off overlap
- missing required role
- SLA risk
- required parts unavailable

Allow manager to resolve or override with approval for serious conflicts.

### 6. Customer appointment windows

Support:

- customer preferred date/time window
- confirmed appointment window
- technician ETA update foundation
- customer notification template for appointment confirmed / technician en route / delay

### 7. Schedule performance reporting

Report:

- on-time jobs
- rescheduled jobs
- cancelled jobs
- average delay
- utilization estimate
- conflict count
- SLA scheduling risk

## Tests

Add tests for:

- double-booking conflict created.
- time-off conflict created.
- branch mismatch conflict created.
- smart suggestions exclude unavailable worker.
- branch-scoped user only sees own branch schedule.
- route provider disabled safely without env vars.
- appointment notifications respect template settings.

## Manual QA

Seed:

- 3 branches
- 8 technicians
- time-off records
- overlapping jobs
- urgent SLA job
- job with missing parts
- customer appointment window

Verify dispatch board makes conflicts obvious.

## Acceptance criteria

- Managers can schedule with confidence.
- System recommends practical worker assignments.
- Conflicts are detected before dispatch.
- Routing is provider-ready but not falsely claimed as full optimization.
