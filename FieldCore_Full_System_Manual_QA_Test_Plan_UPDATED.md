# FieldCore — Full-System Manual QA Test Plan

**Scope:** Every module of the FieldCore platform — Express/Prisma/PostgreSQL backend, owner signup and onboarding, mock SaaS plan selection/subscription management, company-member invitations, role templates, granular permissions and access scopes, static admin web UI, client portal, public booking/tracking portal, regional Zimbabwe/South Africa local deployments, customer payment experience, finance/accounting exports, and the Flutter technician mobile app.
**Dimensions covered:** Functionality, Security, Multi-tenancy, Data integrity, Performance/Efficiency, Reliability/Recovery.

> **Revision note — July 2026:** Updated after the owner-signup, mock subscription, profile-menu, company-member invitation, role-template, granular-permission, team, and access-scope refactor. The previous manual QA run had reached Section 3; re-run the changed Section 2/3 cases before continuing into the new Section 4 authorization matrix.

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

### QA checkpoint after the signup/access-control refactor

The previous manual QA run reached the end of **Section 3** before the owner-signup, subscription, member-invitation, role-template, permission, and scope changes were introduced.

Do **not** assume the old Section 2/3 results still prove the new behavior. Before continuing with Section 4, re-run the changed cases in:

- **Section 2** — account/persona setup and role-template matrix.
- **Section 3** — new owner signup, plan selection, onboarding gate, invitation acceptance, session security.
- **Section 4** — all authorization tests. This section is now the main release gate for the new permission architecture.

You do **not** need to repeat unrelated tests from Sections 0–3 if they already passed and the underlying code was not changed.

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
node --check src/services/accessControl.service.js
node --check prisma/seed.js
npx prisma validate
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

The legacy `OWNER / ADMIN / WORKER` value is now a **coarse internal classification**, not the full business role model. User-facing access is determined by **role template + effective permissions + scope**.

Zimbabwe server (`http://localhost:3000`):

| Seeded persona | Email | Expected template/access intent |
|---|---|---|
| Owner | `owner.zw@fieldcore.test` | Owner template; full company access + protected owner powers |
| Admin | `admin.zw@fieldcore.test` | Broad general-administrator equivalent; no protected ownership powers |
| Worker | `worker.zw@fieldcore.test` | Field-worker template; self/assigned-work access |

South Africa server (`http://localhost:3001`):

| Seeded persona | Email | Expected template/access intent |
|---|---|---|
| Owner | `owner.sa@fieldcore.test` | Owner template; full company access + protected owner powers |
| Admin | `admin.sa@fieldcore.test` | Broad general-administrator equivalent; no protected ownership powers |
| Worker | `worker.sa@fieldcore.test` | Field-worker template; self/assigned-work access |

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
- [ ] The top-right profile menu contains Settings, FieldCore Subscription, Security, and Log out.
- [ ] A seeded owner can open Company Members and see role-template/permission controls.
- [ ] Finance settings show ZW/USD/Paynow on the ZW server.
- [ ] Finance settings show SA/ZAR/South African payment providers on the SA server.
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

## 2. Accounts & Role Matrix

Run QA against **both** regional deployments. Treat ZW and SA as separate local products unless a test explicitly asks for cross-region comparison.

### 2.1 Core authorization model under test

FieldCore now separates three concepts:

```text
WHO/WHAT KIND OF ACCOUNT IS THIS INTERNALLY?
Coarse system classification: OWNER / ADMIN / WORKER

WHAT BUSINESS ROLE DOES THE PERSON HAVE?
Role template / job title: Owner, COO, Accountant, Operations Manager, Team Supervisor, Technician, etc.

WHAT CAN THEY ACTUALLY DO, AND WHERE?
Effective permissions + scope: COMPANY / BRANCH / TEAM / SELF
```

A role-template name must **not** be treated as authorization by itself. Backend authorization must use effective permissions and scope. `OWNER` remains special only for protected ownership actions.

### 2.2 Seeded regional accounts

#### Zimbabwe — `http://localhost:3000`

| Seeded persona | Email | Purpose |
|---|---|---|
| Owner | `owner.zw@fieldcore.test` | Full company access + protected ownership actions |
| General Admin | `admin.zw@fieldcore.test` | Broad existing admin-equivalent access, but not ownership transfer/deletion/final-owner powers |
| Field Worker | `worker.zw@fieldcore.test` | Self/assigned field-work access |

#### South Africa — `http://localhost:3001`

| Seeded persona | Email | Purpose |
|---|---|---|
| Owner | `owner.sa@fieldcore.test` | Full company access + protected ownership actions |
| General Admin | `admin.sa@fieldcore.test` | Broad existing admin-equivalent access, but not ownership transfer/deletion/final-owner powers |
| Field Worker | `worker.sa@fieldcore.test` | Self/assigned field-work access |

### 2.3 Additional personas required for the new role/permission tests

Create these through the **Company Members invitation flow**, not by manually inserting passwords into the database:

| Persona | Suggested role template | Required access profile |
|---|---|---|
| COO / Senior Manager | Executive / COO or closest generic executive template | Full delegatable company access; **not** an owner |
| Personal Assistant / Full Administrator | Full Administrator or equivalent | Broad company administration; **not** an owner |
| Accountant | Accountant | Finance/invoices/payments/reports; no worker-location or scheduling control unless explicitly granted |
| Operations Manager | Operations Manager | Jobs, scheduling, workforce operations; no company financial dashboard/reports unless explicitly granted |
| Team Supervisor | Team Supervisor / Senior Field Worker | Team-scoped jobs/workers only |
| Branch Manager | General/Operations Manager with BRANCH scope | Branch-scoped jobs/workers/reports only |
| Custom Restricted Role | Create manually | A deliberately narrow set of permissions for adversarial testing |

### 2.4 Expected regional defaults

#### Zimbabwe

| Setting | Expected |
|---|---|
| Country/market | Zimbabwe / `ZW` |
| Currency | `USD` |
| Timezone | `Africa/Harare` |
| Customer payment methods | Cash, Bank transfer, Paynow |
| Online payment provider visible to customer | Generic **Make payment online** only; customer must not choose Paynow by name |
| South African payment providers | Must not appear |

#### South Africa

| Setting | Expected |
|---|---|
| Country/market | South Africa / `SA` or `ZA`, but frontend/backend must agree consistently |
| Currency | `ZAR` |
| Timezone | `Africa/Johannesburg` |
| Customer payment methods | Cash, Bank transfer, Ozow, Yoco, PayFast, SnapScan |
| Online payment provider visible to customer | Generic **Make payment online** only; customer must not choose Ozow/Yoco/PayFast/SnapScan by name |
| Zimbabwe payment providers | Paynow must not appear |

### 2.5 Additional tenant and scope data

For Section 4, create at least one second tenant/company in each database or use the registration flow to create another company. Cross-tenant tests are still required inside each regional database.

| Entity/persona | Minimum setup | Purpose |
|---|---|---|
| Company A | Primary tenant | Main functional tests |
| Company B | Second tenant in same regional DB | Tenant-isolation tests |
| Branch 1 + Branch 2 | Company A | Branch scope |
| Team A + Team B | Company A | Team scope |
| Owner | Company A | Ownership boundary |
| COO / Full-access non-owner | Company A | Delegated senior-management boundary |
| Accountant | Company A | Finance-only boundary |
| Operations Manager | Company A | Operations-without-finance boundary |
| Team Supervisor | Company A / Team A | Team boundary |
| Field Worker A1 + A2 | Company A | Worker/self boundary |
| Client Portal user | Company A | Customer boundary |
| Owner + Worker | Company B | Cross-tenant boundary |

### 2.6 Role/template test principles

- **Full Access** means all **delegatable** company permissions, not ownership.
- A non-owner with broad access must still be unable to transfer ownership, delete the company, remove/demote the final owner, or grant themselves ownership.
- Changing a member from an office/management template to a field-worker template must also update the coarse internal classification where required so old `ADMIN` checks cannot leave hidden access behind.
- Promoting a field worker into a management template must not leave them trapped in a worker-only UI or API path.
- The owner may customize permissions away from a built-in template for one specific user.
- A built-in role template is a default bundle, not hard-coded functionality.
- Company-created custom templates must remain tenant-scoped.

## 3. Authentication & Session Security

Because the previous QA run reached this section before the signup/access-control refactor, **re-run all P0/P1 cases below**.

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| AUTH-01 | Open the new registration flow and complete Step 1 with owner name, work email, password, and confirmation | Validation is clear; no password/password hash is returned or logged | P0 | F/S |
| AUTH-02 | Continue to business basics and enter company name, country/market, business vertical, and approximate team size | Company metadata is stored; unsupported/unknown vertical falls back safely to generic role templates | P0 | F/D |
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
| AUTH-19 | As owner, invite a new company member by email, select a role template, customize permissions, and choose COMPANY/BRANCH/TEAM/SELF scope | Invitation record is created with normalized email and correct requested access; no password is created by the inviter | P0 | F/S |
| AUTH-20 | Inspect invitation storage/API responses | Plaintext invite token and token hash are never exposed; stored token is hashed; expiration exists | P0 | S |
| AUTH-21 | Open a valid invitation link, set and confirm a password, accept | Invitee sees the inviting company/intended role, creates their own password, invitation becomes single-use, and account receives the intended template/permissions/scope | P0 | F/S |
| AUTH-22 | Reuse an accepted invitation link | Rejected; no second account/access grant is created | P0 | S/D |
| AUTH-23 | Try an expired invitation | Rejected cleanly | P0 | S |
| AUTH-24 | Revoke a pending invitation, then try the old link | Rejected; revoked invite cannot be accepted | P0 | S |
| AUTH-25 | Invite an email already belonging to an existing FieldCore user | Existing account is not hijacked or silently rebound to another company; behavior follows explicit safe membership rules | P0 | S |
| AUTH-26 | Client portal register/login/logout/forgot-password | Client session remains separate from internal staff session; client cookie cannot access staff routes | P0 | S |
| AUTH-27 | Attempt direct role/access changes as a user without the required member/role/permission-management authority | Rejected server-side even if a UI control is manually exposed via devtools | P0 | S |

### Authentication/onboarding completion check

Before continuing to Section 4, have at least these accounts available in **one** regional database:

- Owner.
- Full-access non-owner COO/senior manager.
- Accountant.
- Operations Manager.
- Team Supervisor scoped to Team A.
- Normal field worker.
- Second tenant owner.

These are required for the adversarial authorization matrix below.

## 4. Authorization, RBAC & Multi-Tenant Isolation (highest priority section)

This is the **highest-priority release gate** after the access-control refactor. A hidden menu item is not proof of security. For P0 cases, test the UI **and** the raw API request.

### 4.1 Tenant isolation

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| TEN-01 | As Company A owner, note IDs for a customer, job, quote, invoice, worker, asset, contract, team, role template, and invitation | Test IDs available | — | — |
| TEN-02 | Login as Company B owner and directly request Company A records by ID | Every request returns 404/403 — never the record, even partially | P0 | S |
| TEN-03 | As Company B, list customers/jobs/quotes/invoices/workers/assets/teams/role templates | Company A records never appear, including in pagination/search results | P0 | S |
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

### 4.3 Protected owner powers vs Full Access

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| OWN-01 | Give a non-owner COO **Full Access** | They receive all delegatable permissions and broad company operation access | P0 | F/S |
| OWN-02 | As that Full Access COO, attempt to transfer ownership | Rejected | P0 | S |
| OWN-03 | Attempt to delete the company/account | Rejected unless explicitly defined as an owner-only action and actor is actual owner | P0 | S |
| OWN-04 | Attempt to remove/demote the final owner | Rejected | P0 | S/D |
| OWN-05 | Attempt to make self an OWNER by editing profile/member payloads or template metadata | Rejected; no self-escalation | P0 | S |
| OWN-06 | As actual owner, perform legitimate owner-only action in a safe test environment | Allowed and audited | P0 | F/D |

### 4.4 Delegation security

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| DEL-01 | Give a restricted user only `members.invite`, not broad permission-management authority; have them invite another user with Full Access or permissions they do not possess | Server rejects the over-delegation | P0 | S |
| DEL-02 | Same actor attempts to grant a broader branch/team/company scope than they are authorized to administer | Rejected | P0 | S |
| DEL-03 | Authorized owner/permission administrator grants a permitted subset of their delegatable authority | Succeeds | P0 | F/S |
| DEL-04 | User attempts to edit their own permissions/template/scope to gain more access | Rejected unless explicitly authorized by a higher-level policy; self-escalation must not occur | P0 | S |
| DEL-05 | Change another member's role template from broad admin → field worker | Effective permissions shrink and coarse system classification/navigation no longer leave old hidden admin access | P0 | S/D |
| DEL-06 | Promote a field worker → management/COO-style template | User can access the permitted management web modules and is not trapped in worker-only UI/route behavior | P0 | F/S |

### 4.5 Scope enforcement

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

### 4.6 Dashboard and reporting data segmentation

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| DASH-AUTH-01 | Operations Manager with operational dashboard permission but no financial dashboard permission loads dashboard | Operational widgets render; revenue, unpaid totals, profit/margin, and other finance-only metrics are omitted or blocked | P0 | S |
| DASH-AUTH-02 | Accountant with financial dashboard permission but no workforce-location permission loads dashboard | Finance widgets render; restricted worker/location data does not | P0 | S |
| DASH-AUTH-03 | Executive with explicit executive/financial/operational dashboard permissions loads dashboard | Full permitted dashboard renders | P0 | F/S |
| DASH-AUTH-04 | Branch/team-scoped manager loads reports/dashboard | Aggregates contain only in-scope records | P0 | S/D |

### 4.7 Role-template and custom-role isolation

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ROLE-01 | Create a custom company role template with a narrow permission set and default scope | Template saves and is reusable within that company | P1 | F |
| ROLE-02 | Edit the custom template or a member-specific override | Effective access changes as intended without changing unrelated users unexpectedly | P1 | D |
| ROLE-03 | Company B attempts to list/use/edit Company A custom template by ID | Rejected/not visible | P0 | S |
| ROLE-04 | Select a built-in generic template, then customize one member's permissions | Only that member receives the override unless a company template itself was deliberately edited | P1 | D |
| ROLE-05 | For a supported vertical, verify relevant vertical templates appear alongside generic templates; for unsupported vertical, generic templates still work | No hard dependency on HVAC or any one industry | P2 | F |

### 4.8 Auditability

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| AUD-ACCESS-01 | Create/resend/revoke/accept an invitation | Each sensitive event is audited without plaintext token/password | P0 | S/D |
| AUD-ACCESS-02 | Change role template, permissions, Full Access, or scope | Actor, target, timestamp, and safe metadata are audited | P0 | D |
| AUD-ACCESS-03 | Attempt blocked privilege escalation | Security/authorization failure is safely logged where intended without leaking secrets | P1 | S |

## 5. Core Business Objects — Customers, Services, Workers

The new company-member/team model must be tested separately from customers. **Customers are not company members.**

### 5.1 Company Members, invitations, custom roles and teams

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| MEM-01 | Open Company Members as owner/authorized member manager | Active members and pending invitations are clearly separated; customer records are not mixed into the staff list | P0 | F |
| MEM-02 | Edit a member's job title, role template, permission overrides, and scope | Changes persist and effective access updates after refresh/re-login | P0 | F/D |
| MEM-03 | Disable a member, then attempt login/API use with an existing session | Account is blocked according to intended policy; historic records remain intact | P0 | S/D |
| MEM-04 | Reactivate a disabled member as an authorized administrator | Access returns with the intended current permissions/scope, not stale elevated access | P1 | F/S |
| MEM-05 | Resend a pending invitation | Old/previous invitation behavior follows the designed token policy; only valid current link can be accepted | P1 | S |
| MEM-06 | Revoke a pending invitation | Invitation becomes unusable | P0 | S |
| MEM-07 | Create a custom role using the proper role builder/editor | Name, description, permission categories, and default scope save without browser-prompt-only shortcuts | P1 | F |
| MEM-08 | Create Team A and Team B, add/remove workers or company members as supported | Membership updates correctly and remains company-scoped | P0 | F/D |
| MEM-09 | Assign a Team Supervisor to Team A and verify the UI only offers authorized scope selections | No accidental company-wide scope is granted | P0 | S |
| MEM-10 | Delete/deactivate a team that still has members/jobs | System handles dependencies safely; no orphaned access grants or silent cross-scope expansion | P1 | D |

### 5.2 Customers, services and workers

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| CORE-01 | Create/edit/delete a customer with valid and invalid data (missing name, malformed email/phone) | Zod validation rejects bad input with a clear message; valid input persists correctly | P1 | F |
| CORE-02 | Soft-delete a customer, then attempt normal retrieval and recovery flow | Soft-deleted record disappears from normal views but is recoverable through the intended path | P1 | D |
| CORE-03 | Create a service with pricing, mark inactive, confirm it disappears from new-quote pickers but historic quotes referencing it still render correctly | Historic integrity preserved | P2 | F/D |
| CORE-04 | Create a worker, set role/availability, deactivate, confirm deactivated worker cannot use field-worker login/workflow but historic job assignments remain intact | Access blocked; history preserved | P1 | D/S |
| CORE-05 | Attempt duplicate customer creation (same email/phone) | Actual dedup behavior matches documented intent — blocked or clearly flagged | P2 | F |
| CORE-06 | Upload a customer/company logo via branding settings | Accepted only for configured image MIME types and size limit; oversized/wrong-type files rejected | P1 | S |
| CORE-07 | Promote an existing field worker into an office/management role template where supported | WorkerProfile/history is preserved; new management access follows template/permissions without duplicate user records | P1 | D/F |
| CORE-08 | Demote an office admin to field-worker template | Legacy admin access is removed; worker-specific prerequisites are handled explicitly | P0 | S/D |

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
| BILL-01 | Open the dedicated **FieldCore Subscription** page from the top-right account menu | Current plan, interval, status, usage where available, and reusable plan cards render correctly | P0 | F |
| BILL-02 | Toggle Monthly ↔ Annual on the subscription page | Uses the same backend plan data and central annual-pricing rule as signup; no duplicated conflicting prices | P0 | D/F |
| BILL-03 | Select a different normal plan | Mock confirmation modal shows plan/interval/amount; confirming changes internal subscription state only and does not call a real payment provider | P0 | F/S |
| BILL-04 | Select Enterprise / Contact us | Request/contact state is recorded; Enterprise is not silently activated as a paid live plan | P0 | F/D |
| BILL-05 | Give a non-owner authorized `subscription.view` but not `subscription.manage` | Can view subscription page/data but cannot change plan/interval | P0 | S |
| BILL-06 | Give an authorized senior manager `subscription.manage` if this permission is intentionally delegatable | Can manage subscription without becoming OWNER or gaining protected ownership powers | P0 | S/F |
| BILL-07 | User without `subscription.view` directly requests subscription page/API | Rejected/hidden consistently | P0 | S |
| BILL-08 | Attempt to access another company's subscription/billing data | Rejected; multi-tenant scoping applies to billing too | P0 | S |
| BILL-09 | Inspect network traffic while confirming mock plan changes | No Stripe/Paynow/Ozow/PayFast/Yoco or other external SaaS-billing checkout call occurs | P0 | S |
| BILL-10 | Verify trial dates/status after new signup and plan selection | 30-day trial behavior is consistent and does not falsely represent a real successful charge | P0 | D/F |

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
| ENT-01 | Create a granular member-specific permission override (e.g. view invoices but not edit/send) | Override is enforced in UI and raw API | P0 | S |
| ENT-02 | Create a custom company role template and assign it to two members | Both receive template defaults; member-specific override affects only the targeted member | P0 | D/S |
| ENT-03 | Change a member from one role template to another | Effective permissions and coarse classification transition safely; no stale access remains | P0 | S/D |
| ENT-04 | Give a non-owner Full Access | All delegatable permissions available; protected owner actions remain blocked | P0 | S |
| ENT-05 | Restricted member attempts to delegate permissions/scope they do not control | Rejected | P0 | S |
| ENT-06 | Branch-scoped admin requests cross-branch data/report | Only in-scope branch data appears | P0 | S |
| ENT-07 | Team-scoped supervisor requests another team's worker/job/schedule | Rejected | P0 | S |
| ENT-08 | Trigger an approval-gated action (discount above threshold, refund, PO above threshold) | Creates pending approval; action does not execute until approved | P0 | F/D |
| ENT-09 | Approve/reject a pending approval as an authorized approver | State transitions correctly; rejected action does not apply | P0 | D |
| ENT-10 | Review audit log after invitation, role, permission, scope, refund, and security changes | Sensitive actions logged with actor/timestamp/target; no plaintext token/password/secrets; logs cannot be edited/deleted via exposed API | P0 | S/D |

## 16. Executive Dashboards & Analytics

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| DASH-01 | Load `executive-dashboard.html` with a data-rich company as a user explicitly granted executive/financial/operational analytics | Widgets render with numbers that reconcile against source records | P1 | F/D |
| DASH-02 | Load dashboard as Operations Manager with operational access but no financial-dashboard permission | Operational data renders; revenue/unpaid/profit/margin or other finance-only metrics are absent/blocked | P0 | S |
| DASH-03 | Load dashboard as Accountant with finance access but no worker-location access | Financial data renders; restricted worker/location information does not | P0 | S |
| DASH-04 | Load executive dashboard as a role without executive analytics permission | Blocked or no sensitive executive data is returned | P0 | S |
| DASH-05 | Load branch/team-scoped dashboard/report | Aggregates reconcile only to the user's authorized scope | P0 | S/D |
| DASH-06 | Load dashboard for a company with zero data | Graceful empty states, no crashes/NaNs/`undefined` | P1 | R |
| DASH-07 | Load dashboard for a company with a large dataset | Record actual load time; no browser freeze; investigate slow aggregation | P1 | P |

## 17. Onboarding & Data Migration

### 17.1 Owner onboarding and delegated setup

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| ONB-01 | Register a new owner and answer only the basic business questions | Signup does not demand detailed operational/financial data the owner may not know | P0 | F |
| ONB-02 | Attempt to skip plan selection and open normal dashboard directly | Onboarding gate redirects to plan selection | P0 | S/F |
| ONB-03 | Select a plan using mock confirmation, enter dashboard, then invite a COO/PA/senior manager with broad delegated access | Senior manager can continue company setup without becoming OWNER | P0 | F/S |
| ONB-04 | Give that senior manager broad operational/company-settings permissions but withhold protected ownership powers | They can complete permitted setup; ownership transfer/delete/final-owner actions remain blocked | P0 | S |
| ONB-05 | Verify business vertical influences available built-in role templates where configured | Relevant vertical templates appear alongside generic templates; unsupported vertical falls back to generic set | P1 | F |
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

## 18. Security Center

| ID | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|
| SEC-01 | `PATCH /company/security-settings` as Owner, authorized security manager, and unauthorized user | Effective `security.manage`/owner policy is enforced server-side; coarse `ADMIN` alone is not sufficient unless its template grants permission | P0 | S |
| SEC-02 | `GET /security/events` as user with `security.view` vs user without it | Authorized user sees current-company events only; unauthorized user is rejected | P0 | S |
| SEC-03 | Configure an identity provider/integration record, then inspect all GET responses | Secrets are write-only and never echoed | P0 | S |
| SEC-04 | `GET /admin/data-export/:type` with and without the required export/security permission | Authorized export is tenant/scope limited; unauthorized user is rejected | P0 | S |
| SEC-05 | `GET /ops/status` as non-admin/non-permitted user | Endpoint follows intended policy and never leaks DB host/internal IPs/secrets | P1 | S |
| SEC-06 | Full walkthrough of `security-center.html` | UI controls match backend enforcement; no fake toggle and no hidden server capability without appropriate permission gate | P1 | F/S |
| SEC-07 | Open Security from the top-right profile menu as a user with `security.view` | Link/page appears and loads | P1 | F |
| SEC-08 | Same as a user without `security.view` | Link is hidden/disabled and direct page/API access is rejected | P0 | S |

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
- [ ] Top-right account menu works: Settings, FieldCore Subscription, Security, Log out.
- [ ] Company Members invitation flow works end-to-end with invitee-created password, hashed/expiring/single-use token, revoke/resend behavior.
- [ ] Full Access non-owner can run the business but cannot transfer ownership, delete the company, remove/demote the final owner, or grant themselves ownership.
- [ ] Accountant can access granted finance functions but cannot use ungranted operational endpoints.
- [ ] Operations Manager can access granted operational functions but cannot see finance data without explicit permission.
- [ ] TEAM, BRANCH, SELF, and COMPANY scopes are enforced server-side across lists, detail routes, reports, and mutations.
- [ ] Changing role templates does not leave stale legacy `ADMIN` or `WORKER` access behavior.
- [ ] Non-owners cannot delegate permissions or scope beyond what they are authorized to grant.
- [ ] Custom role templates and teams are tenant-scoped.
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
| Core access personas | Owner, Full-access non-owner COO/senior manager, Accountant, Operations Manager, Team Supervisor, normal Field Worker, Client Portal user |
| Custom access persona | One deliberately restricted custom role/template with a narrow permission set |
| Scope variants | COMPANY, BRANCH, TEAM, SELF |
| Pending invitations | At least one valid, one expired/revoked, and one accepted invitation |
| Customers | ≥3 per company, including one soft-deleted |
| Jobs | Spanning statuses: scheduled, in-progress, completed, cancelled; distributed across branches/teams/workers |
| Quotes | Draft, sent, accepted, rejected, expired |
| Invoices | Unpaid, partially paid, paid, overdue/collections |
| SaaS plans | At least one normal monthly selection, one annual selection, and one Enterprise contact request |
| Payments | ZW: Cash, Bank transfer, Paynow/mock; SA: Cash, Bank transfer, Ozow/Yoco/PayFast/SnapScan mock as supported by current provider code; plus forged webhook attempts |
| Customer payment UI | One unpaid invoice with online enabled, one with cash disabled, one with bank transfer disabled, one with POP required |
| Accounting exports | Customers, invoices, payments/receipts, tax/VAT report where available |
| Assets/Contracts | At least one under warranty, one with an active SLA, one breached |
| Inventory | One item below min-stock, one mid-PO-lifecycle |
| Devices (mobile) | One trusted, one revoked |

---

**Notes on scope:** this plan intentionally does not re-list every API endpoint individually. Section 20 (XSEC-03) directs a representative IDOR sweep across the full surface. The new Section 4 adds a dedicated permission/scope adversarial matrix because the access-control refactor makes route-by-route authorization behavior a release-critical concern. If a compliance audit specifically requires per-endpoint sign-off, this document can be expanded into a full endpoint-by-endpoint matrix.