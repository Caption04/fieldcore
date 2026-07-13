# FieldCore — Full-System Manual QA Test Plan

**Scope:** Every module of the FieldCore platform — Express/Prisma/PostgreSQL backend, owner signup and onboarding, mock SaaS plan selection/subscription management, company-member invitations, company-created saved roles, granular permissions and access scopes, static admin web UI, client portal, public booking/tracking portal, regional Zimbabwe/South Africa local deployments, customer payment experience, regional payment-provider setup, finance/accounting exports, business-performance analytics, and the Flutter technician mobile app.
**Dimensions covered:** Functionality, Security, Multi-tenancy, Data integrity, Performance/Efficiency, Reliability/Recovery.

> **Revision note — 12 July 2026:** Updated after the manual usability and permission audit. This revision covers dynamic company-created roles, exact checkbox-to-feature wiring, restored Business Performance analytics, explicit Full Access subscription rules, simplified Security, standard in-app notifications/modals, regional Paynow/Ozow setup, encrypted and masked provider credentials, and the payment-secret transaction fix. Re-run the changed Sections 2–5, 9, 16, 18 and 20 before continuing the wider regression.

**Companion docs already in repo (use alongside, don't duplicate):** `MANUAL_QA_SIMULATION.md` (happy-path phase 1–12 walkthrough), `docs/security-review.md`, `docs/deployment-checklist.md`, `docs/mvp-signoff-checklist.md`, `docs/disaster-recovery-runbook.md`.

This plan is organized differently from the existing simulation script: it is a **module-by-module regression + adversarial test matrix**, meant to be run before any major release, not just once at MVP. Each test case has an ID, so failures can be logged and re-tested individually.

---

## 0. How to Use This Document

- Work top to bottom for a full release regression, or pull a single module's table for a targeted re-test after a bug fix.
- Every test case row is: **ID | Steps | Expected Result | Priority | Type**.
- Type key: **F** = Functional, **S** = Security, **P** = Performance/Efficiency, **D** = Data Integrity, **R** = Reliability/Recovery.
- Priority key: **P0** = release-blocking, **P1** = must-fix before GA, **P2** = fix soon, **P3** = polish.
- Log every failure in the Defect Log template (Section 24) — don't just mark "fail" inline and move on.
- Run the automated suite first (`npm test`) — this plan assumes automated coverage is green and focuses on what automation typically misses: cross-tenant leakage, permission edge cases, scope enforcement, UI truth-vs-API truth, and real device/network conditions.

- Treat **usability as a release requirement**, not polish. Normal business-facing text should be clear at roughly Grade 5 reading level. Technical infrastructure stays in the backend or support-only tools.
- Native browser `alert()`, `confirm()`, and `prompt()` are forbidden. Use the shared FieldCore notification system for success/failure and a proper modal for confirmation or extra input.
- A permission checkbox is valid only when it is connected to a real page, action, API rule, and data scope. Remove any checkbox that promises a function the product does not provide.

### QA checkpoint after the signup/access-control and usability audit

The previous QA run reached the authentication area before several important access, reporting, payment-setup, and usability fixes were added.

Before continuing the full run:

- Re-run the changed **Section 2** account/access setup.
- Re-run **Section 3** invitation, login, logout, password and redirect cases.
- Treat **Section 4** as the main release gate: every checkbox, page, button, API and scope must agree.
- Re-run the changed **Section 5.1** Company Members flow.
- Re-run **Section 9** payment-provider setup and secret-storage cases.
- Re-run **Section 16** Business Performance and report segmentation.
- Re-run **Section 18** simplified Security page.
- Run the new UI/feedback tests in **Section 20**.

Passed tests from unchanged modules do not need to be repeated merely because a CSS or wording patch was applied.

## 0A. Before You Start Manual QA — Required Preflight

Manual QA should start from a **clean, known state**. Do not begin from a database that still contains mixed experimental tenants, old invoices, old customer payment settings, or half-configured region data.

### 0A.0 Resume safely after the signup/RBAC refactor

Because the previous QA run already reached Section 3, decide whether you are **continuing the current run** or **starting a fresh full regression**:

- **Continuing the current run:** do not reset the databases merely because the role system changed. Run the automated suite, confirm Prisma migration status is clean, restart both regional servers, then re-run the changed Section 2/3 cases and continue into Section 4.
- **Starting a fresh full regression:** use the clean-database reset procedure in 0A.3.

Before continuing either path, verify migration state for both regional databases:

```bash
cd ~/code/FieldCore_Software

set -a
source .env.zw
set +a
npx prisma migrate status

set -a
source .env.sa
set +a
npx prisma migrate status
```

Expected for both regions:

```text
Database schema is up to date!
```

Do not use `prisma migrate reset` against a database you intend to keep.

### 0A.1 Confirm the codebase is ready

Run these first:

```bash
cd ~/code/FieldCore_Software

git status --short
npm install
node --check src/routes/api.js
node --check assets/api.js
node --check assets/client-portal.js
node --check assets/layout.js
node --check assets/billing.js
node --check assets/invitations.js
node --check assets/members.js
node --check assets/form-ux.js
node --check assets/ui-feedback.js
node --check assets/enterprise-pages.js
node --check src/services/accessControl.service.js
node --check src/services/payments/paymentToken.service.js
node --check prisma/seed.js
npx prisma validate

node --test test/no-native-dialogs.test.js
node --test test/permission-ui-contract.test.js
node --test test/report-permission-wiring.test.js
node --test test/business-performance-subscription-access.test.js
node --test test/payment-provider-ui-contract.test.js
node --test test/payment-provider-secret-safety.test.js
node --test test/payment-provider-secret-storage.test.js
node --test test/payment-provider-connected-ui.test.js

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

for file in .env .env.zw .env.sa; do
  grep -q '^INTEGRATION_SECRET_MASTER_KEY_BASE64=' "$file" \
    && echo "$file: encryption key configured" \
    || echo "$file: encryption key MISSING"
done
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
- Mock payment-provider controls must not appear in a normal company dashboard. Use backend/test fixtures for automated payment simulation. In the normal company UI, ZW shows Paynow only and SA shows the currently supported SA provider only.

### 0A.6 Seeded login accounts

Password for all seeded staff accounts:

```text
FieldCoreDemo2026!
```

The legacy `OWNER / ADMIN / WORKER` value is a coarse internal classification only. It must not replace the selected access rules.

Zimbabwe server (`http://localhost:3000`):

| Seeded persona | Email | Expected access intent |
|---|---|---|
| Owner | `owner.zw@fieldcore.test` | Full company access + protected owner powers |
| Legacy Admin | `admin.zw@fieldcore.test` | Backward-compatible broad access until configured; no owner powers |
| Worker | `worker.zw@fieldcore.test` | Own/assigned field work |

South Africa server (`http://localhost:3001`):

| Seeded persona | Email | Expected access intent |
|---|---|---|
| Owner | `owner.sa@fieldcore.test` | Full company access + protected owner powers |
| Legacy Admin | `admin.sa@fieldcore.test` | Backward-compatible broad access until configured; no owner powers |
| Worker | `worker.sa@fieldcore.test` | Own/assigned field work |

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
- [ ] A fresh owner signup reaches the plan-selection gate before normal dashboard access.
- [ ] Monthly/annual pricing renders and the annual option shows the configured saving.
- [ ] Mock plan confirmation performs no real external payment.
- [ ] Log out works from the top-right profile menu.
- [ ] **FieldCore Subscription** appears only for the owner or a non-owner explicitly marked Full Access with company-wide scope.
- [ ] A restricted account cannot see the Subscription menu item and receives `403` from direct billing APIs.
- [ ] A seeded owner can open Company Members and create a company-specific role/access setup.
- [ ] Permission master checkboxes visibly check/uncheck and stay synchronized with every child checkbox.
- [ ] Reports appears for the owner and Business Performance is present.
- [ ] Finance settings show only Paynow setup on ZW and only the supported SA provider setup on SA.
- [ ] No mock provider, webhook URL, endpoint, country code, currency code, or test/live field appears in the normal company UI.
- [ ] Saved provider credentials are masked, locked, and never returned in full.
- [ ] No native browser alert/confirm/prompt appears in any tested flow.
- [ ] The customer payment page shows a generic **Make payment online** action, not provider-choice buttons.

---
## 1. Test Environment Setup

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ENV-01 | Fresh clone or current repo, `cp .env.example .env` if needed, fill a real local `DATABASE_URL` and a long random `JWT_SECRET` | App uses real local values; production mode refuses placeholder `JWT_SECRET` | P0 | S |
| ENV-02 | Run `npm install`, `npx prisma validate`, and syntax checks for changed JS files including access control, billing, invitation, member, and layout scripts | Dependencies install and syntax checks pass with no parser errors | P0 | F |
| ENV-03 | Run `npm run env:regions` if present, then inspect `.env.zw` and `.env.sa` | Regional env files reuse the working `.env` database credentials, change only DB name/region/port, and do not contain placeholder `USER:PASSWORD` | P0 | F/S |
| ENV-04 | For a fresh full regression only: create/reset `fieldcore_zw` and `fieldcore_sa`, then run `npm run db:reset:zw` and `npm run db:reset:sa` | Clean databases are reset and seeded without manual Prisma migration prompts | P0 | F |
| ENV-05 | `npm test` | All automated tests pass with 0 failures before manual QA starts | P0 | F |
| ENV-06 | `npm run dev:zw`, hit `http://localhost:3000/healthz` and `/readyz` | ZW server is healthy and connected to `fieldcore_zw` | P0 | R |
| ENV-07 | `npm run dev:sa`, hit `http://localhost:3001/healthz` and `/readyz` | SA server is healthy and connected to `fieldcore_sa` | P0 | R |
| ENV-08 | Log into both regional owner accounts in separate browser profiles/windows | ZW and SA sessions do not share cookies/localStorage in a way that confuses the UI | P0 | S/R |
| ENV-09 | Kill Postgres temporarily and hit `/readyz` on both servers | `/readyz` reflects real DB connectivity failure instead of claiming healthy | P0 | R |
| ENV-10 | Run destructive reset command with `NODE_ENV=production` set | Command refuses to run in production | P0 | S |
| ENV-11 | Start app with a bad `DATABASE_URL` | App fails fast with a clear log, not a silent hang or crash loop | P1 | R |
| ENV-12 | Confirm `.env`, `.env.zw`, `.env.sa`, `.env.backup`, and any `*.log` files are not committed / not served statically | No secrets reachable via direct URL such as `GET /.env` or `GET /server.log` | P0 | S |
| ENV-13 | Load `.env.zw`, run `npx prisma migrate status`; repeat with `.env.sa` | Both regional databases report **Database schema is up to date!** and no `P3005` baseline error remains | P0 | D/R |
| ENV-14 | Inspect the migration table/history after a fresh reset or current baseline | Existing migrations are recorded consistently; future `npx prisma migrate deploy` does not attempt to replay the initial schema over a non-empty DB | P0 | D/R |
| ENV-15 | Directly request `plan-selection.html`, `subscription.html`, `members.html`, and `accept-invite.html` as appropriate authenticated/unauthenticated users | Public/authenticated page guards match the intended lifecycle; no protected data is exposed merely by loading an HTML page | P1 | S/F |

## 2. Accounts, Saved Roles & Access Matrix

Run QA against both regional deployments. Treat ZW and SA as separate local products unless a test explicitly asks for cross-region comparison.

### 2.1 Authorization model under test

FieldCore must separate these ideas:

```text
ACCOUNT TYPE USED INTERNALLY
OWNER / ADMIN / WORKER

COMPANY ROLE
A company-created name such as Finance Manager, PA, Dispatch Lead, or Finance and Operations Manager

ACCESS
The exact tools/actions selected for that person

AREA
Whole company, selected branch, selected team, or own work
```

The internal classification must never silently grant full access. The company role name is descriptive and reusable; authorization comes from the selected permissions and scope.

### 2.2 Dynamic role rules

- Do not depend on a fixed list of roles such as Accountant or COO.
- A company may create a role while inviting a member and save it for reuse.
- A saved role is a reusable permission bundle, not hard-coded behavior.
- Hybrid positions must be possible by combining the required permission areas.
- The interface must show, in plain language, exactly what a saved role can do.
- Changing one person's access must not silently change every other person using the same saved role unless the role itself is deliberately edited.
- **Full Access** is an explicit account setting. It is not inferred merely because many boxes happen to be selected.
- Full Access grants all delegatable company tools but never ownership.
- Subscription access requires actual OWNER status or explicit Full Access with COMPANY scope.

### 2.3 Seeded regional accounts

#### Zimbabwe — `http://localhost:3000`

| Seeded persona | Email | Expected access |
|---|---|---|
| Owner | `owner.zw@fieldcore.test` | Full company access, Business Performance, subscription, and protected ownership actions |
| Legacy Admin | `admin.zw@fieldcore.test` | Backward-compatible broad access only until configured through the new access system; never ownership |
| Field Worker | `worker.zw@fieldcore.test` | Own/assigned work and worker-app functions |

#### South Africa — `http://localhost:3001`

| Seeded persona | Email | Expected access |
|---|---|---|
| Owner | `owner.sa@fieldcore.test` | Full company access, Business Performance, subscription, and protected ownership actions |
| Legacy Admin | `admin.sa@fieldcore.test` | Backward-compatible broad access only until configured through the new access system; never ownership |
| Field Worker | `worker.sa@fieldcore.test` | Own/assigned work and worker-app functions |

### 2.4 Required custom QA accounts

Create these through **Company Members**. The names are test examples, not fixed product roles.

| Test account | Access to grant | Access to withhold |
|---|---|---|
| Full-access manager | Explicit Full Access, whole company | Ownership |
| Money-only account | Payment access, money settings/exports as selected, chosen money reports | Jobs, workers, scheduling unless separately selected |
| Operations-only account | Jobs, schedule and workers as selected | Money and subscription |
| Hybrid finance/operations account | Selected Money + selected Jobs/Workers/Reports | Anything not selected |
| Team supervisor | Selected worker/job tools, Team A scope | Team B and company-wide data |
| Branch manager | Selected tools, Branch 1 scope | Branch 2 data |
| Restricted account | One or two narrow permissions | Every unrelated module |
| Field-app hybrid account | Worker app enabled plus selected office tools | Unselected office tools |
| Second-tenant owner | Full access in Company B only | All Company A data |

### 2.5 Permission-area contract

Each visible checkbox must map to a real function. The major areas must remain separate:

| Area | Examples of valid controls |
|---|---|
| Customers | View, add, edit, delete customers |
| Jobs | View, create, edit, assign, cancel, review jobs |
| Schedule | View schedule, change schedule, override conflicts where supported |
| Workers | View, manage, view location, manage teams |
| Quotes | View, create, edit, send, approve discounts where supported |
| Invoices | View, create, edit, send, void |
| Money | View/manage payments, approve refunds, change money settings, download money files, manage accounting links |
| Reports | Business Performance, money reports, job reports, worker reports, sales/customer reports, stock reports |
| Company | Company details, branding, job defaults and other real settings |
| Members | View/invite/manage members and saved roles |
| Security | View account security activity and manage allowed security settings |
| Connected apps | View or manage real connections only |
| Subscription | No normal checkbox; owner or explicit Full Access + COMPANY scope only |

A label such as **View money reports** must not unlock worker or SLA reports. Reports are controlled by their own report permissions.

### 2.6 Regional defaults

#### Zimbabwe

| Setting | Expected |
|---|---|
| Country/market | Zimbabwe / `ZW` |
| Currency | `USD` |
| Timezone | `Africa/Harare` |
| Customer payment methods | Cash, Bank transfer, Paynow |
| Company provider setup | Paynow Integration ID + Paynow Integration Key only |
| SA providers | Hidden and rejected by backend |

#### South Africa

| Setting | Expected |
|---|---|
| Country/market | South Africa / `SA` or `ZA`, used consistently |
| Currency | `ZAR` |
| Timezone | `Africa/Johannesburg` |
| Customer payment methods | Cash, Bank transfer, and currently supported SA online provider |
| Company provider setup | Only the credentials required by the supported SA provider |
| Paynow | Hidden and rejected by backend |

### 2.7 Minimum scope and tenant setup

| Entity/persona | Minimum setup | Purpose |
|---|---|---|
| Company A | Primary tenant | Main tests |
| Company B | Second tenant in same regional DB | Tenant isolation |
| Branch 1 + Branch 2 | Company A | Branch scope |
| Team A + Team B | Company A | Team scope |
| Owner | Company A | Ownership boundary |
| Full-access non-owner | Company A | Explicit Full Access boundary |
| Money-only member | Company A | Money/report segregation |
| Operations-only member | Company A | Operations-without-money boundary |
| Hybrid member | Company A | Dynamic mixed access |
| Team supervisor | Company A / Team A | Team boundary |
| Field workers A1 + A2 | Company A | Self/worker boundary |
| Client Portal user | Company A | Customer boundary |
| Owner + Worker | Company B | Cross-tenant boundary |

## 3. Authentication & Session Security

Because the previous QA run reached this section before the signup/access-control refactor, **re-run all P0/P1 cases below**.

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| AUTH-01 | Open the new registration flow and complete Step 1 with owner name, work email, password, and confirmation | Validation is clear; no password/password hash is returned or logged | P0 | F/S |
| AUTH-02 | Continue to business basics and enter company name, country/market, business vertical, and approximate team size | Company metadata is stored; unsupported/unknown vertical falls back safely to generic saved roles | P0 | F/D |
| AUTH-03 | After account/business creation, try to navigate directly to a normal protected app page before selecting a plan | User is redirected to the required plan-selection step; no redirect loop; public/auth pages remain reachable | P0 | S/F |
| AUTH-04 | On plan selection, toggle Monthly ↔ Annual | Same plans render from backend plan data; annual view shows configured saving percentage, annual total, equivalent monthly cost, and absolute saving | P0 | F/D |
| AUTH-05 | Choose a normal paid plan in Monthly mode | Confirmation modal clearly shows plan, interval, and amount; no card form or external payment provider is opened | P0 | F/S |
| AUTH-06 | Confirm the mock plan selection | Selected plan + billing interval persist; onboarding gate completes; user enters dashboard; no external payment API is called | P0 | F/D |
| AUTH-07 | Repeat with Annual mode on another fresh tenant | Annual interval persists and calculated amount matches the central pricing rule, not a duplicated hard-coded frontend value | P0 | D |
| AUTH-08 | Choose Enterprise / Contact us | Contact/request modal opens; request is recorded; no real checkout occurs; Enterprise is **not silently activated as a paid live subscription** | P0 | F/D |
| AUTH-09 | Verify trial behavior for a newly selected non-enterprise plan | The configured **30-day free trial** is represented consistently; mock plan selection does not falsely claim a real external charge occurred | P0 | F/D |
| AUTH-10 | Login with correct credentials | HTTP-only, secure (in prod), `SameSite`-appropriate cookie issued; response never includes `passwordHash` | P0 | S |
| AUTH-11 | Login with wrong password repeatedly (exceed `RATE_LIMIT_AUTH_MAX`, default 20/15min) | Requests beyond the limit are throttled with a clear error, not a 500 | P0 | S |
| AUTH-12 | Inspect JWT payload (decode, don't verify) | Contains only necessary identifiers/claims — no password, permission secrets, invite token, 2FA secret, or unnecessary PII | P1 | S |
| AUTH-13 | Log out, then reuse the old cookie value on a protected route | Rejected — session/cookie invalidated server-side, not just cleared client-side | P0 | S |
| AUTH-14 | Enable 2FA as an authorized user, log out, log back in | Login requires second factor before issuing a full session | P0 | S |
| AUTH-15 | Generate recovery codes, disable authenticator access, use a recovery code to log in | Recovery code works once, then is invalidated | P1 | S |
| AUTH-16 | Attempt to disable 2FA without required proof | Rejected — disabling 2FA requires the documented proof-of-possession flow | P0 | S |
| AUTH-17 | Open 3 sessions, revoke one via the session-management API/UI | Revoked session stops working immediately; other sessions remain valid | P0 | S |
| AUTH-18 | Revoke all sessions | Behavior matches documented intent and does not leave supposedly revoked sessions usable | P1 | F/S |
| AUTH-19 | As owner, invite a new company member by email, select a saved role, customize permissions, and choose COMPANY/BRANCH/TEAM/SELF scope | Invitation record is created with normalized email and correct requested access; no password is created by the inviter | P0 | F/S |
| AUTH-20 | Inspect invitation storage/API responses | Plaintext invite token and token hash are never exposed; stored token is hashed; expiration exists | P0 | S |
| AUTH-21 | Open a valid invitation link, set and confirm a password, accept | Invitee sees the inviting company/intended role, creates their own password, invitation becomes single-use, and account receives the intended saved role/permissions/access area | P0 | F/S |
| AUTH-22 | Reuse an accepted invitation link | Rejected; no second account/access grant is created | P0 | S/D |
| AUTH-23 | Try an expired invitation | Rejected cleanly | P0 | S |
| AUTH-24 | Revoke a pending invitation, then try the old link | Rejected; revoked invite cannot be accepted | P0 | S |
| AUTH-25 | Invite an email already belonging to an existing FieldCore user | Existing account is not hijacked or silently rebound to another company; behavior follows explicit safe membership rules | P0 | S |
| AUTH-26 | Client portal register/login/logout/forgot-password | Client session remains separate from internal staff session; client cookie cannot access staff routes | P0 | S |
| AUTH-27 | Attempt direct role/access changes as a user without the required member/role/permission-management authority | Rejected server-side even if a UI control is manually exposed via devtools | P0 | S |

| AUTH-28 | Use the top-right **Log out** action from a normal page and an Enterprise page | Session is ended, user reaches login, and no stale protected page remains usable | P0 | F/S |
| AUTH-29 | Log in with a restricted account whose first allowed page is not Dashboard | User is sent to the first page they may use; no `ERR_TOO_MANY_REDIRECTS` loop | P0 | F/S |
| AUTH-30 | Log in with an account that currently has no tools | A simple no-access page appears; no redirect loop | P0 | F |
| AUTH-31 | Trigger a success, validation failure and destructive confirmation in the auth/member flows | Standard in-app notification/modal is used; no native browser dialog | P0 | F |
| AUTH-32 | Use the local QA invitation test-link flow | A real one-time URL is displayed through the in-app modal/notification; copied URL never contains `[redacted]` or an extra backslash | P0 | F/S |

### Authentication/onboarding completion check

Before continuing to Section 4, have at least these accounts available in **one** regional database:

- Owner.
- Explicit Full Access non-owner with COMPANY scope.
- Money-only member.
- Operations-only member.
- Hybrid money/operations member.
- Team Supervisor scoped to Team A.
- Normal field worker.
- Restricted/no-tools member.
- Second tenant owner.

These are required for the adversarial authorization matrix below.

## 4. Authorization, RBAC & Multi-Tenant Isolation (highest priority section)

This is the **highest-priority release gate** after the access-control refactor. A hidden menu item is not proof of security. For P0 cases, test the UI **and** the raw API request.

### 4.1 Tenant isolation

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| TEN-01 | As Company A owner, note IDs for a customer, job, quote, invoice, worker, asset, contract, team, saved role, and invitation | Test IDs available | — | — |
| TEN-02 | Login as Company B owner and directly request Company A records by ID | Every request returns 404/403 — never the record, even partially | P0 | S |
| TEN-03 | As Company B, list customers/jobs/quotes/invoices/workers/assets/teams/saved roles | Company A records never appear, including in pagination/search results | P0 | S |
| TEN-04 | As Company B worker, hit worker/mobile endpoints with a Company A job/worker/team ID | Rejected without leaking whether the foreign record exists | P0 | S |
| TEN-05 | As Client Portal user, request another customer's records or any staff-only route | Rejected with 401/403/404 as appropriate | P0 | S |
| TEN-06 | Tamper with `companyId` in request bodies during create/update/invite/team/role operations | Server ignores or rejects client-supplied tenant ownership; authenticated company context wins | P0 | S |
| TEN-07 | Create data in ZW and search/list for it in SA; repeat SA → ZW | No cross-region leakage | P0 | S/D |

### 4.2 Permission authority — backend must match the UI

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| RBAC-01 | As Accountant, open invoices/payments/finance reports that were explicitly granted | Allowed | P0 | F/S |
| RBAC-02 | As Accountant, directly call quote-send, job-assignment, schedule-mutation, worker-location, team-management, or other operations endpoints not granted | 403/404; coarse `ADMIN` classification must not bypass missing permissions | P0 | S |
| RBAC-03 | As Operations Manager, access jobs/scheduling/workforce modules granted to them | Allowed | P0 | F/S |
| RBAC-04 | As Operations Manager without financial permissions, call financial dashboard, invoice/payment/report/export endpoints directly | Sensitive finance data is not returned | P0 | S |
| RBAC-05 | As a user with `invoices.view` but not invoice mutation/send permissions, view an invoice then attempt direct edit/send/void/payment mutation | View succeeds; unauthorized actions fail server-side | P0 | S |
| RBAC-06 | As a user with `quotes.view` but not quote mutation/send permissions, attempt direct create/edit/send/accept/reject/delete actions | Only specifically granted actions succeed | P0 | S |
| RBAC-07 | As a user with `schedule.view` but not `schedule.manage`, attempt reschedule/delete/override | Rejected | P0 | S |
| RBAC-08 | As a user with worker visibility but not worker management/location permission, attempt worker edit/deactivate/location-history access | Rejected according to the exact missing permission | P0 | S |
| RBAC-09 | Open a protected page by URL without the required page/module permission | Page is blocked/redirected and underlying APIs also reject access | P0 | S |
| RBAC-10 | Manipulate frontend/localStorage permission data to make a hidden menu item appear | Backend still rejects unauthorized API requests | P0 | S |

### 4.3 Permission checkbox wiring contract

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| PERM-01 | Review every visible permission checkbox in Company Members | Every checkbox has a documented page/action/API/data effect; no placeholder or dead checkbox remains | P0 | F/S |
| PERM-02 | Select **Give access to all company tools** | The master checkbox visibly checks and all delegatable child permissions become checked | P0 | F |
| PERM-03 | Uncheck the Full Access master checkbox | All child permissions become unchecked and the explicit Full Access account flag is cleared | P0 | F/S |
| PERM-04 | Manually select every delegatable permission | Child selections remain saved; the UI may show all selected, but Subscription still requires the explicit Full Access setting rather than inferred selection | P0 | S |
| PERM-05 | Remove one selected child permission after Full Access was enabled | Full Access is cleared or the UI clearly requires confirmation; no account remains marked Full Access while missing a tool | P0 | F/S |
| PERM-06 | Toggle **Works in the field** | Checkbox displays its true state; worker-app access/classification changes correctly without erasing separately granted office tools | P0 | F/S |
| PERM-07 | Save a restricted permission set, log in as that member and inspect sidebar/profile/quick-create/buttons | Only matching sections and actions are shown | P0 | F/S |
| PERM-08 | Call a hidden action's API directly | Backend returns 403/404; hiding UI is not the only control | P0 | S |
| PERM-09 | Select a permission that depends on view access, such as Manage payments or Download reports | Required view permission is automatically included or the UI clearly blocks the invalid combination | P1 | F |
| PERM-10 | Clear an area's **Select all/Clear** control | Every checkbox in that area and the area's visual state update correctly | P0 | F |
| PERM-11 | Compare the Money section with the Reports section | Money contains payment/settings/export/connection actions only; analytics categories stay under Reports | P0 | F |
| PERM-12 | Give a user money permissions only | No New Job, quote, invoice, worker or unrelated Quick Create controls appear unless separately granted | P0 | S/F |
| PERM-13 | Give invoice view without invoice creation | Invoice list/detail may appear; New Invoice is hidden and create API is denied | P0 | S/F |
| PERM-14 | Give report access without source-module management access | The permitted report renders read-only data, but management controls for the source module stay hidden/denied | P0 | S/F |

### 4.4 Protected owner powers vs Full Access

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| OWN-01 | Give a non-owner COO **Full Access** | They receive all delegatable permissions and broad company operation access | P0 | F/S |
| OWN-02 | As that Full Access COO, attempt to transfer ownership | Rejected | P0 | S |
| OWN-03 | Attempt to delete the company/account | Rejected unless explicitly defined as an owner-only action and actor is actual owner | P0 | S |
| OWN-04 | Attempt to remove/demote the final owner | Rejected | P0 | S/D |
| OWN-05 | Attempt to make self an OWNER by editing profile/member payloads or saved-role metadata | Rejected; no self-escalation | P0 | S |
| OWN-06 | As actual owner, perform legitimate owner-only action in a safe test environment | Allowed and audited | P0 | F/D |

### 4.5 Delegation security

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| DEL-01 | Give a restricted user only `members.invite`, not broad permission-management authority; have them invite another user with Full Access or permissions they do not possess | Server rejects the over-delegation | P0 | S |
| DEL-02 | Same actor attempts to grant a broader branch/team/company scope than they are authorized to administer | Rejected | P0 | S |
| DEL-03 | Authorized owner/permission administrator grants a permitted subset of their delegatable authority | Succeeds | P0 | F/S |
| DEL-04 | User attempts to edit their own permissions/saved role/access area to gain more access | Rejected unless explicitly authorized by a higher-level policy; self-escalation must not occur | P0 | S |
| DEL-05 | Change another member's saved role from broad admin → field worker | Effective permissions shrink and coarse system classification/navigation no longer leave old hidden admin access | P0 | S/D |
| DEL-06 | Promote a field worker → management saved role | User can access the permitted management web modules and is not trapped in worker-only UI/route behavior | P0 | F/S |

### 4.6 Scope enforcement

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| SCP-01 | COMPANY-scoped manager lists jobs/workers/teams they have permission to view | Sees the permitted company-wide data | P0 | F/S |
| SCP-02 | BRANCH-scoped manager for Branch 1 requests Branch 2 jobs/workers/reports directly by ID and through list/search APIs | Branch 2 data is excluded/rejected server-side | P0 | S |
| SCP-03 | TEAM-scoped supervisor for Team A lists jobs and workers | Only Team A data appears | P0 | S |
| SCP-04 | TEAM-scoped supervisor directly requests Team B job/worker/schedule data | Rejected | P0 | S |
| SCP-05 | SELF-scoped field worker lists jobs/schedule | Only own/assigned work appears | P0 | S |
| SCP-06 | SELF-scoped field worker requests another worker's job/location/profile | Rejected | P0 | S |
| SCP-07 | Grant a permission through a TEAM/BRANCH scope and call a resource endpoint that uses the same permission | Permission is not treated as globally company-wide; resource query also enforces scope | P0 | S |
| SCP-08 | Change a user's scope and refresh/re-login | New scope takes effect consistently in navigation, lists, detail routes, reports, and mutations | P0 | S/D |

### 4.7 Dashboard and reporting data segmentation

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| DASH-AUTH-01 | Operations Manager with operational dashboard permission but no financial dashboard permission loads dashboard | Operational widgets render; revenue, unpaid totals, profit/margin, and other finance-only metrics are omitted or blocked | P0 | S |
| DASH-AUTH-02 | Accountant with financial dashboard permission but no workforce-location permission loads dashboard | Finance widgets render; restricted worker/location data does not | P0 | S |
| DASH-AUTH-03 | Executive with explicit executive/financial/operational dashboard permissions loads dashboard | Full permitted dashboard renders | P0 | F/S |
| DASH-AUTH-04 | Branch/team-scoped manager loads reports/dashboard | Aggregates contain only in-scope records | P0 | S/D |

### 4.8 Company-created saved roles

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ROLE-01 | Create a new company role while inviting a member | The selected permissions and default access area can be saved for reuse inside that company | P0 | F |
| ROLE-02 | Create a role from scratch in a company with no saved roles | No fixed generic FieldCore role is forced into the UI | P0 | F |
| ROLE-03 | Assign the same saved role to two members, then add a personal exception to one | Only the selected member changes; the shared saved role and second member remain unchanged | P0 | D |
| ROLE-04 | Deliberately edit the shared saved role | All members using that shared role update only after clear confirmation | P1 | D/F |
| ROLE-05 | Company B attempts to list/use/edit Company A's saved role by ID | Rejected/not visible | P0 | S |
| ROLE-06 | Create a hybrid role using permissions from Money, Jobs, Workers and Reports | Mixed access works without needing a fixed pre-named role | P0 | F/S |
| ROLE-07 | Review a saved role before assigning it | Plain summary clearly states what it can do and which work it can see | P1 | F |
| ROLE-08 | Delete or retire a saved role already used by members | Existing access is handled safely; no silent full-access fallback or orphaned user | P0 | D/S |

### 4.9 Auditability

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| AUD-ACCESS-01 | Create/resend/revoke/accept an invitation | Each sensitive event is audited without plaintext token/password | P0 | S/D |
| AUD-ACCESS-02 | Change saved role, permissions, Full Access, or scope | Actor, target, timestamp, and safe metadata are audited | P0 | D |
| AUD-ACCESS-03 | Attempt blocked privilege escalation | Security/authorization failure is safely logged where intended without leaking secrets | P1 | S |

## 5. Core Business Objects — Customers, Services, Workers

The new company-member/team model must be tested separately from customers. **Customers are not company members.**

### 5.1 Company Members, invitations, saved roles and teams

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| MEM-01 | Open Company Members as owner/authorized member manager | Active members and pending invitations are separate; customers are not mixed into staff | P0 | F |
| MEM-02 | View the member list as a non-owner | Other principal owners are hidden; the signed-in person's own row is shown as **You** | P0 | S/F |
| MEM-03 | Open Invite Member | Email and one clear Role field appear; no duplicate Job title/Role inputs and no technical internal-classification field | P0 | F |
| MEM-04 | Create a new role while inviting and choose exact permissions | The role can be saved for reuse; no generic FieldCore roles are forced on the company | P0 | F |
| MEM-05 | Use an existing saved role, then change this person's permissions only | The person's override changes without silently modifying other members | P0 | D |
| MEM-06 | Test the Full Access and Works in the field checkbox behavior | Visible check state and saved backend state agree; master/child synchronization follows PERM-02–PERM-06 | P0 | F/S |
| MEM-07 | Set Whole company access | No second selector is required; UI does not show a meaningless disabled scope field | P1 | F |
| MEM-08 | Set Branch or Team access | A plain-language selector appears for the branch/team and the backend enforces it | P0 | F/S |
| MEM-09 | Send invitation in console/local QA mode | In-app notification/modal provides a valid copyable test link; no browser alert and no redacted token is treated as usable | P0 | F/S |
| MEM-10 | Accept invite and create password | Account receives only selected access; no default full control is added | P0 | S |
| MEM-11 | Resend or revoke an invite | Proper confirmation modal/notification appears; Revoke uses clear danger styling | P1 | F |
| MEM-12 | Edit role, permissions and access area after acceptance | Changes persist and take effect after refresh/login without stale access | P0 | S/D |
| MEM-13 | Disable/reactivate a member | Confirmation modal is used; disabled account/session behavior follows policy and history remains | P0 | S/D |
| MEM-14 | Create Team A/Team B and manage membership | Teams and grants stay company-scoped | P0 | F/S |
| MEM-15 | Review tables at normal desktop width | Name, email, role, access, status and actions do not overlap or force avoidable horizontal scrolling | P1 | F |
| MEM-16 | Inspect all member-facing labels and help text | Clear everyday language is used; no ADMIN/WORKER classification, scope jargon, permission keys, JSON or developer terms are exposed | P1 | F |

### 5.2 Customers, services and workers

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| CORE-01 | Create/edit/delete a customer with valid and invalid data (missing name, malformed email/phone) | Zod validation rejects bad input with a clear message; valid input persists correctly | P1 | F |
| CORE-02 | Soft-delete a customer, then attempt normal retrieval and recovery flow | Soft-deleted record disappears from normal views but is recoverable through the intended path | P1 | D |
| CORE-03 | Create a service with pricing, mark inactive, confirm it disappears from new-quote pickers but historic quotes referencing it still render correctly | Historic integrity preserved | P2 | F/D |
| CORE-04 | Create a worker, set role/availability, deactivate, confirm deactivated worker cannot use field-worker login/workflow but historic job assignments remain intact | Access blocked; history preserved | P1 | D/S |
| CORE-05 | Attempt duplicate customer creation (same email/phone) | Actual dedup behavior matches documented intent — blocked or clearly flagged | P2 | F |
| CORE-06 | Upload a customer/company logo via branding settings | Accepted only for configured image MIME types and size limit; oversized/wrong-type files rejected | P1 | S |
| CORE-07 | Promote an existing field worker into an office/management access setup | WorkerProfile/history is preserved; new management access follows saved access/permissions without duplicate user records | P1 | D/F |
| CORE-08 | Demote an office admin to field-work access setup | Legacy admin access is removed; worker-specific prerequisites are handled explicitly | P0 | S/D |

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

## 9. Invoicing, Customer Payments & FieldCore Subscription

### 9.1 Invoices and customer payment choices

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| INV-01 | Generate invoice from a completed job/quote in ZW | Correct USD totals, tax labels, prefix and due date | P0 | F |
| INV-02 | Generate invoice from a completed job/quote in SA | Correct ZAR totals, tax labels, prefix and due date | P0 | F |
| INV-03 | Change tax/payment-term settings, then create a new invoice | New invoice uses new settings; historic invoices do not silently change | P1 | D |
| INV-04 | Generate a payment link | Link is bound to the correct invoice/company/amount | P0 | S |
| PAY-01 | Toggle Cash and Bank transfer settings | Customer payment page shows only enabled methods | P0 | F |
| PAY-02 | Enable proof of payment for Bank transfer | Customer sees clear instructions and working upload/submission behavior | P1 | F |
| PAY-03 | On an unpaid invoice with online payment enabled | Customer sees generic **Make payment online**, not provider selection | P0 | F |
| PAY-04 | Forge an unsigned provider webhook | Rejected | P0 | S |
| PAY-05 | Replay a valid webhook | Idempotent; invoice is not credited twice | P0 | D |
| PAY-06 | Trigger reminder twice quickly | Reminder policy prevents spam/duplicate send | P1 | F |
| PAY-07 | Attempt refund without approval permission | Rejected or placed in approval flow | P0 | S |
| PAY-08 | Complete an authorized refund | Invoice/payment/collection state reconciles correctly | P1 | D |

### 9.2 Company payment-provider setup

This setup is for **the business's customers paying that business**. It is separate from businesses paying FieldCore for their subscription.

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| PROV-01 | Open payment setup on ZW | Paynow only; no Ozow, mock provider or manual developer provider card | P0 | F |
| PROV-02 | Open payment setup on SA | Only the currently supported SA provider; Paynow hidden | P0 | F |
| PROV-03 | Inspect visible provider fields | Only credentials the business receives from its provider are requested; no webhook URL, endpoint, result URL, country/currency code or test/live input | P0 | F/S |
| PROV-04 | Inspect wording | Plain business language; no JSON, webhook, callback, API endpoint or QA jargon in normal UI | P1 | F |
| PROV-05 | Save valid Paynow Integration ID and Integration Key | Backend fills regional/technical configuration, encrypts credentials and marks connection saved/connected according to test result | P0 | F/S |
| PROV-06 | Confirm server environment | `INTEGRATION_SECRET_MASTER_KEY_BASE64` is configured, valid and never exposed to browser/logs | P0 | S |
| PROV-07 | Inspect database/API after save | Provider secrets are AES-256-GCM encrypted at rest; plaintext and encryption master key are absent from API responses | P0 | S |
| PROV-08 | Reload payment setup | Saved credential fields are disabled and show masked values only; full value cannot be revealed or copied | P0 | S/F |
| PROV-09 | Inspect DOM/network response | Full saved credential is not present in HTML, JS state, input value, JSON response or browser storage | P0 | S |
| PROV-10 | Click **Update connection** | Fields unlock empty for replacement; button becomes **Save changes** and Cancel returns to locked masked state | P1 | F |
| PROV-11 | Replace only one saved credential and leave the other blank | Existing untouched encrypted value is kept; replacement updates atomically | P0 | D/S |
| PROV-12 | Force encryption failure while an old credential exists | Old credential remains intact; API returns clear safe error rather than deleting first | P0 | D/S |
| PROV-13 | Click **Check connection** | Uses backend-held decrypted credentials; result shown by standard notification, never revealing secrets | P0 | F/S |
| PROV-14 | Attempt to add a provider from the wrong region by raw API | Rejected | P0 | S |
| PROV-15 | Run the payment-link webhook test after secret-storage changes | Provider creation returns expected success and trusted webhook confirms payment idempotently | P0 | F/D |
| PROV-16 | Inspect normal company UI for mock provider | Mock/testing provider controls are absent; automated tests use backend fixtures only | P0 | F/S |
| PROV-17 | Save or update provider credentials | No native alert/confirm/prompt; standard notification/modal is used | P0 | F |

### 9.3 FieldCore subscription

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| BILL-01 | Open profile dropdown as owner | FieldCore Subscription appears and loads | P0 | F |
| BILL-02 | Open dropdown as explicit Full Access non-owner with COMPANY scope | Subscription appears | P0 | F/S |
| BILL-03 | Open dropdown as restricted, money-only, branch-scoped, team-scoped, or manually-all-checkboxes-but-not-explicit-Full-Access account | Subscription item is hidden | P0 | S |
| BILL-04 | Directly request subscription page/API as a restricted account | 403/blocked | P0 | S |
| BILL-05 | Toggle Monthly/Annual | Shared backend plan data and central annual calculation used | P0 | F/D |
| BILL-06 | Confirm a normal mock plan change | In-app modal; no real external checkout | P0 | F/S |
| BILL-07 | Select Enterprise Contact us | Request recorded; no live paid Enterprise activation | P0 | D |
| BILL-08 | Inspect trial state | 30-day trial behavior remains consistent | P0 | D |
| BILL-09 | Inspect normal Money permission choices | No standalone subscription checkbox appears | P0 | F/S |
| BILL-10 | Attempt to infer Full Access by manually selecting every permission | Subscription remains hidden unless explicit Full Access flag is set | P0 | S |

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
| ENT-01 | Create a granular member-specific permission override (e.g. view invoices but not edit/send) | Override is enforced in UI and raw API | P0 | S |
| ENT-02 | Create a custom company saved role and assign it to two members | Both receive the saved role defaults; member-specific override affects only the targeted member | P0 | D/S |
| ENT-03 | Change a member from one saved role to another | Effective permissions and coarse classification transition safely; no stale access remains | P0 | S/D |
| ENT-04 | Give a non-owner Full Access | All delegatable permissions available; protected owner actions remain blocked | P0 | S |
| ENT-05 | Restricted member attempts to delegate permissions/scope they do not control | Rejected | P0 | S |
| ENT-06 | Branch-scoped admin requests cross-branch data/report | Only in-scope branch data appears | P0 | S |
| ENT-07 | Team-scoped supervisor requests another team's worker/job/schedule | Rejected | P0 | S |
| ENT-08 | Trigger an approval-gated action (discount above threshold, refund, PO above threshold) | Creates pending approval; action does not execute until approved | P0 | F/D |
| ENT-09 | Approve/reject a pending approval as an authorized approver | State transitions correctly; rejected action does not apply | P0 | D |
| ENT-10 | Review audit log after invitation, role, permission, scope, refund, and security changes | Sensitive actions logged with actor/timestamp/target; no plaintext token/password/secrets; logs cannot be edited/deleted via exposed API | P0 | S/D |

## 16. Reports & Business Performance

The detailed Business Performance feature is release-critical. Permission changes may hide unauthorized parts, but must never delete or replace the analytics feature itself.

### 16.1 Reports navigation and categories

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| RPT-01 | Log in as owner | Reports section is visible and **Business Performance** is available | P0 | F |
| RPT-02 | Log in as a user with no report permission | Reports section is hidden and direct report requests are denied | P0 | S |
| RPT-03 | Grant only money-report access | Only money report cards/data appear; no worker output or SLA details | P0 | S/F |
| RPT-04 | Grant only job-report access | Job/activity/SLA work data appears; financial totals stay hidden unless separately granted | P0 | S/F |
| RPT-05 | Grant only worker-report access | Worker output/completion/proof data appears; live location and financial data remain separately controlled | P0 | S/F |
| RPT-06 | Grant only sales/customer-report access | Quote success, demand and customer activity appear without unrelated debt/revenue unless money access is also granted | P0 | S/F |
| RPT-07 | Grant only stock-report access | Stock quantities/value/risk appears according to exact permissions | P0 | S/F |
| RPT-08 | Grant multiple report categories to a hybrid member | The page combines only the selected report areas | P0 | F/S |
| RPT-09 | Inspect report labels/cards | No TASK codes, JSON badges or developer-facing report names appear | P1 | F |

### 16.2 Detailed Business Performance

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| PERF-DASH-01 | Load Business Performance with a data-rich company as owner | Money received/owed, branch results, job completion, quote-to-payment, worker results, proof, deadlines/contracts and stock/supplier risks render | P0 | F |
| PERF-DASH-02 | Reconcile selected values with source records | Values match jobs, invoices, payments, quotes, workers, contracts and stock records | P0 | D |
| PERF-DASH-03 | Load as a member with only some analytics categories | Unauthorized cards and their API data are absent; allowed cards remain | P0 | S |
| PERF-DASH-04 | Load with COMPANY, BRANCH and TEAM scopes | Aggregates contain only authorized scope | P0 | S/D |
| PERF-DASH-05 | Load company with no data | Clear empty state; no NaN/undefined/raw JSON | P1 | R |
| PERF-DASH-06 | Load large dataset | Record p50/p95 load time and investigate slow queries | P1 | P |
| PERF-DASH-07 | Change permissions away from Business Performance then back | Analytics feature/data remains intact; only visibility/access changes | P0 | D/F |

## 17. Onboarding & Data Migration

### 17.1 Owner onboarding and delegated setup

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ONB-01 | Register a new owner and answer only the basic business questions | Signup does not demand detailed operational/financial data the owner may not know | P0 | F |
| ONB-02 | Attempt to skip plan selection and open normal dashboard directly | Onboarding gate redirects to plan selection | P0 | S/F |
| ONB-03 | Select a plan using mock confirmation, enter dashboard, then invite a COO/PA/senior manager with broad delegated access | Senior manager can continue company setup without becoming OWNER | P0 | F/S |
| ONB-04 | Give that senior manager broad operational/company-settings permissions but withhold protected ownership powers | They can complete permitted setup; ownership transfer/delete/final-owner actions remain blocked | P0 | S |
| ONB-05 | Create the company's first saved role after signup | The role starts from the selected permissions; no fixed industry role list is required | P1 | F |
| ONB-06 | Open the top-right account menu across authenticated pages | Settings, FieldCore Subscription, Security, and Log out are present according to permission/ownership rules; old duplicate sidebar account treatment is not competing | P1 | F |

### 17.2 Implementation checklist / data migration

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ONB-07 | Walk through the post-signup implementation/onboarding checklist if still used | Each detailed setup step is tracked independently from the initial signup/plan gate | P2 | F |
| ONB-08 | CSV import preview with a clean file | Preview accurately reflects what will be imported before committing | P1 | F |
| ONB-09 | CSV import with malformed rows | Bad rows rejected/flagged with row-level errors; no silent partial corruption | P0 | D |
| ONB-10 | CSV import with rows that duplicate existing customers | Duplicate detection flags them rather than silently creating dupes | P1 | F |
| ONB-11 | Download a CSV template, fill it exactly as documented, re-upload | Round-trips cleanly | P2 | F |
| ONB-12 | Generate vertical demo data for an implementation project | Demo data is scoped to that company and does not leak into other tenants | P1 | S |

## 18. Account Security

The normal page must feel like a simple secure account center, not a developer diagnostics console.

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| SEC-01 | Open Security from profile menu | Page fits viewport and focuses on password, two-step verification, signed-in devices and recent security activity | P0 | F |
| SEC-02 | Inspect page language | Clear Grade 5 wording; no HTTP-only cookie, nodeEnv, database configured, rate limiting, integration secrets, raw JSON or other backend terms | P0 | F |
| SEC-03 | Change password with wrong current password, weak new password and mismatched confirmation | Clear inline JavaScript errors; no native alert | P0 | F/S |
| SEC-04 | Change password successfully | Standard success notification, sessions handled according to policy, and login works with new password | P0 | F/S |
| SEC-05 | Use show/hide controls on password fields | Controls work and do not appear on saved API/provider secret fields | P1 | F/S |
| SEC-06 | Enable 2FA | Correct backend route used; QR/recovery flow works without raw JSON dump | P0 | F/S |
| SEC-07 | View signed-in devices and sign out another device | Plain device names/actions; revoked session fails immediately | P0 | S |
| SEC-08 | View recent security activity | Events are translated into plain language and scoped to current company/user as intended | P1 | F/S |
| SEC-09 | User without security access opens direct page/API | Hidden/blocked consistently | P0 | S |
| SEC-10 | Inspect backend/support status endpoints | Technical health remains backend/support-only and never exposes secrets or internal hosts | P0 | S |
| SEC-11 | Resize page at normal laptop widths | No horizontal overflow or off-screen primary actions | P1 | F |

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

### 20.1 UI clarity, feedback and responsive behavior

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| UX-01 | Search frontend source for native dialogs | Automated test finds no real `alert()`, `confirm()`, or `prompt()` use | P0 | F |
| UX-02 | Perform create, update, send, revoke, delete and failure actions across modules | Each action gives standard success/failure notification; confirmations use FieldCore modal | P0 | F |
| UX-03 | Review key pages as a tired non-technical service-business user | Main action is obvious; language is plain; technical details are hidden | P1 | F |
| UX-04 | Review Settings, Security, Members, Reports and payment setup | No raw JSON, webhook/callback/endpoint/configuration jargon, internal classifications or unexplained codes | P0 | F |
| UX-05 | Test forms with missing/invalid values | Live checks and clear inline reason appear before/after submit as appropriate | P1 | F |
| UX-06 | Inspect all required password forms | Show/hide control exists, global password rules are consistent, and errors are clear | P1 | F/S |
| UX-07 | Test sidebar section behavior | Only relevant/active sections expand; empty or unauthorized sections are hidden | P1 | F |
| UX-08 | Test profile dropdown on normal and Enterprise pages | Actual user name/role appears; Settings/Security/Logout work; Subscription follows Full Access rule | P0 | F/S |
| UX-09 | Test Settings and first Enterprise pages at common laptop widths | Content stays within viewport; columns/tables do not overlap | P1 | F |
| UX-10 | Inspect company branding | Invoice footer/terms are not mixed into Company Information; any preview clearly demonstrates a useful outcome or is removed | P2 | F |
| UX-11 | Test every master checkbox and normal checkbox | Visible state, saved state and backend behavior agree | P0 | F/S |
| UX-12 | Review empty states | They explain the next useful step without large blocks of text or developer wording | P1 | F |


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

- [ ] All targeted permission, report, payment-provider, secret-safety and no-native-dialog tests pass.
- [ ] Every visible permission checkbox is connected to a real page/action/API/data rule.
- [ ] Money and Reports permissions are separated correctly.
- [ ] Owner can see Reports and detailed Business Performance.
- [ ] Permission changes hide unauthorized analytics without deleting the Business Performance feature/data.
- [ ] Full Access checkbox and child permissions stay synchronized and visibly checked.
- [ ] Restricted accounts see only allowed sidebar sections, quick actions, buttons and data.
- [ ] No restricted account enters a redirect loop.
- [ ] Company Members uses one clear role field, dynamic saved roles, plain-language access choices and working invite links.
- [ ] Other principal owners are hidden from normal member lists; each person sees their own row as **You**.
- [ ] FieldCore Subscription is visible only to OWNER or explicit Full Access + COMPANY scope.
- [ ] Security page contains only account-facing controls; technical system health stays backend-only.
- [ ] No native browser alerts, confirms or prompts remain.
- [ ] ZW company payment setup shows only Paynow credentials; SA shows only the supported SA provider credentials.
- [ ] Provider secrets are encrypted at rest, masked/locked after save, absent from browser responses, and updated atomically.
- [ ] Provider Save button becomes Update connection after credentials are stored.
- [ ] Trusted payment webhook remains idempotent after the secret-storage transaction change.

- [ ] Regional env files are generated/verified: `.env.zw` and `.env.sa` use real local DB credentials, not placeholders.
- [ ] Prisma migration history is healthy for both regional databases; `npx prisma migrate status` reports **Database schema is up to date!**.
- [ ] For a fresh full regression, `fieldcore_zw` and `fieldcore_sa` were reset cleanly; for a resumed run, existing QA data was intentionally preserved.
- [ ] ZW server runs on `http://localhost:3000` and passes `/healthz` + `/readyz`.
- [ ] SA server runs on `http://localhost:3001` and passes `/healthz` + `/readyz`.
- [ ] All automated tests pass (`npm test`).
- [ ] Fresh owner signup completes: owner account → business basics → plan selection → mock confirmation/contact request → dashboard.
- [ ] Direct navigation cannot bypass the plan-selection onboarding gate.
- [ ] Monthly/annual pricing uses one consistent calculation and annual savings display.
- [ ] Mock SaaS plan changes make no real external payment-provider call.
- [ ] Enterprise Contact us does not silently activate a paid live Enterprise subscription.
- [ ] 30-day trial state/dates are consistent.
- [ ] Top-right account menu works: Settings, Security and Log out for all authorized accounts; FieldCore Subscription follows the explicit Full Access rule.
- [ ] Company Members invitation flow works end-to-end with invitee-created password, hashed/expiring/single-use token, valid local QA link, revoke/resend behavior and no native dialogs.
- [ ] Full Access non-owner can run the business but cannot transfer ownership, delete the company, remove/demote the final owner, or grant themselves ownership.
- [ ] Accountant can access granted finance functions but cannot use ungranted operational endpoints.
- [ ] Operations Manager can access granted operational functions but cannot see finance data without explicit permission.
- [ ] TEAM, BRANCH, SELF, and COMPANY scopes are enforced server-side across lists, detail routes, reports, and mutations.
- [ ] Changing saved roles does not leave stale legacy `ADMIN` or `WORKER` access behavior.
- [ ] Non-owners cannot delegate permissions or scope beyond what they are authorized to grant.
- [ ] Company-created saved roles and teams are tenant-scoped.
- [ ] You can log in as ZW owner/admin/worker and SA owner/admin/worker.
- [ ] ZW finance defaults are USD/Zimbabwe/Paynow-local; no SA digital providers appear in ZW settings.
- [ ] SA finance defaults are ZAR/South Africa/South African providers; Paynow does not appear in SA settings.
- [ ] Customer payment UI shows **Make payment online** instead of provider-choice buttons.
- [ ] Cash only appears to customers when Cash is enabled for that business.
- [ ] Bank transfer only appears to customers when Bank transfer is enabled for that business.
- [ ] Bank transfer proof-of-payment requirement behaves according to the business setting.
- [ ] Accounting UI shows CSV/export controls only; no Xero/QuickBooks/Sage coming-soon cards.
- [ ] Section 4 (authorization, scope, multi-tenancy) — **zero P0 failures, no exceptions accepted**.
- [ ] Section 20 (cross-cutting security) — zero P0 failures.
- [ ] Section 9/PAY (money engine) — zero P0 failures, especially webhook forgery and double-crediting.
- [ ] Section 22 (backup/restore) run at least once against current schema after any migration changes.
- [ ] `docs/mvp-signoff-checklist.md` items still hold.
- [ ] All P0/P1 defects from this run closed or explicitly risk-accepted by a named owner.
- [ ] Deployment checklist (`docs/deployment-checklist.md`) followed for the target environment.

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
| Teams | Team A and Team B within Company A |
| Core access personas | Owner, explicit Full Access non-owner, money-only member, operations-only member, hybrid member, Team Supervisor, normal Field Worker, no-tools member, Client Portal user |
| Company-created roles | At least one money-only, one operations-only, one hybrid and one deliberately restricted saved role |
| Scope variants | COMPANY, BRANCH, TEAM, SELF |
| Pending invitations | At least one valid, one expired/revoked, and one accepted invitation |
| Customers | ≥3 per company, including one soft-deleted |
| Jobs | Spanning statuses: scheduled, in-progress, completed, cancelled; distributed across branches/teams/workers |
| Quotes | Draft, sent, accepted, rejected, expired |
| Invoices | Unpaid, partially paid, paid, overdue/collections |
| SaaS plans | At least one normal monthly selection, one annual selection, and one Enterprise contact request |
| Payments | ZW: Cash, Bank transfer, Paynow test credentials; SA: Cash, Bank transfer, supported SA provider test credentials; plus forged/replayed webhook attempts |
| Provider credentials | One saved/masked Paynow connection, one replacement-key test, one forced encryption-failure preservation test |
| Report access combinations | Money-only, jobs-only, workers-only, sales-only, stock-only, hybrid, Business Performance/full |
| Customer payment UI | One unpaid invoice with online enabled, one with cash disabled, one with bank transfer disabled, one with POP required |
| Accounting exports | Customers, invoices, payments/receipts, tax/VAT report where available |
| Assets/Contracts | At least one under warranty, one with an active SLA, one breached |
| Inventory | One item below min-stock, one mid-PO-lifecycle |
| Devices (mobile) | One trusted, one revoked |

---

**Notes on scope:** this plan intentionally does not re-list every API endpoint individually. Section 20 (XSEC-03) directs a representative IDOR sweep across the full surface. The new Section 4 adds a dedicated permission/scope adversarial matrix because the access-control refactor makes route-by-route authorization behavior a release-critical concern. If a compliance audit specifically requires per-endpoint sign-off, this document can be expanded into a full endpoint-by-endpoint matrix.