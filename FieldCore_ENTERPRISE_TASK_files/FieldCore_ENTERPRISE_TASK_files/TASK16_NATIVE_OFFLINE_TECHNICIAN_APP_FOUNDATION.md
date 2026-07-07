# FieldCore Enterprise Readiness Task

These tasks assume the current codebase is the uploaded `FieldCore_Software.zip` project: Node/Express, Prisma/PostgreSQL, static HTML/CSS/JS UI, JWT auth, multi-tenant company scoping, existing assets/contracts, inventory/purchasing, finance localization, offline worker sync foundation, branches, approvals, reports, notifications, integrations, and SaaS billing foundations.

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

## TASK16 — Native offline-first technician app foundation

## Commercial reason

A web dashboard alone will not feel enterprise-grade in African field environments. The enterprise value depends on technicians completing work reliably under weak signal: job cards, proof photos, signatures, timestamps, parts used, checklists, and sync conflict handling.

## Objective

Harden the backend mobile/offline API and produce a native-app-ready contract for Android and iOS. If a Flutter app already exists outside this zip, align to it. If not, create the backend and API contract first.

## Existing foundation to build on

- `WorkerDevice`
- `OfflineActionQueue`
- `OfflineActionType`
- `OfflineActionStatus`
- worker job endpoints
- worker location endpoints
- job proof photo/signature models
- schedule/job activity models
- inventory job part usage
- `MANUAL_QA_SIMULATION.md`

## Required outcomes

### 1. Mobile API contract document

Create `docs/mobile-api-contract.md` with:

- auth/login flow
- device registration
- sync pull endpoint
- sync push endpoint
- job data shape
- schedule data shape
- proof photo upload shape
- signature upload shape
- part usage shape
- checklist answers
- conflict response format
- offline action ids/idempotency keys
- error codes

### 2. Device registration and trust

Support:

- worker device registration
- device name/model/platform/app version
- last seen
- revoked device status
- require active device for offline sync if enabled
- admin revoke device action

### 3. Offline sync v2

Add robust sync rules:

- pull changes since cursor
- push offline actions with idempotency key
- return per-action result
- support partial success
- no duplicate photos/signatures/actions
- conflict status if job changed since offline snapshot
- server timestamp for sync cursor

### 4. Offline-capable field workflows

Support offline push actions for:

- job started
- job paused/resumed
- job completed
- proof photo captured/uploaded later
- customer signature captured
- GPS checkpoint
- checklist completed
- parts used
- issue/incident note
- customer unavailable

### 5. Field checklists

Add configurable job/service checklists:

- checklist templates per service/contract
- required questions
- photo-required items
- pass/fail items
- technician notes
- completion blocked if required checklist incomplete

### 6. Sync conflict UI/API

Admins need to see sync problems:

- failed offline actions
- conflict reason
- worker/device
- job
- retry/resolve options

Add a simple admin page or Settings section.

### 7. Mobile app scaffold option

If asked to create app code in the current repo, add a clearly isolated `/mobile` Flutter scaffold only if it does not destabilize the backend.

Minimum mobile screens:

- login
- today/jobs list
- job detail
- start/pause/complete job
- checklist
- photo capture/upload queue
- signature capture
- parts used
- sync status

Do not force this if the task scope becomes too large. The backend contract is the priority.

## Tests

Add tests for:

- revoked device cannot sync.
- duplicate offline action only executes once.
- partial sync returns per-action status.
- worker cannot sync another worker's jobs.
- completed job cannot be completed twice.
- required checklist blocks completion.
- proof photo metadata is tenant-scoped.
- conflict is returned when job changed after offline snapshot.

## Manual QA

Simulate:

- worker downloads jobs.
- worker goes offline.
- job changes in admin.
- worker submits old completion.
- system flags conflict.
- admin resolves conflict.

## Acceptance criteria

- Backend is genuinely mobile/offline ready.
- App developers have a clear API contract.
- Offline behavior is deterministic, safe, and testable.
- FieldCore can honestly sell “offline-ready technician workflow” after native app implementation.
