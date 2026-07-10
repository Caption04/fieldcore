# FieldCore — Full-System Manual QA Test Plan

**Scope:** Every module of the FieldCore platform — Express/Prisma/PostgreSQL backend, static admin web UI, client portal, public booking/tracking portal, regional Zimbabwe/South Africa local deployments, customer payment experience, finance/accounting exports, and the Flutter technician mobile app.
**Dimensions covered:** Functionality, Security, Multi-tenancy, Data integrity, Performance/Efficiency, Reliability/Recovery.
**Companion docs already in repo (use alongside, don't duplicate):** `MANUAL_QA_SIMULATION.md` (happy-path phase 1–12 walkthrough), `docs/security-review.md`, `docs/deployment-checklist.md`, `docs/mvp-signoff-checklist.md`, `docs/disaster-recovery-runbook.md`.

This plan is organized differently from the existing simulation script: it is a **module-by-module regression + adversarial test matrix**, meant to be run before any major release, not just once at MVP. Each test case has an ID, so failures can be logged and re-tested individually.

---

## 0. How to Use This Document

- Work top to bottom for a full release regression, or pull a single module's table for a targeted re-test after a bug fix.
- Every test case row is: **ID | Steps | Expected Result | Priority | Type**.
- Type key: **F** = Functional, **S** = Security, **P** = Performance/Efficiency, **D** = Data Integrity, **R** = Reliability/Recovery.
- Priority key: **P0** = release-blocking, **P1** = must-fix before GA, **P2** = fix soon, **P3** = polish.
- Log every failure in the Defect Log template (Section 24) — don't just mark "fail" inline and move on.
- Run the automated suite first (`npm test`) — this plan assumes automated coverage is green and focuses on what automation typically misses: cross-tenant leakage, role edge cases, UI truth-vs-API truth, and real device/network conditions.

---


## 0A. Before You Start Manual QA — Required Preflight

Manual QA should start from a **clean, known state**. Do not begin from a database that still contains mixed experimental tenants, old invoices, old customer payment settings, or half-configured region data.

### 0A.1 Confirm the codebase is ready

Run these first:

```bash
cd ~/code/FieldCore_Software

git status --short
npm install
node --check src/routes/api.js
node --check assets/api.js
node --check assets/client-portal.js
node --check prisma/seed.js
npm test
```

Expected:

- `npm test` is green before manual QA starts.
- Any local patch files or uncommitted changes are intentional.
- Do not start manual QA while syntax checks or automated tests are failing.

### 0A.2 Confirm local env files are real, not placeholders

The real `.env`, `.env.zw`, and `.env.sa` files may have blank third-party API keys, but the database URLs must use your real local Postgres username/password. They must not contain placeholder `USER:PASSWORD` values.

Run:

```bash
grep -n '^DATABASE_URL\|^PORT\|^FIELDCORE_REGION' .env .env.zw .env.sa
```

Expected shape:

```text
.env:DATABASE_URL="postgresql://<real-local-user>:<real-local-password>@localhost:5432/fieldcore..."
.env.zw:DATABASE_URL="postgresql://<same-real-user>:<same-real-password>@localhost:5432/fieldcore_zw..."
.env.zw:FIELDCORE_REGION="ZW"
.env.zw:PORT=3000
.env.sa:DATABASE_URL="postgresql://<same-real-user>:<same-real-password>@localhost:5432/fieldcore_sa..."
.env.sa:FIELDCORE_REGION="SA"
.env.sa:PORT=3001
```

If the regional env files are missing or still contain placeholders, run the regional env generation command if it exists in `package.json`:

```bash
npm run env:regions
```

Then check the files again.

### 0A.3 Reset to clean Zimbabwe and South Africa databases

Use separate local databases so region testing cannot mix data:

```bash
cd ~/code/FieldCore_Software

DB_OWNER=$(node - <<'NODE'
const fs = require('fs');
const m = fs.readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.*)$/m);
if (!m) throw new Error('DATABASE_URL missing from .env');
const raw = m[1].trim().replace(/^['"]|['"]$/g, '');
const url = new URL(raw);
console.log(decodeURIComponent(url.username));
NODE
)

echo "Using database owner: $DB_OWNER"

sudo -u postgres dropdb --if-exists fieldcore_zw
sudo -u postgres dropdb --if-exists fieldcore_sa
sudo -u postgres createdb -O "$DB_OWNER" fieldcore_zw
sudo -u postgres createdb -O "$DB_OWNER" fieldcore_sa

npm run db:reset:zw
npm run db:reset:sa
```

Expected:

- `fieldcore_zw` contains Zimbabwe seeded accounts only.
- `fieldcore_sa` contains South Africa seeded accounts only.
- No old customers, invoices, quotes, bookings, or mixed payment settings remain.

### 0A.4 Start both regional servers

Open two terminals:

```bash
cd ~/code/FieldCore_Software
npm run dev:zw
```

```bash
cd ~/code/FieldCore_Software
npm run dev:sa
```

Expected:

```text
Zimbabwe:      http://localhost:3000
South Africa:  http://localhost:3001
```

Then test health:

```bash
curl -i http://localhost:3000/healthz
curl -i http://localhost:3000/readyz
curl -i http://localhost:3001/healthz
curl -i http://localhost:3001/readyz
```

### 0A.5 Browser/device setup before UI QA

- Use separate browser profiles, private windows, or separate browsers for ZW and SA so cookies/localStorage do not confuse the test.
- Hard refresh after every UI patch: `Ctrl + Shift + R`.
- For mobile app QA, point the technician app API base URL to the correct regional server before testing that region.
- If no real Paynow/Ozow/email/WhatsApp keys exist, keep providers in console/mock/manual mode and test the safe local behavior only.

### 0A.6 Seeded login accounts

Password for all seeded staff accounts:

```text
FieldCoreDemo2026!
```

Zimbabwe server (`http://localhost:3000`):

| Role | Email |
|---|---|
| Owner | `owner.zw@fieldcore.test` |
| Admin | `admin.zw@fieldcore.test` |
| Worker | `worker.zw@fieldcore.test` |

South Africa server (`http://localhost:3001`):

| Role | Email |
|---|---|
| Owner | `owner.sa@fieldcore.test` |
| Admin | `admin.sa@fieldcore.test` |
| Worker | `worker.sa@fieldcore.test` |

### 0A.7 Go/no-go before manual QA

Do not begin the full manual QA run until all of these are true:

- [ ] `npm test` passes.
- [ ] `npm run db:reset:zw` completes.
- [ ] `npm run db:reset:sa` completes.
- [ ] ZW server is running on port `3000`.
- [ ] SA server is running on port `3001`.
- [ ] `/healthz` and `/readyz` pass on both servers.
- [ ] You can log in to the ZW owner account.
- [ ] You can log in to the SA owner account.
- [ ] Finance settings show ZW/USD/Paynow on the ZW server.
- [ ] Finance settings show SA/ZAR/South African payment providers on the SA server.
- [ ] The customer payment page shows a generic **Make payment online** action, not provider-choice buttons.

---
## 1. Test Environment Setup

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ENV-01 | Fresh clone or current repo, `cp .env.example .env` if needed, fill a real local `DATABASE_URL` and a long random `JWT_SECRET` | App uses real local values; production mode refuses placeholder `JWT_SECRET` | P0 | S |
| ENV-02 | Run `npm install` and syntax checks for changed JS files | Dependencies install and syntax checks pass with no parser errors | P0 | F |
| ENV-03 | Run `npm run env:regions` if present, then inspect `.env.zw` and `.env.sa` | Regional env files reuse the working `.env` database credentials, change only DB name/region/port, and do not contain placeholder `USER:PASSWORD` | P0 | F/S |
| ENV-04 | Create/reset `fieldcore_zw` and `fieldcore_sa`, then run `npm run db:reset:zw` and `npm run db:reset:sa` | Clean databases are reset and seeded without manual Prisma migration prompts | P0 | F |
| ENV-05 | `npm test` | All automated tests pass with 0 failures before manual QA starts | P0 | F |
| ENV-06 | `npm run dev:zw`, hit `http://localhost:3000/healthz` and `/readyz` | ZW server is healthy and connected to `fieldcore_zw` | P0 | R |
| ENV-07 | `npm run dev:sa`, hit `http://localhost:3001/healthz` and `/readyz` | SA server is healthy and connected to `fieldcore_sa` | P0 | R |
| ENV-08 | Log into both regional owner accounts in separate browser profiles/windows | ZW and SA sessions do not share cookies/localStorage in a way that confuses the UI | P0 | S/R |
| ENV-09 | Kill Postgres temporarily and hit `/readyz` on both servers | `/readyz` reflects real DB connectivity failure instead of claiming healthy | P0 | R |
| ENV-10 | Run destructive reset command with `NODE_ENV=production` set | Command refuses to run in production | P0 | S |
| ENV-11 | Start app with a bad `DATABASE_URL` | App fails fast with a clear log, not a silent hang or crash loop | P1 | R |
| ENV-12 | Confirm `.env`, `.env.zw`, `.env.sa`, `.env.backup`, and any `*.log` files are not committed / not served statically | No secrets reachable via direct URL such as `GET /.env` or `GET /server.log` | P0 | S |

---

## 2. Accounts & Role Matrix

Run QA against **both** regional deployments. Treat ZW and SA as separate local products unless a test explicitly asks for cross-region comparison.

### Zimbabwe seed set — `http://localhost:3000`

| Role | Email | Purpose |
|---|---|---|
| Owner | `owner.zw@fieldcore.test` | Full access, billing, finance settings, security settings |
| Admin | `admin.zw@fieldcore.test` | Operational access, no owner-only settings |
| Worker | `worker.zw@fieldcore.test` | Field technician / mobile workflow |

Expected ZW defaults:

| Setting | Expected |
|---|---|
| Country/market | Zimbabwe / `ZW` |
| Currency | `USD` |
| Timezone | `Africa/Harare` |
| Customer payment methods | Cash, Bank transfer, Paynow |
| Online payment provider visible to customer | Generic **Make payment online** only; customer must not choose Paynow by name |
| South African payment providers | Must not appear |

### South Africa seed set — `http://localhost:3001`

| Role | Email | Purpose |
|---|---|---|
| Owner | `owner.sa@fieldcore.test` | Full access, billing, finance settings, security settings |
| Admin | `admin.sa@fieldcore.test` | Operational access, no owner-only settings |
| Worker | `worker.sa@fieldcore.test` | Field technician / mobile workflow |

Expected SA defaults:

| Setting | Expected |
|---|---|
| Country/market | South Africa / `SA` or `ZA`, but frontend/backend must agree consistently |
| Currency | `ZAR` |
| Timezone | `Africa/Johannesburg` |
| Customer payment methods | Cash, Bank transfer, Ozow, Yoco, PayFast, SnapScan |
| Online payment provider visible to customer | Generic **Make payment online** only; customer must not choose Ozow/Yoco/PayFast/SnapScan by name |
| Zimbabwe payment providers | Paynow must not appear |

### Additional tenant data for isolation tests

For Section 4, create at least one second tenant/company in each database or use the registration flow to create another company. Cross-tenant tests are still required inside each regional database.

| Role | Company | Purpose |
|---|---|---|
| Owner | Company A | Primary tenant under test |
| Admin | Company A | Operational access boundary |
| Worker | Company A | Worker-scoped access boundary |
| Second Worker | Company A | Worker-vs-worker leakage tests |
| Client Portal user | Company A | Customer-scoped access boundary |
| Owner | Company B | Tenant isolation testing |
| Worker | Company B | Worker tenant isolation testing |

---

## 3. Authentication & Session Security

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| AUTH-01 | Register a new company via `/auth/register` | Company + owner created, session cookie set, password never returned in response | P0 | F |
| AUTH-02 | Login with correct credentials | HTTP-only, secure (in prod), `SameSite`-appropriate cookie issued; response never includes `passwordHash` | P0 | S |
| AUTH-03 | Login with wrong password repeatedly (exceed `RATE_LIMIT_AUTH_MAX`, default 20/15min) | Requests beyond the limit are throttled with a clear error, not a 500 | P0 | S |
| AUTH-04 | Inspect JWT payload (decode, don't verify) | Contains only userId/companyId/role-type claims — no password, no unnecessary PII | P1 | S |
| AUTH-05 | Log out, then reuse the old cookie value on a protected route | Rejected — session/cookie invalidated server-side, not just cleared client-side | P0 | S |
| AUTH-06 | Enable 2FA (`POST /auth/2fa/enable`) as Owner, log out, log back in | Login requires second factor before issuing a full session | P0 | S |
| AUTH-07 | Generate recovery codes, disable authenticator access, use a recovery code to log in | Recovery code works once, then is invalidated (can't be reused) | P1 | S |
| AUTH-08 | Attempt `POST /auth/2fa/disable` without re-authenticating (no current password/2FA code) | Rejected — disabling 2FA requires proof of possession, not just an active session | P0 | S |
| AUTH-09 | `GET /auth/sessions` — open 3 sessions from different "devices" (browsers), revoke one via `POST /auth/sessions/:id/revoke` | Revoked session's cookie stops working immediately; other sessions remain valid | P0 | S |
| AUTH-10 | `POST /auth/sessions/revoke-all` | All other sessions die; current session's behavior matches documented intent (confirm whether current session also dies) | P1 | F |
| AUTH-11 | Set an intentionally weak password on `PATCH /auth/me/password` | Rejected if a password policy is enforced (check `docs/security-compliance-reliability.md` for the actual policy and test against it) | P1 | S |
| AUTH-12 | Trigger repeated failed logins for one account until lockout policy kicks in | Account locks per policy; legitimate login after lockout window succeeds | P1 | S |
| AUTH-13 | Client portal: `POST /client/auth/register`, `/login`, `/logout`, `/forgot-password` | Client session is a **separate cookie/namespace** from internal staff session — confirm a client cookie cannot access `/api/auth/me` or any staff route | P0 | S |
| AUTH-14 | `PATCH /users/:id/role` as non-owner | Rejected — only owner (or explicitly permitted admin) can change roles | P0 | S |

---

## 4. Authorization, RBAC & Multi-Tenant Isolation (highest priority section)

This is the section most likely to hide serious bugs in a multi-tenant SaaS. Test every core entity type against every angle below.

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| TEN-01 | As Company A owner, note IDs for a customer, job, quote, invoice, worker, asset, contract | — | — | — |
| TEN-02 | Login as Company B owner. Directly request Company A's records by ID (e.g. `GET /api/customers/{A-id}`, `/jobs/{A-id}`, `/invoices/{A-id}`) | Every request returns 404/403 — **never** the record, even partially | P0 | S |
| TEN-03 | As Company B, list customers/jobs/quotes/invoices/workers/assets | Company A's records never appear, even mixed into pagination | P0 | S |
| TEN-04 | As Company B worker, hit worker-scoped endpoints (assigned jobs, sync pull) with a guessed/incremented job ID from Company A | Rejected; no data leak, no verbose error revealing the record exists | P0 | S |
| TEN-05 | As Worker (Company A), attempt to `GET`/`PATCH` a customer, invoice, quote, or another worker's profile directly (not just via UI, via raw API call) | Rejected — worker role is restricted to assigned jobs, own schedule, own location updates, own job photos | P0 | S |
| TEN-06 | As Worker A1, request Worker A2's assigned jobs or location history | Rejected | P0 | S |
| TEN-07 | As Client Portal user, request another customer's quotes/invoices/assets/contracts by ID | Rejected | P0 | S |
| TEN-08 | As Client Portal user, attempt any staff-only route (`/api/workers`, `/api/company/security-settings`, `/api/admin/*`) | Rejected with 401/403 | P0 | S |
| TEN-09 | As Admin (non-owner), attempt owner-only actions: billing/subscription changes, security settings, identity provider config | Confirm the actual documented boundary (README says admin has "full operational access, no billing/owner-only settings") and verify it's enforced, not just hidden in the UI | P0 | S |
| TEN-10 | Tamper with a request body to inject a different `companyId` than the authenticated user's (e.g. `POST /api/jobs` with `companyId` of Company B) | Server ignores/overrides client-supplied `companyId`; record is created under the authenticated user's real company (per README: "API handlers never trust client-provided companyId") | P0 | S |
| TEN-11 | Branch-scoped access (multi-branch companies): create two branches, assign an admin to Branch 1 only, confirm they cannot see Branch 2's jobs/workers/reports | Branch scoping enforced server-side, not just UI filter | P0 | S |
| TEN-12 | Approval-gated actions (refunds, discounts, etc. per enterprise approval gates): attempt the gated action as a role without approval rights | Rejected or routed into a pending-approval state, never silently executed | P0 | S |
| TEN-13 | Compare ZW and SA after separate resets: create a customer/invoice in ZW, then search/list on SA; repeat SA → ZW | Records never appear across regional servers/databases. Region separation is enforced by `DATABASE_URL`, not only UI filters | P0 | S/D |

---

## 5. Core Business Objects — Customers, Services, Workers

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| CORE-01 | Create/edit/delete a customer with valid and invalid data (missing name, malformed email/phone) | Zod validation rejects bad input with a clear message; valid input persists correctly | P1 | F |
| CORE-02 | Soft-delete a customer, then attempt normal retrieval and "recovery" flow | Soft-deleted record disappears from normal views but is recoverable via the intended recovery path (per `add_soft_delete_fields` / `quote_soft_delete_recovery` migrations) | P1 | D |
| CORE-03 | Create a service with pricing, mark inactive, confirm it disappears from new-quote pickers but historic quotes referencing it still render correctly | P2 | F |
| CORE-04 | Create a worker, set role/availability, deactivate, confirm deactivated worker can't log in but historic job assignments remain intact | P1 | D |
| CORE-05 | Attempt duplicate customer creation (same email/phone) | Confirm actual dedup behavior — either blocked or flagged, matches onboarding "duplicate detection" feature intent | P2 | F |
| CORE-06 | Upload a customer/company logo via branding settings | Accepted only for configured image MIME types and size limit; oversized/wrong-type files rejected | P1 | S |

---

## 6. Quotes & Booking Requests (Public + Admin)

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| QUOTE-01 | Submit a public booking request via `booking.html` with no auth | Accepted, rate-limited per `RATE_LIMIT_PUBLIC_BOOKING_MAX` | P0 | F/S |
| QUOTE-02 | Track a public request via `/public/booking-requests/track` with reference **only**, no email/phone | Rejected — per security review, "reference-only tracking is rejected" | P0 | S |
| QUOTE-03 | Track with reference + matching email | Succeeds and shows only that request's safe fields | P0 | S |
| QUOTE-04 | Track with reference + wrong email/phone | Rejected | P0 | S |
| QUOTE-05 | Admin converts booking request into a quote, edits line items, sends to client | Quote reflects correct totals, currency/tax metadata (localization) | P1 | F |
| QUOTE-06 | Client portal: view quote, Accept, then attempt to Accept again or Reject after accepting | Second action rejected/no-op — quote state machine enforced server-side | P1 | D |
| QUOTE-07 | Client Rejects a quote, admin attempts to convert a rejected quote into a job | Blocked, or requires explicit reactivation step (confirm intended behavior and test it holds) | P2 | F |
| QUOTE-08 | Quote expiry: set a short expiry, let it lapse, attempt client Accept | Rejected/expired state shown, cannot be accepted post-expiry | P2 | F |
| QUOTE-09 | Exceed `RATE_LIMIT_PUBLIC_BOOKING_MAX` from one IP in the rate-limit window | Further requests throttled | P1 | S |

---

## 7. Scheduling & Jobs

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| JOB-01 | Schedule a job, assign worker, confirm it appears on worker's app/portal and on `schedule.html` | P0 | F |
| JOB-02 | Double-book a worker (overlapping time windows) | Confirm actual conflict-handling behavior (block, warn, or allow) matches intended design — don't assume; check `job_defaults_settings` migration/settings | P1 | F |
| JOB-03 | Reschedule a job, confirm notifications fire to worker and client per configured channels | P1 | F |
| JOB-04 | Cancel a job with linked invoice/quote | Confirm cascading state is handled correctly (invoice not silently orphaned) | P1 | D |
| JOB-05 | Update worker GPS location during a job (`worker/location` endpoints) | Location stored with accuracy/source metadata (per `worker_location_accuracy_source` migration); stale/low-accuracy pings handled sanely | P2 | F |
| JOB-06 | Map view (`map.html`) with 20+ concurrently "active" workers | Renders without noticeable lag; only current company's workers shown | P1 | F/P |

---

## 8. Proof of Work — Photos, Signatures, Checklists

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| POW-01 | Upload a proof-of-work photo from a job as Worker | Stored under `uploads/jobs/proof`, linked only to that job/company, visible to admin and (if enabled) client | P0 | F |
| POW-02 | Attempt to upload a non-image file (e.g. `.exe` renamed to `.jpg`, or a script disguised with an image extension) | Rejected by MIME-type validation, not just file-extension check | P0 | S |
| POW-03 | Upload an oversized file exceeding `RATE_LIMIT_UPLOAD` / size limits | Rejected cleanly | P1 | S |
| POW-04 | Capture a customer signature (`signature_screen` in Flutter app / web signature flow) | Signature stored, linked to correct job, retrievable in job history | P0 | F |
| POW-05 | Complete a checklist template with required fields left blank | Submission blocked until required fields are filled, or clearly flagged as incomplete | P1 | F |
| POW-06 | Access another company's uploaded proof photo/signature by guessing/incrementing the file/object ID | Rejected — storage access must be scoped, not just obscure URLs (security-by-obscurity is not acceptable) | P0 | S |

---

## 9. Invoicing & Money Engine

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| INV-01 | Generate invoice from a completed job/quote in ZW | Correct USD totals, VAT/tax label, invoice prefix, receipt prefix, and default due date per ZW finance settings | P0 | F |
| INV-02 | Generate invoice from a completed job/quote in SA | Correct ZAR totals, VAT/tax label, invoice prefix, receipt prefix, and default due date per SA finance settings | P0 | F |
| INV-03 | Change `Prices include tax`, tax rate, and payment terms in finance settings, then generate a new invoice | New invoice reflects the updated settings; old invoices do not silently mutate unless intentionally designed to recalculate | P1 | D |
| INV-04 | Generate a payment link for an invoice | Link is tied to the specific invoice/company and cannot be reused for a different invoice amount or tenant | P0 | S |
| PAY-01 | ZW finance settings: enable Cash, Bank transfer, Paynow; disable any SA providers | Admin UI shows only ZW-appropriate configured options; SA providers do not appear | P0 | F |
| PAY-02 | SA finance settings: enable Cash, Bank transfer, Ozow/Yoco/PayFast/SnapScan; Paynow disabled/hidden | Admin UI shows only SA-appropriate configured options; Paynow does not appear | P0 | F |
| PAY-03 | Customer invoice page for an unpaid ZW invoice | Customer sees amount due and generic **Make payment online** if online payment is enabled; customer does not see provider-choice buttons such as “Pay with Paynow” | P0 | F |
| PAY-04 | Customer invoice page for an unpaid SA invoice | Customer sees amount due and generic **Make payment online** if online payment is enabled; customer does not see provider-choice buttons such as “Pay with Ozow/Yoco/PayFast/SnapScan” | P0 | F |
| PAY-05 | Disable Cash in the business finance settings, then view the customer invoice payment UI | Cash payment option is not shown to the customer | P0 | F |
| PAY-06 | Enable Cash in the business finance settings, then view the customer invoice payment UI | Cash appears as a manual option with clear wording that admin/technician confirmation is required | P1 | F |
| PAY-07 | Disable Bank transfer in finance settings, then view customer invoice payment UI | Bank transfer is not shown to the customer | P0 | F |
| PAY-08 | Enable Bank transfer and toggle proof-of-payment requirement | Customer bank transfer section clearly states whether proof of payment is required; if required, upload/submission path works or is clearly unavailable | P1 | F |
| PAY-09 | Simulate the configured regional online provider in mock/sandbox mode | Flow completes: Make payment online → backend chooses configured provider → redirect/simulate → webhook confirmation → invoice marked paid | P0 | F |
| PAY-10 | Send a **forged/unsigned** webhook call claiming a payment succeeded | Rejected — only trusted, signature-verified webhooks can confirm payment | P0 | S |
| PAY-11 | Replay a valid webhook payload twice | Second replay does not double-credit the invoice | P0 | D |
| PAY-12 | Reconciliation import: upload a bank statement/CSV with a transaction that doesn't match any invoice | Flagged for manual review, not silently ignored or wrongly auto-matched | P1 | F |
| PAY-13 | Trigger a payment reminder twice in quick succession | Second reminder throttled per reminder policy | P1 | F |
| PAY-14 | Attempt a refund as a role without refund-approval rights | Blocked / routed to approval gate | P0 | S |
| PAY-15 | Approve a refund as an authorized role, confirm invoice/collections state updates correctly | P1 | F/D |
| PAY-16 | Collections: age an invoice past due, confirm it surfaces in collections views with correct aging buckets | P2 | F |
| BILL-01 | SaaS billing: with `SAAS_BILLING_PROVIDER` blank, confirm checkout is disabled cleanly | No broken button/500; UI explains provider is not configured | P1 | F |
| BILL-02 | With `SAAS_BILLING_PROVIDER=manual`, walk through the manual billing workflow end-to-end | Manual request/record is created without pretending a live card checkout occurred | P1 | F |
| BILL-03 | Attempt to access another company's subscription/billing data | Rejected; multi-tenant scoping applies to billing too | P0 | S |

---

## 10. Client Portal

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| CLI-01 | Register, verify session cookie is client-scoped and separate from staff session | P0 | S |
| CLI-02 | View dashboard, quotes, invoices, payments, assets, service contracts — confirm every list only shows records linked to that client's own customer record | P0 | S |
| CLI-03 | `GET /client/storage/objects/:id` — attempt with another client's object ID | Rejected | P0 | S |
| CLI-04 | Forgot-password flow | Doesn't reveal whether an email exists in the system (generic response either way) | P1 | S |
| CLI-05 | Accept/reject a quote, confirm admin side reflects the change in real time or on next load | P1 | F |

---

## 11. Notifications (Email / WhatsApp / SMS)

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| NOTIF-01 | With `EMAIL_PROVIDER` blank | Sends are safely skipped, no crash | P0 | R |
| NOTIF-02 | With `EMAIL_PROVIDER=console` | Metadata logged locally, no real send, no API key exposure in logs | P1 | S |
| NOTIF-03 | With `EMAIL_PROVIDER=webhook` pointed at a mock endpoint | Correct payload sent, bearer token used from env only, never logged/returned in API responses | P0 | S |
| NOTIF-04 | Same three states for `WHATSAPP_PROVIDER` (blank/disabled, console, meta/360dialog) | Same expectations | P0 | F/S |
| NOTIF-05 | Trigger every documented notification event (booking received, quote sent, job scheduled, invoice sent, payment received, etc.) | Each fires the correct template with correct dynamic fields substituted (name, amount, date, currency) | P1 | F |
| NOTIF-06 | Check notification logs in Settings | Show event/channel/recipient/status/sanitized error only — never raw API keys or full provider payloads | P0 | S |
| NOTIF-07 | Force a provider failure (bad webhook URL) | Failure logged with a sanitized error, job/invoice flow continues normally rather than blocking on notification failure | P1 | R |

---

## 12. Mobile / Offline Sync API + Flutter Technician App

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| MOB-01 | Register a new device via the mobile API contract | Device recorded with trust metadata; confirm it appears in an admin-visible device list | P1 | F |
| MOB-02 | Revoke a device from admin side, then attempt a sync push/pull from that device | Rejected immediately | P0 | S |
| MOB-03 | Pull assigned jobs (`sync v2 pull`) as Worker A, confirm only Worker A's own jobs return | P0 | S |
| MOB-04 | Go offline in the Flutter app (airplane mode), complete a job: checklist, photo, signature, status update | All actions queue locally (`offline_queue.dart`) without crashing | P0 | F |
| MOB-05 | Come back online, trigger `POST /worker/sync/v2/push` | Each queued action returns a per-action result (success/fail), not just one blob status for the whole batch | P0 | F |
| MOB-06 | Create a conflicting edit (e.g. admin reassigns the job on the web while worker's offline edit is still queued) | Conflict is detected and surfaced, not silently overwritten in either direction | P0 | D |
| MOB-07 | Kill the app mid-sync (simulate crash) and relaunch | Offline queue survives the crash and resumes without duplicate submission | P1 | R |
| MOB-08 | Submit the same offline action twice due to a retry (simulate flaky network) | Idempotent — no duplicate job status/photo/signature record created | P0 | D |
| MOB-09 | Review `mobile-sync.html` admin page for failed/conflicted actions | Failed/conflicted items are visible and actionable by an admin | P1 | F |
| MOB-10 | Login screen on iOS and Android builds, bad credentials, network-down state | Clear error states, no crash, no plaintext credential logging | P1 | F/S |
| MOB-11 | Location permission denied on device | App degrades gracefully (no location updates) instead of crashing | P2 | R |

---

## 13. Contracts, Assets, SLA, Warranty & Preventive Maintenance

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| SLA-01 | Create a service contract with active service lines, confirm preventive-maintenance jobs auto-generate on schedule | P1 | F |
| SLA-02 | Perform a job against an asset under an **included** entitlement | Correctly billed as $0/included, not double-charged | P1 | F/D |
| SLA-03 | Perform work outside entitlement (overage) | Correctly flagged/billed as overage | P1 | F |
| SLA-04 | Perform work under active warranty | Billing protection kicks in — cannot be invoiced against the customer | P0 | D |
| SLA-05 | Let an SLA-bound job approach its deadline | Surfaces as "at risk" before breach, not only after | P1 | F |
| SLA-06 | Miss an SLA deadline entirely | Marked "breached" and reflected in contract profitability/health reporting | P1 | F |
| SLA-07 | Apply an SLA waiver | Breach status is overridden/annotated, with an audit trail of who waived it and why | P1 | D |
| SLA-08 | View asset service history | Shows linked jobs, proof, invoices, incidents, compliance docs, and parts used — all correctly attributed to that one asset | P1 | F |

---

## 14. Inventory, Procurement & Job Costing

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| INVT-01 | Set min-stock on a part, let stock fall below threshold | Triggers a purchase request/alert | P1 | F |
| INVT-02 | Create a purchase request → approve → generate PO → partially receive | Partial receipt correctly updates stock and leaves a backorder for the remainder | P1 | D |
| INVT-03 | Attempt to approve a PO above an approval threshold as a role without that authority | Blocked per approval lifecycle | P0 | S |
| INVT-04 | Use vehicle stock on a job | Job costing reflects the part's cost against that job; central/warehouse stock decrements correctly if applicable | P1 | D |
| INVT-05 | Review supplier performance report after several late/early deliveries | Numbers match actual receipt timestamps vs expected | P2 | F |
| INVT-06 | Review job costing report on a job with labor + parts + overhead | Totals reconcile against the individual line items | P1 | D |

---

## 15. Branches, Approvals, Enterprise RBAC & Audit

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ENT-01 | Create a granular permission override for one admin (e.g. can view invoices but not edit) | Override is enforced on both UI and raw API calls | P0 | S |
| ENT-02 | Trigger an approval-gated action (discount above X%, refund, PO above threshold) | Creates a pending approval record; action does not execute until approved | P0 | F/D |
| ENT-03 | Approve/reject a pending approval as an authorized approver | State transitions correctly; rejected actions do not silently apply anyway | P0 | D |
| ENT-04 | Review the audit log after a sequence of sensitive actions (role change, refund, security setting change) | Every sensitive action is logged with actor, timestamp, and target — logs cannot be edited/deleted via any exposed API | P0 | S |
| ENT-05 | Cross-branch report request as a branch-scoped admin | Only their branch's data appears, never company-wide data | P0 | S |

---

## 16. Executive Dashboards & Analytics

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| DASH-01 | Load `executive-dashboard.html` with a data-rich seeded company | Revenue leakage, branch performance, technician productivity, quote-to-cash, contract/SLA, and inventory risk widgets all render with numbers that reconcile against source records (spot-check 2–3 manually) | P1 | F/D |
| DASH-02 | Load the dashboard as a role without executive-analytics access | Blocked or shows nothing sensitive | P0 | S |
| DASH-03 | Load dashboard for a company with **zero** data (fresh tenant) | Graceful empty states, no crashes/NaNs/`undefined` rendered to the page | P1 | R |
| DASH-04 | Load dashboard for a company with a large dataset (thousands of jobs/invoices — seed synthetic data if needed) | Loads within an acceptable time (define and record actual seconds); no browser tab freeze | P1 | P |

---

## 17. Onboarding & Data Migration

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ONB-01 | Walk through `onboarding.html` checklist end-to-end for a new tenant | Each step tracked and marked complete correctly | P2 | F |
| ONB-02 | CSV import preview with a clean file | Preview accurately reflects what will be imported before committing | P1 | F |
| ONB-03 | CSV import with malformed rows (missing required fields, wrong types, duplicate rows) | Bad rows are rejected/flagged with row-level errors; the import doesn't partially corrupt data on failure | P0 | D |
| ONB-04 | CSV import with rows that duplicate existing customers | Duplicate-detection flags them rather than silently creating dupes | P1 | F |
| ONB-05 | Download a CSV template, fill it exactly as documented, re-upload | Round-trips cleanly | P2 | F |
| ONB-06 | Generate vertical demo data for an implementation project | Demo data is clearly scoped to that company and doesn't leak into other tenants | P1 | S |

---

## 18. Security Center

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| SEC-01 | `PATCH /company/security-settings` as Owner vs Admin vs Worker | Only Owner (or explicitly permitted role) can change company-wide security policy | P0 | S |
| SEC-02 | `GET /security/events` | Shows real security-relevant events (failed logins, 2FA changes, session revokes) scoped to the current company only | P0 | S |
| SEC-03 | Configure an identity provider record, then check it isn't exposing client secrets in any `GET` response | Secrets write-only, never echoed back | P0 | S |
| SEC-04 | `GET /admin/data-export/:type` for each supported type | Export contains only current company's data, correctly scoped fields, no cross-tenant leakage | P0 | S |
| SEC-05 | `GET /ops/status` as non-admin | Confirm whether this is meant to be admin-only or safe-for-all; verify it doesn't leak infra details (DB host, internal IPs) regardless of role | P1 | S |
| SEC-06 | Full walkthrough of `security-center.html` UI matches what the API actually enforces (no UI toggle that doesn't do anything server-side, and no server behavior with no UI control) | P1 | F |

---

## 19. Accounting Exports

Manual accounting exports are the supported QA target for now.

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ACC-01 | Open Finance & Exports | Page shows accounting export controls only; no giant Xero/QuickBooks/Sage “coming soon” cards | P1 | F |
| ACC-02 | Export customers CSV in ZW and SA | File downloads successfully and contains only the current region/database/company data | P0 | F/S |
| ACC-03 | Export invoices CSV in ZW and SA | File downloads successfully; invoice numbers, customer names, dates, currency, tax/VAT fields, totals, and statuses are correct | P0 | F/D |
| ACC-04 | Export payments/receipts CSV in ZW and SA | File downloads successfully; payment method, amount, currency, invoice reference, status, and receipt reference reconcile with source records | P0 | F/D |
| ACC-05 | Export tax/VAT report CSV if available | Report matches invoice totals and configured tax/VAT labels/rates for that region | P1 | D |
| ACC-06 | Attempt to export from one tenant while authenticated as another tenant | Export contains only current company data; no cross-tenant rows | P0 | S |
| ACC-07 | Export with zero invoices/payments | Download succeeds with headers or a clear empty state; no crash/500 | P2 | R |
| ACC-08 | Confirm export file names include type/date and do not expose secret/internal IDs unnecessarily | File names are useful and safe | P3 | F/S |

---

## 20. Cross-Cutting Security Test Suite

Run these against a representative sample of endpoints across every module above, not just once.

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| XSEC-01 | SQL/NoSQL injection attempts in every text input (search fields, names, notes) — Prisma parameterizes queries, but confirm no raw query concatenation anywhere (`grep -rn "\$queryRawUnsafe\|\.\+ query" src/`) | No injection possible; if raw queries exist, they must be parameterized | P0 | S |
| XSEC-02 | Stored XSS: enter `<script>alert(1)</script>` in customer name, job notes, quote line items; view in admin UI and client portal | Rendered as inert text, not executed | P0 | S |
| XSEC-03 | IDOR sweep: for every `:id` route in `src/routes/api.js`, try an ID belonging to a different tenant/role | Consistent 403/404, never data leakage (this generalizes Section 4 across the full 372-endpoint surface — spot-check at least 30–40 representative endpoints) | P0 | S |
| XSEC-04 | CORS: send a request from an origin not in `CLIENT_ORIGIN` | Blocked by CORS | P0 | S |
| XSEC-05 | CSRF: since auth is cookie-based, confirm state-changing routes require something beyond an ambient cookie (SameSite setting, custom header check, or CSRF token) | Cross-site form submission cannot trigger state changes | P0 | S |
| XSEC-06 | Helmet headers present (`X-Content-Type-Options`, `X-Frame-Options`/CSP, etc.) | Confirm via response headers on any page | P1 | S |
| XSEC-07 | Verbose error leakage: force a 500 (bad input to an internal endpoint) | Generic error returned to client; stack trace only in server logs, never in the HTTP response | P0 | S |
| XSEC-08 | Mass assignment: `PATCH` a record with extra unexpected fields (e.g. `{"role": "OWNER"}` in a profile update) | Zod schemas strip/reject unknown or forbidden fields | P0 | S |
| XSEC-09 | JWT tampering: modify the signature or payload of a valid cookie token | Rejected — signature verification enforced | P0 | S |
| XSEC-10 | Dependency audit: `npm audit` | No known-critical vulnerabilities in production dependencies (or documented risk acceptance) | P1 | S |
| XSEC-11 | Secrets-in-logs check: trigger errors involving API keys (bad Stripe key, bad WhatsApp token) and grep server logs | Keys redacted, matching the documented "logs redact common secret-like strings" behavior | P0 | S |
| XSEC-12 | File path traversal on any file-serving route (uploads, exports) using `../../` in an ID/filename parameter | Rejected, no filesystem escape | P0 | S |

---

## 21. Performance & Efficiency Test Suite

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| PERF-01 | Seed a company with realistic scale (1,000+ customers, 5,000+ jobs, 2,000+ invoices) using a scripted seeder | Baseline dataset for all perf tests below | P1 | P |
| PERF-02 | List endpoints (`/customers`, `/jobs`, `/invoices`, etc.) at scale | Pagination is present and used — no endpoint returns an unbounded full table in one response | P0 | P |
| PERF-03 | Measure response time for the 10 most-used endpoints under the seeded scale | Record actual p50/p95 latency; flag anything over ~500ms for investigation | P1 | P |
| PERF-04 | Check for N+1 query patterns on list views that join related data (e.g. jobs with customer + worker + service) | Use Prisma query logging; confirm `include`/`select` batches relations instead of looping queries | P1 | P |
| PERF-05 | Concurrent writes: two admins editing the same job/invoice simultaneously | No lost update / silent overwrite without at least optimistic handling | P1 | D |
| PERF-06 | Concurrent offline syncs: 20 simulated workers pushing sync batches at once | Server handles load without request pile-up or DB connection pool exhaustion | P1 | P |
| PERF-07 | Rate limiter behavior under legitimate burst traffic (e.g. a busy dispatcher submitting several bookings quickly) | Rate limits protect against abuse without blocking normal legitimate use — tune thresholds if false positives occur | P2 | P |
| PERF-08 | Large file uploads near the size limit (photos, signatures) on a throttled/slow network profile (use browser devtools network throttling) | Upload completes or fails gracefully with a clear progress/error state, no silent hang | P2 | P |
| PERF-09 | Executive dashboard and reports queries at scale (see DASH-04) | Acceptable load time; consider whether heavy aggregation queries need caching or pre-computation | P1 | P |
| PERF-10 | Static asset delivery (HTML/CSS/JS pages) | Reasonable page weight; no unminified bloat blocking first paint on a throttled connection | P3 | P |
| PERF-11 | Database connection handling under app restart/redeploy | No connection leak accumulating across repeated restarts (check active connection count before/after several restarts) | P2 | R |

---

## 22. Data Integrity, Audit & Backup/Restore Drill

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| DR-01 | Run a full backup per `docs/backup-plan.md` | Both DB backup and uploaded-files backup succeed and are documented as separate artifacts | P0 | R |
| DR-02 | Restore the DB backup to a clean environment | Restored company data (customers, jobs, invoices, quotes) matches pre-backup state exactly | P0 | R |
| DR-03 | Restore uploaded files backup | Proof photos and signatures reattach correctly to their job records (not orphaned) | P0 | R |
| DR-04 | Simulate losing uploads without a files backup (per the documented risk) | Confirm this is at minimum surfaced/alerted, not silently invisible | P1 | R |
| DR-05 | Follow `docs/disaster-recovery-runbook.md` literally, step by step, as if you'd never seen the system before | Every step is accurate and actually works against the current codebase (docs commonly drift from reality — this is the most valuable test in this section) | P0 | R |
| DR-06 | Financial reconciliation: total of all invoice payments recorded in the app vs total of all "paid" webhook events received | Numbers match exactly — no phantom or missing payments | P0 | D |

---

## 23. Regression & Release Sign-Off Checklist

Before marking a release GA, confirm:

- [ ] Regional env files are generated/verified: `.env.zw` and `.env.sa` use real local DB credentials, not placeholders.
- [ ] `fieldcore_zw` and `fieldcore_sa` have been reset cleanly.
- [ ] ZW server runs on `http://localhost:3000` and passes `/healthz` + `/readyz`.
- [ ] SA server runs on `http://localhost:3001` and passes `/healthz` + `/readyz`.
- [ ] All automated tests pass (`npm test`).
- [ ] You can log in as ZW owner/admin/worker and SA owner/admin/worker.
- [ ] ZW finance defaults are USD/Zimbabwe/Paynow-local; no SA digital providers appear in ZW settings.
- [ ] SA finance defaults are ZAR/South Africa/South African providers; Paynow does not appear in SA settings.
- [ ] Customer payment UI shows **Make payment online** instead of provider-choice buttons.
- [ ] Cash only appears to customers when Cash is enabled for that business.
- [ ] Bank transfer only appears to customers when Bank transfer is enabled for that business.
- [ ] Bank transfer proof-of-payment requirement behaves according to the business setting.
- [ ] Accounting UI shows CSV/export controls only; no Xero/QuickBooks/Sage coming-soon cards.
- [ ] Section 4 (multi-tenant isolation) — zero failures, no exceptions accepted.
- [ ] Section 20 (cross-cutting security) — zero P0 failures.
- [ ] Section 9/PAY (money engine) — zero P0 failures, especially webhook forgery and double-crediting.
- [ ] Section 22 (backup/restore) run at least once against current schema after any migration changes.
- [ ] `docs/mvp-signoff-checklist.md` items still hold.
- [ ] All P0/P1 defects from this run closed or explicitly risk-accepted by a named owner.
- [ ] Deployment checklist (`docs/deployment-checklist.md`) followed for the target environment.

---

## 24. Defect Log Template

| Defect ID | Test Case ID | Module | Severity | Description | Steps to Reproduce | Status | Owner |
|---|---|---|---|---|---|---|---|
| DEF-001 | | | | | | Open | |

---

## 25. Appendix — Test Data Matrix

| Data type | Minimum test values needed |
|---|---|
| Regional databases | 2 separate DBs: `fieldcore_zw`, `fieldcore_sa` |
| Regional servers | 2 running servers: ZW on port `3000`, SA on port `3001` |
| Companies | At least 1 seeded tenant per region, plus a second tenant inside each region for isolation testing |
| Branches | 2 within Company A |
| Roles | Owner, Admin, Worker ×2, Client Portal user, per company |
| Customers | ≥3 per company, including one soft-deleted |
| Jobs | Spanning statuses: scheduled, in-progress, completed, cancelled |
| Quotes | Draft, sent, accepted, rejected, expired |
| Invoices | Unpaid, partially paid, paid, overdue/collections |
| Payments | ZW: Cash, Bank transfer, Paynow/mock; SA: Cash, Bank transfer, Ozow/Yoco/PayFast/SnapScan mock as supported by current provider code; plus forged webhook attempts |
| Customer payment UI | One unpaid invoice with online enabled, one with cash disabled, one with bank transfer disabled, one with POP required |
| Accounting exports | Customers, invoices, payments/receipts, tax/VAT report where available |
| Assets/Contracts | At least one under warranty, one with an active SLA, one breached |
| Inventory | One item below min-stock, one mid-PO-lifecycle |
| Devices (mobile) | One trusted, one revoked |

---

**Notes on scope:** this plan intentionally does not re-list every API endpoint individually. Section 20 (XSEC-03) directs a representative IDOR sweep across the full surface rather than manually writing every endpoint row. If a compliance audit specifically requires per-endpoint sign-off, this document can be expanded into a full endpoint-by-endpoint matrix on request.
