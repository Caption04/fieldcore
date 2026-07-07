# FieldCore Manual QA Simulation & Test Plan

Use this file after the automated tests pass. It is designed to prove the full FieldCore MVP works as a real business flow, not just isolated pages.

Recommended location:

```bash
~/code/FieldCore_Software/MANUAL_QA_SIMULATION.md
```

---

## 0. Goal

Run one full FieldCore simulation:

```text
Public request → admin review → quote → client portal → job scheduling → worker proof-of-work → invoice/payment/receipt → reports → billing/security checks
```

This confirms the final MVP after Phases 1–12.

---

## 1. Local Setup

From Ubuntu/WSL:

```bash
cd ~/code/FieldCore_Software
```

Start PostgreSQL:

```bash
sudo service postgresql start
pg_isready -h localhost -p 5432
```

Expected:

```text
localhost:5432 - accepting connections
```

Apply migrations:

```bash
npx prisma migrate status
npx prisma migrate deploy
```

Expected:

```text
All migrations have been successfully applied.
```

Generate Prisma client:

```bash
npm run build
```

Seed demo data:

```bash
npm run seed
```

Optional full local reset only if you are okay wiping your local FieldCore database:

```bash
npx prisma migrate reset --force
npm run seed
```

Run automated tests first:

```bash
npm test
```

Expected latest result:

```text
68+ tests
0 failed
```

Start server:

```bash
npm run dev
```

Open the port shown in terminal.

Usually:

```text
http://localhost:3000
```

If 3000 is busy, the server may run on:

```text
http://localhost:3001
```

Use whichever port your terminal shows.

For the rest of this checklist, set:

```text
BASE_URL = http://localhost:3000
```

or:

```text
BASE_URL = http://localhost:3001
```

---

## 2. Demo Accounts

After `npm run seed`, use:

```text
Owner:
owner@fieldcore.test
FieldCoreDemo2026!

Admin:
admin@fieldcore.test
FieldCoreDemo2026!

Worker:
worker@fieldcore.test
FieldCoreDemo2026!
```

The seed creates a demo customer:

```text
North Ridge Apartments
ops@northridge.test
```

and a demo service:

```text
HVAC Preventive Maintenance
```

---

## 3. Optional Linked Client Account for Full Client Portal QA

The public client registration does not automatically link by raw email/phone. That is intentional security behavior.

For full client portal QA using the seeded customer, run this helper once:

```bash
cd ~/code/FieldCore_Software

node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: 'FieldCore Demo Services' }
  });

  if (!company) throw new Error('Demo company not found. Run npm run seed first.');

  const customer = await prisma.customer.findUnique({
    where: { id: 'demo-customer' }
  });

  if (!customer) throw new Error('Demo customer not found. Run npm run seed first.');

  const password = 'FieldCoreDemo2026!';
  const hash = await bcrypt.hash(password, 10);

  await prisma.clientAccount.upsert({
    where: {
      companyId_email: {
        companyId: company.id,
        email: 'client@fieldcore.test'
      }
    },
    update: {
      customerId: customer.id,
      name: 'Demo Client',
      phone: customer.phone,
      passwordHash: hash,
      status: 'ACTIVE'
    },
    create: {
      companyId: company.id,
      customerId: customer.id,
      name: 'Demo Client',
      email: 'client@fieldcore.test',
      phone: customer.phone,
      passwordHash: hash,
      status: 'ACTIVE'
    }
  });

  console.log('Client login: client@fieldcore.test / FieldCoreDemo2026!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
NODE
```

Client login after this:

```text
client@fieldcore.test
FieldCoreDemo2026!
```

---

## 4. Fast Health Check

Open these in browser or run curl.

```bash
curl -i BASE_URL/healthz
curl -i BASE_URL/readyz
```

Replace `BASE_URL` with the actual URL, for example:

```bash
curl -i http://localhost:3000/healthz
curl -i http://localhost:3000/readyz
```

Expected:

```text
200 OK
```

---

## 5. Automated Command Checklist

Run:

```bash
cd ~/code/FieldCore_Software

node --check src/services/reporting.service.js
node --check src/routes/api.js
node --check assets/api.js
node --check test/api.security.test.js

npx prisma validate
npm run build
npm test
```

Pass criteria:

```text
No syntax errors
Prisma schema is valid
Build passes
All tests pass
0 failed
```

---

## 6. Browser Simulation Overview

Use separate browser profiles/incognito windows for:

```text
Owner/Admin
Worker
Client
Public user
```

This helps catch cookie/auth boundary bugs.

Pages to test:

```text
/login.html
/index.html
/settings.html
/booking.html
/booking-requests.html
/quotes.html
/schedule.html
/jobs.html
/invoices.html
/reports.html
/client-register.html
/client-login.html
/client-portal.html
```

---

# FULL END-TO-END SIMULATION

## 7. Owner Login & Dashboard

Open:

```text
BASE_URL/login.html
```

Login as:

```text
owner@fieldcore.test
FieldCoreDemo2026!
```

Expected:

```text
Login succeeds
Dashboard loads
No passwordHash appears anywhere
No console errors
Navigation works
```

Checklist:

```text
[ ] Owner login works
[ ] Dashboard loads
[ ] Customers card/table visible
[ ] Jobs data visible
[ ] Invoices/quotes data visible
[ ] No console errors
```

---

## 8. Settings / Production Tools / Branding / Billing

Open:

```text
BASE_URL/settings.html
```

Check:

```text
Company profile
Branding
Scheduling settings
Notification logs
Admin tools
System status
Audit logs
Billing section
```

Expected:

```text
Only safe config status appears
No API keys/tokens/secrets appear
Audit logs are visible to owner/admin
Billing shows plan/subscription/trial/usage
```

Checklist:

```text
[ ] Settings page loads
[ ] Branding values load
[ ] Scheduling settings load
[ ] Notification logs load
[ ] Audit logs load
[ ] System status loads
[ ] Billing/subscription loads
[ ] No secrets shown
[ ] No console errors
```

---

## 9. Public Booking Request Flow

Open as public user or incognito:

```text
BASE_URL/booking.html
```

Submit a booking request.

Use example data:

```text
Name: Public QA Customer
Email: public.qa@example.com
Phone: +263771234567
Service: any visible service
Address: 10 Test Road
City/Suburb: Harare
Property type: Commercial or Residential
Preferred date: tomorrow or next available date
Preferred time window: Morning
Notes: Manual QA public request test
Photos: upload a small test image if the picker exists
```

Expected after submit:

```text
Confirmation appears
Public reference appears
Tracking instructions appear
No login required
```

Write down:

```text
Public reference: ________________________
Email/phone used: ________________________
```

Checklist:

```text
[ ] Public services load
[ ] Public request submits
[ ] Photos attach if selected
[ ] Confirmation appears
[ ] Public reference appears
[ ] No console errors
```

---

## 10. Public Tracking Flow

On the same public booking page, use the tracking form.

Enter:

```text
Reference: the reference from the previous step
Email/phone: the same email or phone used on submit
```

Expected:

```text
Tracking result appears
Status is customer-safe
No admin/internal notes appear
No other customer data appears
```

Negative test:

```text
Use correct reference + wrong email/phone
```

Expected:

```text
No data returned
Safe error message
```

Checklist:

```text
[ ] Correct reference + contact tracks successfully
[ ] Wrong contact fails safely
[ ] Tracking output is customer-safe
[ ] No internal/admin notes leaked
```

---

## 11. Admin Booking Request Review

Login as owner/admin.

Open:

```text
BASE_URL/booking-requests.html
```

Find the public QA request.

Expected:

```text
Request appears in admin list
Reference/source visible
Property details visible
Preferred date/time visible
Photos visible if uploaded
Customer-facing message/status visible
```

Actions to test:

```text
Review request
Create quote from request
Decline another test request if needed
```

Expected:

```text
Review succeeds
Quote creation succeeds
Decline stores safe customer-facing reason
No worker/client/public can access this admin page
```

Checklist:

```text
[ ] Booking request appears
[ ] Property fields visible
[ ] Photos visible if uploaded
[ ] Review works
[ ] Create quote from request works
[ ] Decline works on a separate request if tested
[ ] No console errors
```

---

## 12. Quote Flow

Open:

```text
BASE_URL/quotes.html
```

Test with either:

```text
A. Quote created from public booking request
B. Seeded demo quote for North Ridge Apartments
```

Actions:

```text
Create quote if needed
Add/edit line items if UI supports it
Send quote
Accept quote
Reject a different quote if needed
```

Expected:

```text
Totals calculate correctly
Sent quote changes status
Accept is idempotent
Reject works for eligible quotes
Notifications are logged
No duplicate weird records
```

Checklist:

```text
[ ] Quote list loads
[ ] Quote detail/actions work
[ ] Send quote works
[ ] Accept quote works
[ ] Reject quote works on separate quote if tested
[ ] Totals look correct
[ ] Notification log records quote action
```

---

## 13. Client Portal Flow

Use the linked client helper from Section 3 if you want full seeded customer history.

Open:

```text
BASE_URL/client-login.html
```

Login as:

```text
client@fieldcore.test
FieldCoreDemo2026!
```

Expected:

```text
Client login succeeds
Client portal dashboard loads
Client sees only their own records
Client cannot access admin pages
```

Check:

```text
Quotes
Invoices
Receipts
Jobs
Proof photos
Signature
Activity
Properties
Booking requests
```

Important restriction tests:

```text
Try opening BASE_URL/reports.html while logged in as client
Try calling admin pages directly
```

Expected:

```text
Blocked or redirected
No company-wide analytics leak
No admin data leak
```

Checklist:

```text
[ ] Client login works
[ ] Client dashboard loads
[ ] Client sees own quotes/invoices/jobs
[ ] Client can view own proof/signature if present
[ ] Client cannot mutate job proof
[ ] Client cannot access admin reports/settings
[ ] No console errors
```

---

## 14. Scheduling Flow

Open as owner/admin:

```text
BASE_URL/schedule.html
```

Test:

```text
Schedule a job
Check worker availability
Try an overlapping schedule
Reschedule a job
Unschedule a job if safe
```

Expected:

```text
Valid schedule succeeds
Conflicts are blocked or warned clearly
Worker schedule is scoped
Calendar/list updates
```

Checklist:

```text
[ ] Schedule page loads
[ ] Worker availability appears
[ ] Scheduling works
[ ] Conflict detection works
[ ] Reschedule works
[ ] Worker sees only assigned schedule
```

---

## 15. Worker Job Lifecycle

Open a separate browser/incognito window.

Login as worker:

```text
worker@fieldcore.test
FieldCoreDemo2026!
```

Open:

```text
BASE_URL/jobs.html
```

or the worker dashboard/jobs page exposed by the UI.

Use the assigned demo job or a job assigned by admin.

Actions:

```text
Arrive
Start
Pause
Resume
Upload BEFORE photo
Upload AFTER photo
Upload GENERAL proof photo if available
Add completion notes
Capture location if browser/device allows
Collect client signature
Complete job
```

Expected:

```text
Worker can only see assigned jobs
Wrong job access fails
Proof categories save correctly
Missing required proof blocks completion
Signature saves
Completion creates activity events
Job completed notification logs
```

Checklist:

```text
[ ] Worker login works
[ ] Worker sees only assigned jobs
[ ] Arrive works
[ ] Start works
[ ] Pause/resume works
[ ] BEFORE photo uploads
[ ] AFTER photo uploads
[ ] Completion notes save
[ ] Signature saves
[ ] Location saves if allowed
[ ] Completion works after requirements met
[ ] Activity timeline updates
```

---

## 16. Admin Proof Review

Login as owner/admin.

Open:

```text
BASE_URL/jobs.html
```

Open the completed job.

Expected:

```text
Before photos visible
After photos visible
General proof visible
Completion notes visible
Signature visible
Signed-by name visible
Completion timestamp visible
Location visible if captured
Proof summary visible
```

Checklist:

```text
[ ] Admin can review proof summary
[ ] Admin can view before/after photos
[ ] Admin can view signature
[ ] Admin can view completion notes
[ ] Admin can view activity timeline
[ ] No unrelated company/customer data appears
```

---

## 17. Invoice / Payment / Receipt Flow

Open:

```text
BASE_URL/invoices.html
```

Test:

```text
Create invoice from completed job
Send invoice
Record payment
Confirm payment if needed
View receipt
Open receipt
```

Expected:

```text
Invoice number generates correctly
Invoice total is correct
Payment reduces balance
Receipt is created once
Duplicate invoice/receipt actions are safe/idempotent
Paid invoices cannot be edited incorrectly
```

Checklist:

```text
[ ] Invoice list loads
[ ] Create invoice from job works
[ ] Send invoice works
[ ] Record payment works
[ ] Confirm payment works if required
[ ] Receipt appears
[ ] Receipt opens
[ ] Paid invoice protection works
```

---

## 18. Notifications Check

Open:

```text
BASE_URL/settings.html
```

Find notification logs.

Confirm logs exist for:

```text
Public booking created
Quote sent
Quote accepted/rejected
Invoice sent
Payment received
Job scheduled/rescheduled
Worker assigned
Job completed
```

Expected:

```text
Logs are company-scoped
Skipped provider sends are recorded safely
Email/WhatsApp statuses are clear
No provider secrets are shown
```

Checklist:

```text
[ ] Notification logs load
[ ] Email channel logs exist
[ ] WhatsApp channel logs exist or are safely skipped
[ ] No duplicate spam from idempotent actions
[ ] No secrets shown
```

---

## 19. SaaS Billing / Subscription Check

Open as owner:

```text
BASE_URL/settings.html
```

Check billing section.

Expected:

```text
Current plan visible
Subscription status visible
Trial/internal/free status visible if configured
Usage visible
Plan limits visible
Provider status visible without secrets
```

Test owner-only actions:

```text
Checkout/manual subscription action
Change plan
Cancel at period end
```

Expected:

```text
Owner can perform allowed actions
Admin cannot perform owner-only billing changes
Worker/client/public cannot access billing APIs/pages
No fake paid status is claimed
```

Checklist:

```text
[ ] Billing UI loads
[ ] Plans load
[ ] Subscription status loads
[ ] Usage loads
[ ] Owner-only actions are protected
[ ] Worker/client/public blocked
[ ] No provider secrets shown
```

---

## 20. Reports & Analytics Check

Open:

```text
BASE_URL/reports.html
```

Check sections:

```text
Overview
Revenue
Unpaid invoices
Completed jobs
Worker performance
Service popularity
Quote conversion
Customer analytics/history
```

Test filters:

```text
Last 30 days
This month
Custom start/end dates
Worker filter if present
Service filter if present
Customer filter if present
```

Expected:

```text
Reports load
Date filters change results
Empty states are safe
Numbers are company-scoped
No passwordHash/secrets
```

CSV export:

```text
Export report CSV
Open CSV
Check that dangerous formula prefixes are escaped
```

Dangerous CSV prefixes:

```text
=
+
-
@
```

Expected:

```text
CSV downloads
Only company data appears
No formula injection
No secrets
```

Checklist:

```text
[ ] Reports page loads
[ ] Revenue metrics appear
[ ] Unpaid invoice metrics appear
[ ] Job metrics appear
[ ] Worker performance appears
[ ] Service popularity appears
[ ] Quote conversion appears
[ ] Customer analytics appears
[ ] Date filters work
[ ] CSV export works if implemented
[ ] CSV is formula-injection safe
[ ] Worker/client/public blocked from reports
```

---

# SECURITY SIMULATION

## 21. Role Boundary Tests

Use separate sessions.

### Worker

Login as worker and try:

```text
BASE_URL/customers.html
BASE_URL/quotes.html
BASE_URL/invoices.html
BASE_URL/settings.html
BASE_URL/reports.html
```

Expected:

```text
403/redirect/safe block
No data leak
```

### Client

Login as client and try:

```text
BASE_URL/settings.html
BASE_URL/reports.html
BASE_URL/booking-requests.html
BASE_URL/quotes.html
BASE_URL/invoices.html
```

Expected:

```text
Blocked from admin UI/API
Client portal still works
```

### Public

Logged out/incognito, try:

```text
BASE_URL/reports.html
BASE_URL/settings.html
BASE_URL/jobs.html
BASE_URL/api/reports
BASE_URL/api/audit-logs
BASE_URL/api/system/status
```

Expected:

```text
401/403/redirect
No data leak
```

Checklist:

```text
[ ] Worker blocked from admin analytics
[ ] Worker blocked from admin billing/settings
[ ] Client blocked from company analytics
[ ] Public blocked from internal APIs
[ ] No passwordHash anywhere
[ ] No stack traces in production-style errors
```

---

## 22. Rate Limit Test

Use intentionally wrong login.

Open login and submit wrong password several times, or run:

```bash
BASE=http://localhost:3000

for i in 1 2 3 4 5 6 7 8; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Content-Type: application/json" \
    -d '{"email":"owner@fieldcore.test","password":"wrong"}' \
    "$BASE/api/auth/login"
done
```

Expected:

```text
Eventually returns 429
Message is safe
No stack trace
```

If your server is on 3001:

```bash
BASE=http://localhost:3001
```

Checklist:

```text
[ ] Login rate limit triggers
[ ] Public tracking rate limit triggers if tested
[ ] 429 message is safe
[ ] Normal flow works after reset/window
```

---

## 23. API Smoke Test With Owner Cookie

Optional quick API check.

```bash
BASE=http://localhost:3000

curl -s -c /tmp/fieldcore-owner.jar \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@fieldcore.test","password":"FieldCoreDemo2026!"}' \
  "$BASE/api/auth/login"

curl -s -b /tmp/fieldcore-owner.jar "$BASE/api/auth/me"
curl -s -b /tmp/fieldcore-owner.jar "$BASE/api/dashboard"
curl -s -b /tmp/fieldcore-owner.jar "$BASE/api/billing/subscription"
curl -s -b /tmp/fieldcore-owner.jar "$BASE/api/reports"
curl -s -b /tmp/fieldcore-owner.jar "$BASE/api/system/status"
curl -s -b /tmp/fieldcore-owner.jar "$BASE/api/audit-logs"
```

Expected:

```text
ok true responses
No passwordHash
No secrets
No stack traces
```

If your server is on 3001:

```bash
BASE=http://localhost:3001
```

---

# FINAL MVP SIGN-OFF

Open:

```text
docs/mvp-signoff-checklist.md
```

Mark items only after manual verification.

Minimum launch-readiness checklist:

```text
[ ] Automated tests pass
[ ] Migrations apply cleanly
[ ] Owner/admin flow works
[ ] Public booking works
[ ] Public tracking works
[ ] Admin request review works
[ ] Quote flow works
[ ] Client portal works
[ ] Scheduling works
[ ] Worker job lifecycle works
[ ] Proof-of-work works
[ ] Invoice/payment/receipt works
[ ] Notifications log/send/skip safely
[ ] SaaS billing page works
[ ] Reports page works
[ ] CSV export safe
[ ] Role boundaries hold
[ ] Rate limiting works
[ ] Health/readiness works
[ ] No passwordHash leaks
[ ] No provider secret leaks
[ ] No cross-company leaks
[ ] Backup plan reviewed
[ ] Deployment checklist reviewed
[ ] Security review reviewed
```

---

# Final Result

If every section passes, FieldCore is manually validated as:

```text
Feature-complete MVP
Ready for deployment QA
Ready for real provider smoke testing
Ready for demo preparation
Ready for launch polish
```

Do not treat manual QA as optional. Automated tests prove code paths; this simulation proves the product works as a real operating system.

## TASK3 Finance and Local Accounting QA

1. Log in as OWNER or ADMIN.
2. Open Settings → Finance & Exports.
3. Save finance settings:
   - default currency
   - allowed currencies
   - tax/VAT name
   - tax rate
   - invoice prefix
   - receipt prefix
4. Create a new invoice and confirm the invoice number uses the configured prefix.
5. Confirm a payment and confirm the generated receipt uses the configured prefix.
6. Export invoices, payments, receipts, and customers as CSV.
7. Confirm finance export logs appear in Settings → Finance & Exports.
8. Create a Xero/Sage/QuickBooks placeholder and press Test.
9. Confirm the test result says it is configured only and live sync is not implemented.
10. Log in as a worker and confirm finance settings/export endpoints are blocked.

## TASK4 Manual QA - Offline Worker Sync

1. Log in as a worker.
2. Register a device with `POST /api/worker/devices/register`.
3. Run `POST /api/worker/sync/bootstrap` and confirm only that worker's assigned jobs are returned.
4. Push a `JOB_NOTE` action with a unique idempotency key.
5. Push the same action again and confirm the response is `DUPLICATE`.
6. Try pushing an action for another worker's job and confirm it is `REJECTED`.
7. Push a proof-photo metadata action and confirm the record stores `capturedAt`, `offlineCreatedAt`, `deviceId`, GPS fields, and `syncId`.
8. Confirm admin/user tests still pass and no worker can access company-wide financial or management data through sync.


## TASK5 manual QA - Branches, approvals, and reports

- Create two branches and confirm they appear on the Branches page.
- Assign a customer and job to a branch, then filter jobs/reports by `branchId`.
- Confirm a worker cannot open `/api/branches`, `/api/approvals/pending`, or management reports.
- Create an approval request, approve it once, and confirm a second approve/reject attempt is blocked.
- Open each deeper report endpoint and confirm results are company-scoped and branch-aware.
- Confirm Company B cannot update or decide Company A branch/approval records.


## TASK6 offer-specific localization

FieldCore now supports company-level localization for country, timezone, currency, allowed currencies, tax/VAT label, quote expiry, payment terms, date/number format preferences, and configurable manual payment methods. Quotes, invoices, receipts, finance exports, public service summaries, and client-facing data can carry localization metadata.

Payment methods are configurable operational options only unless a real provider integration is separately configured. CSV export remains the accounting foundation; live Xero/Sage/QuickBooks sync is not claimed.

Manual QA should verify: finance settings save, payment methods restrict payment capture, public services show currency/tax metadata, invoices get default due dates, quotes get default expiry dates, and new WhatsApp/email template names exist without breaking existing notifications.


## TASK7 manual QA

1. Create two branches.
2. Give a branch manager access to only one branch.
3. Create an approval policy for invoice voids or payment refunds.
4. Attempt the risky action as admin and confirm it returns approval required.
5. Approve and execute as owner.
6. Confirm replaying the approval fails.
7. Confirm audit logs include the approval history and do not expose secret-like metadata.
