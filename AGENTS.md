# FieldCore Agent Instructions

## Project

FieldCore is a field-service SaaS system for businesses that manage:

* customers
* workers
* jobs
* schedules
* quotes
* invoices
* payments
* receipts
* company branding
* proof-of-work records

The system is multi-tenant. Multiple companies use the same software, but each company must only access its own data.

## Workspace Rules

Work only inside this repository:

```cmd
C:\Dev\FieldCore_Software
```

Do not read, inspect, or request access to files from:

```cmd
C:\Users\USER\.codex\attachments
C:\Users\USER\OneDrive
C:\Windows
```

Do not use absolute paths outside the repo.

Do not waste time trying to read Codex attachment paths. If task instructions are provided as an attachment and the attachment path is blocked, stop immediately and ask the user to place the instructions inside `TASK.md` in the repo root.

Preferred task workflow:

1. Read `AGENTS.md`.
2. Read `TASK.md` if it exists.
3. Work only inside the repo.
4. Use CMD-safe commands only.
5. Run the smallest relevant check.

If `TASK.md` does not exist, ask the user for the task in chat instead of trying to inspect Codex attachment folders.

## Sandbox / Permission Rule

If the sandbox blocks basic reads such as:

```cmd
dir
rg
cmd /c type
```

inside the repo, stop and report the issue clearly.

Do not repeatedly retry blocked reads.
Do not burn tokens requesting escalating access unless the user explicitly approves it.
Do not inspect protected folders to “figure it out.”

This is a tooling/sandbox issue, not a project code issue.

## Important UI Rule

Do not destroy the existing UI design.

The current HTML/CSS is the visual base. Improve the UI only where needed, and keep the same general style, spacing, colors, cards, buttons, and layout patterns.

Do not redesign the whole app unless explicitly instructed.

## Backend Standards

Use:

* Express
* PostgreSQL
* Prisma
* Zod
* JWT auth with secure cookies
* bcrypt for password hashing
* centralized error handling
* consistent JSON responses
* audit logs for important actions

Every business record must be scoped to `companyId`.

Never allow one company to access another company’s data.

Never return `passwordHash` in any API response.

Validate every write route with Zod.

## Roles

### OWNER

Full company access.

### ADMIN

Can manage:

* customers
* workers
* jobs
* schedules
* quotes
* invoices
* payments
* receipts
* settings
* branding

### WORKER

Can only access:

* their assigned jobs
* their own schedule
* their own operational actions
* their own location updates where applicable

Workers must not access:

* customers list
* quotes
* invoices
* payments
* receipts
* company financial data
* other workers’ private job data

## Current Completed Phases

Do not rebuild completed phases unless explicitly asked.

### Phase 1: Backend Foundation

Completed:

* Express backend
* PostgreSQL/Prisma
* auth
* roles
* company isolation
* seed data
* dashboard/list data

### Phase 2: White-label Branding

Completed:

* company profile
* branding
* logo upload
* invoice/quote branding context
* settings UI

### Phase 3: Money Engine

Completed:

* quotes
* quote line items
* quote send/accept/reject
* quote acceptance creates/links job
* invoices
* invoice line items
* safe invoice numbers
* payments
* receipts
* receipt UI

### Phase 4: Scheduling Engine

Completed:

* worker scheduling
* schedule/reschedule/unschedule
* conflict detection
* travel buffers
* worker availability
* time off
* scheduling settings
* recurring jobs
* schedule UI

### Phase 5A: Worker Lifecycle

Completed:

* worker assigned jobs
* worker job detail
* arrive/start/pause/resume/complete lifecycle
* completion notes
* job activity timeline
* worker/admin lifecycle permissions
* activity and audit logging

Do not rebuild Phase 5A unless explicitly asked.

## Development Environment

This project is developed on Windows.

The project should be run from:

```cmd
C:\Dev\FieldCore_Software
```

Do not assume the project is inside OneDrive.

OneDrive causes file lock problems with Prisma, Node, and `node_modules`.

## Windows Command Rules

Do not use PowerShell commands.

PowerShell blocks scripts like `npx.ps1`, which wastes time and causes avoidable errors.

Always use Windows CMD-safe commands.

Use:

```cmd
npm.cmd
npx.cmd
node
```

Do not use:

```cmd
npm
npx
PowerShell-only syntax
.ps1 scripts
```

Preferred commands:

```cmd
node --check src/routes/api.js
node --check assets/api.js
npx.cmd prisma validate
npm.cmd run build
npm.cmd test
npm.cmd run seed
npm.cmd run dev
```

For migrations:

```cmd
npm.cmd run migrate -- --name migration_name_here
```

## Token-Saving Rule

Do not run full checks after every tiny edit.

Use the smallest relevant check.

### Backend JS-only change

Run:

```cmd
node --check src/routes/api.js
```

### Frontend JS-only change

Run:

```cmd
node --check assets/api.js
```

### Prisma schema change

Run:

```cmd
npx.cmd prisma validate
```

Then only after schema is stable:

```cmd
npm.cmd run build
```

### Completed feature

Run:

```cmd
npm.cmd test
```

### Final verification only

Run:

```cmd
npm.cmd run build
npm.cmd run migrate -- --name relevant_phase_name
npm.cmd run seed
npm.cmd test
npm.cmd run dev
```

Do not repeatedly run:

```cmd
npm.cmd run build
npm.cmd test
```

after every small edit.

## File Editing Rules

Do not waste time fighting CMD quoting.

When editing project files, prefer direct file edits or patch tools over complex terminal-generated edits.

Avoid using long commands like:

```cmd
node -e "large multi-line file rewrite..."
echo ... > file
echo ... >> file
```

Do not generate large migration files through chained CMD `echo` commands.

If a file-edit command fails once because of quoting, escaping, redirection, ACL, or shell parsing:

1. Stop retrying the same style of command.
2. Use the direct file editor/patch tool if available.
3. If direct editing is unavailable, ask the user before continuing.
4. Do not burn multiple attempts on shell quoting.

Maximum retry rule:

* One failed file-edit command is acceptable.
* Two failed attempts means stop and change approach.
* Do not spend more than two attempts on CMD quoting, redirection, or generated scripts.

For Prisma migrations:

* Prefer Prisma migration commands where possible.
* If a manual migration file is needed, create/edit the migration file directly.
* Do not build migration SQL through huge `node -e` commands.
* Do not build migration SQL through chained `echo` commands.

For reading files:

* Use normal repo-relative paths.
* Do not read Codex attachment paths.
* Do not request escalated access unless the user explicitly approves.

For implementation logs:

* Keep progress notes short.
* Do not narrate every tiny failed command.
* Report only meaningful decisions, blockers, and final verification.

## Server Rules

Start the app with:

```cmd
npm.cmd run dev
```

If port 3000 is already in use, do not waste time. Use:

```cmd
netstat -ano | findstr :3000
taskkill /PID YOUR_PID_HERE /F
```

Or kill all Node servers if safe:

```cmd
taskkill /F /IM node.exe /T
```

Then restart:

```cmd
npm.cmd run dev
```

## Prisma / Windows File Lock Rule

If Prisma fails with an error like:

```text
EPERM: operation not permitted, rename query_engine-windows.dll.node
```

then a Node/Prisma process is locking the engine file.

Do not rewrite code to fix this.

First try:

```cmd
taskkill /F /IM node.exe /T
```

Then rerun:

```cmd
npm.cmd run build
```

If it still fails, tell the user to restart the machine.

## Secrets and Files

Do not commit:

```text
.env
node_modules
uploads
*.log
```

Keep `.env.example`.

Use fake/local test keys only during development.

Real API keys will be rotated before production.

## Coding Rules

Before coding:

1. Inspect the current repo.
2. Identify existing patterns.
3. Make a short implementation plan.
4. Implement in small steps.
5. Run the smallest relevant check.
6. Only run full tests when the feature is complete.

Do not:

* rewrite the whole app
* redesign the whole UI
* break completed phases
* remove company isolation
* weaken auth
* leak password hashes
* commit secrets
* run endless build/test loops
* repeatedly retry blocked sandbox reads
* read files outside the repo

## Error Handling Rules

Use consistent JSON errors.

Validation errors should be clear.

Conflict errors should use status `409`.

Permission errors should use status `403`.

Missing records should use status `404`.

Authentication errors should use status `401`.

## Company Isolation Rule

Every route must enforce company isolation.

When accepting IDs from the client, verify the related record belongs to the current company.

Examples:

* customerId
* workerId
* serviceId
* jobId
* quoteId
* invoiceId
* paymentId
* receiptId
* scheduleItemId
* jobActivityId

Never trust foreign keys from the client without checking company ownership.

## Scheduling Rules

All schedule creation/rescheduling must use the central conflict detection logic.

Do not create `ScheduleItem` directly in a route without conflict checks.

Scheduling must check:

* worker belongs to company
* job belongs to company
* overlapping jobs
* travel buffer
* worker availability
* approved time off
* company working hours
* cancelled/completed job restrictions

If a conflict occurs, return `409` with structured conflict details.

## Money Engine Rules

Do not use `count + 1` for invoice numbers.

Use company-scoped invoice counters.

Payments must be idempotent where appropriate.

Receipts must not duplicate for the same payment.

Paid/void invoices must not be edited unless an explicit admin override feature is requested.

## Worker Operations Rules

Workers should have an operations-focused experience, not an admin dashboard.

Workers should see:

* their assigned jobs
* today's jobs
* active job
* upcoming jobs
* required actions
* recent job activity
* lifecycle actions

Workers should not see:

* revenue
* unpaid invoices
* quote pipeline
* company-wide financial stats
* all workers
* all customers
* invoices/payments/receipts

Worker job lifecycle actions must enforce assignment and company isolation.

Lifecycle actions must create `JobActivity` records and audit logs.

## Dashboard Rules

Dashboard rendering must be role-based.

OWNER/ADMIN dashboard:

* company-wide stats
* revenue
* unpaid invoices
* worker status
* schedule
* pipeline
* recent jobs

WORKER dashboard:

* current active job
* today’s assigned jobs
* upcoming assigned jobs
* required actions
* recent activity
* simple completion stats

Workers must never receive admin dashboard financial data from `/api/dashboard`.

## UI Modal Rules

Do not close the parent form when opening a warning modal.

For schedule conflicts, the user should be able to:

* edit the schedule
* override anyway if allowed

Use clear labels:

```text
Edit Schedule
Override Anyway
```

## Done Means

A feature is not done just because code was written.

Done means:

* schema validates if Prisma changed
* migration exists if schema changed
* backend syntax check passes
* frontend syntax check passes if frontend changed
* tests pass
* app starts locally
* browser flow works manually
* no console errors
* previous phases still work

## Manual Regression Checklist

After major changes, check:

```text
Login works
Dashboard loads
Admin dashboard remains admin-specific
Worker dashboard is worker-specific
Branding still works
Quote → accept → job works
Job scheduling still works
Worker lifecycle still works
Invoice/payment/receipt still works
Worker restrictions still work
No passwordHash leaks
No cross-company access
```
