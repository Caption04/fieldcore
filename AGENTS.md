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

```bash
/home/kuhlinji/code/FieldCore_Software
```

Do not work from:

```bash
/mnt/c/Dev/FieldCore_Software
/mnt/c/Users
/mnt/c/Windows
/mnt/c/Users/USER/OneDrive
```

The Windows copy is only the source backup. The active development repo must be the Ubuntu copy.

Do not use absolute paths outside the repo.

Do not waste time trying to read Codex attachment paths. If task instructions are provided as an attachment and the attachment path is blocked, stop immediately and ask the user to place the instructions inside `TASK.md` in the repo root.

Preferred task workflow:

1. Read `AGENTS.md`.
2. Read `TASK.md` if it exists.
3. Work only inside the Ubuntu repo.
4. Use Bash/Linux-safe commands only.
5. Run the smallest relevant check.

If `TASK.md` does not exist, ask the user for the task in chat instead of trying to inspect Codex attachment folders.

## WSL / Ubuntu Rule

This project is being developed inside Ubuntu through WSL.

The correct repo location is:

```bash
/home/kuhlinji/code/FieldCore_Software
```

Before editing or running commands, confirm the current directory:

```bash
pwd
```

Good:

```bash
/home/kuhlinji/code/FieldCore_Software
```

Bad:

```bash
/mnt/c/Dev/FieldCore_Software
```

Do not run Codex, Prisma, npm install, builds, or tests from `/mnt/c/...`.

Windows-mounted folders can cause permission, ACL, file lock, and performance problems.

## Sandbox / Permission Rule

If the sandbox blocks basic reads such as:

```bash
ls
find
grep
cat
sed
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

## User-Facing Simplicity Rule

FieldCore is built for busy field-service businesses, not software engineers.

Assume many users have ordinary everyday computer skills and little patience for technical language. User-facing copy should usually be understandable at roughly a Grade 5 reading level.

Do not expose backend or infrastructure concepts merely because they exist. Keep technical implementation details in the backend, logs, support tools, or a deliberately hidden advanced/internal area.

Avoid normal customer-facing labels or panels such as:

* system configuration
* HTTP-only cookies
* session revocation
* environment / node environment
* database configured
* rate limiting
* integration secrets
* raw JSON status output
* raw event codes

Translate technical actions into plain business language instead:

* `System configuration` → `Settings`
* `Session revocation` → `Sign out device`
* `Permission override` → `Change access`
* `Security event` → `Recent security activity`
* `Integration credentials` → `Connect account`

Before adding anything to a page, ask whether the user needs it to:

1. make a decision,
2. take an action, or
3. understand something necessary to complete their work.

If not, do not show it by default.

Prefer:

* one clear primary job per page
* short headings and short helper text
* familiar business language
* progressive disclosure for advanced options
* role-relevant information only
* fewer cards and fewer always-visible inputs
* simple summaries with an explicit `Edit` or `View details` action

Do not make each module feel like a separate complex product. Reuse familiar FieldCore page patterns so users always know where they are and what to do next.

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

This project is developed inside Ubuntu/WSL.

Use VS Code with the WSL extension.

The VS Code bottom-left corner should show:

```text
WSL: Ubuntu
```

The project should be opened from:

```bash
/home/kuhlinji/code/FieldCore_Software
```

Do not assume the project is inside Windows, OneDrive, or `/mnt/c`.

OneDrive and Windows-mounted folders can cause file lock problems with Prisma, Node, and `node_modules`.

## Linux Command Rules

Use Bash-safe Linux commands.

Use:

```bash
npm
npx
node
```

Do not use:

```bash
npm.cmd
npx.cmd
PowerShell commands
CMD-only syntax
.ps1 scripts
```

Preferred commands:

```bash
node --check src/routes/api.js
node --check assets/api.js
npx prisma validate
npm run build
npm test
npm run seed
npm run dev
```

For migrations:

```bash
npm run migrate -- --name migration_name_here
```

## Token-Saving Rule

Do not run full checks after every tiny edit.

Use the smallest relevant check.

### Backend JS-only change

Run:

```bash
node --check src/routes/api.js
```

### Frontend JS-only change

Run:

```bash
node --check assets/api.js
```

### Prisma schema change

Run:

```bash
npx prisma validate
```

Then only after schema is stable:

```bash
npm run build
```

### Completed feature

Run:

```bash
npm test
```

### Final verification only

Run:

```bash
npm run build
npm run migrate -- --name relevant_phase_name
npm run seed
npm test
npm run dev
```

Do not repeatedly run:

```bash
npm run build
npm test
```

after every small edit.

## File Editing Rules

Do not waste time fighting shell quoting.

When editing project files, prefer direct file edits or patch tools over complex terminal-generated edits.

Avoid using long commands like:

```bash
node -e "large multi-line file rewrite..."
echo "..." > file
cat <<'EOF' > file
```

Do not generate large migration files through chained shell commands.

If a file-edit command fails once because of quoting, escaping, redirection, ACL, or shell parsing:

1. Stop retrying the same style of command.
2. Use the direct file editor/patch tool if available.
3. If direct editing is unavailable, ask the user before continuing.
4. Do not burn multiple attempts on shell quoting.

Maximum retry rule:

* One failed file-edit command is acceptable.
* Two failed attempts means stop and change approach.
* Do not spend more than two attempts on Bash quoting, redirection, or generated scripts.

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

```bash
npm run dev
```

If port 3000 is already in use, do not waste time.

Check the port:

```bash
ss -ltnp | grep ':3000'
```

Or:

```bash
lsof -i :3000
```

Then kill the specific process:

```bash
kill -9 PID_HERE
```

If safe, kill Node processes:

```bash
pkill -f node
```

Then restart:

```bash
npm run dev
```

## Prisma / Linux File Lock Rule

If Prisma fails because a Node or Prisma process is locking files, do not rewrite code to fix it.

First try:

```bash
pkill -f node
```

Then rerun the smallest relevant command:

```bash
npx prisma validate
```

or:

```bash
npm run build
```

If the issue continues, report it clearly and ask the user before doing destructive cleanup.

Do not delete Prisma-generated files blindly.

## Dependencies Rule

If the project was copied from Windows into Ubuntu, reinstall dependencies inside Ubuntu.

If `node_modules` exists from Windows, remove it:

```bash
rm -rf node_modules
npm install
```

If the project has separate frontend/backend folders, reinstall inside the relevant folders only.

Do not run `npm install` repeatedly unless dependency files changed.

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

## UI Feedback Law

Never use browser-native `alert()`, `confirm()`, or `prompt()` anywhere in FieldCore.

This is a strict product rule.

Use the shared FieldCore feedback system instead:

* standard in-app notifications/toasts for action success and failure
* proper FieldCore modals for confirmation before destructive, sensitive, or irreversible actions
* proper FieldCore form modals when the user must enter a reason or other information
* clear inline field errors for validation problems, with a notification when the overall action fails

Every user-triggered action must give clear feedback. Do not leave the user wondering whether an action worked.

Before completing frontend work, run:

```bash
node --test test/no-native-dialogs.test.js
```

The check must pass with no browser-native dialog calls.

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
