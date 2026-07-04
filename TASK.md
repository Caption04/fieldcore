# TASK.md

# FieldCore Task: Phase 12 - Reporting & Analytics

## Read First

Read `AGENTS.md` before making changes.

Work only inside:

```bash
~/code/FieldCore_Software
```

Do not work inside OneDrive.

Do not inspect Codex attachment paths.

Do not read:

```text
C:\Users\USER\.codex\attachments
C:\Users\USER\OneDrive
C:\Windows
```

Do not request escalated access unless the user explicitly approves it.

Do not fight the shell. If a command fails because of quoting, escaping, redirection, or sandbox permissions, do not retry the same approach more than once. Use direct file edits/patches instead.

Do not run repeated full test/build loops after every small edit.

Use the smallest relevant checks.

---

# Current State

Completed:

```text
Phase 1: Backend foundation
Phase 2: White-label branding
Phase 3: Quote → Job → Invoice → Payment → Receipt
Phase 4: Scheduling engine
Phase 5: Worker operations
Phase 6: Full Client Portal
Phase 7A: Email Notifications Engine
Phase 7B: WhatsApp Notifications Completion
Phase 8: Public Booking / Request Portal
Phase 9: Proof-of-Work System
Phase 10: Production Readiness
Phase 11: SaaS Billing / Subscriptions
```

Phase 11 was validated with:

```text
npx prisma validate passed
npm run build passed
npm test passed
68 tests passed
0 failed
npx prisma migrate deploy passed
All migrations successfully applied
```

Now begin the final planned roadmap phase:

```text
Phase 12: Reporting & Analytics
```

---

# Big Goal

Build the reporting and analytics layer for FieldCore.

Owners/admins should be able to understand business performance from the platform.

Required analytics:

```text
revenue
unpaid invoices
completed jobs
worker performance
service popularity
quote conversion
customer history
```

This phase should make the system feel like a real operating dashboard, not just a CRUD tool.

Do not break Phases 1-11.

Do not rewrite the app.

Do not create fake analytics.

Do not count cross-company data.

Do not expose analytics to workers/clients/public unless explicitly safe.

This is the final planned feature/build phase of the MVP roadmap.

After this phase, the project should move into:

```text
manual QA
bug fixing
UI polish
deployment QA
provider smoke testing
demo setup
launch preparation
```

---

# Analytics Access Rules

Analytics must be company-scoped.

Allowed:

```text
owner
admin
```

Restricted:

```text
worker
client portal user
public user
```

Workers may have their own operational dashboard, but Phase 12 business analytics should not expose company financial analytics to workers unless the app already intentionally supports it.

Client portal users must not access company analytics.

Public users must not access analytics.

Mandatory:

```text
Company A cannot see Company B analytics.
No passwordHash leaks.
No provider secrets.
No raw storage secrets.
No private customer data beyond the authenticated company's records.
```

---

# Required Reporting Areas

## 1. Revenue Analytics

Show revenue over time.

Minimum metrics:

```text
total revenue
paid invoice total
payments received total
revenue by period
revenue by service if possible
revenue by customer if useful
average invoice value
```

Date filters:

```text
today
this week
this month
last month
last 30 days
this year
custom start/end dates
```

Use actual invoice/payment records.

Do not count unpaid invoices as revenue unless clearly labeled as projected/outstanding.

Separate:

```text
paid revenue
unpaid/open invoice value
overdue invoice value
```

---

## 2. Unpaid Invoice Analytics

Show unpaid money clearly.

Minimum metrics:

```text
unpaid invoice count
unpaid invoice total
overdue invoice count
overdue invoice total
partially paid invoice count if supported
oldest unpaid invoice
top unpaid customers
```

If due dates do not exist, use invoice status and created/sent dates.

Do not fake overdue logic.

If overdue cannot be calculated safely, label it as unpaid instead of overdue.

---

## 3. Completed Jobs Analytics

Show job completion performance.

Minimum metrics:

```text
completed jobs count
scheduled jobs count
cancelled jobs count if supported
in-progress jobs count
completion rate
average completion time if timestamps support it
jobs completed by period
jobs completed by service
jobs completed by worker
```

Use real job statuses and timestamps.

Do not invent completion time if job start/completion timestamps are missing.

---

## 4. Worker Performance Analytics

Show worker-level performance.

Minimum metrics:

```text
jobs assigned
jobs completed
jobs in progress
completion rate
average job duration if possible
proof-of-work completion compliance
late/missed jobs if scheduling data supports it
```

Use worker/company scoping.

Do not expose worker private information unnecessarily.

Owner/admin should be able to filter by worker.

Do not let workers compare everyone unless the app already intentionally supports that.

---

## 5. Service Popularity Analytics

Show which services are driving demand.

Minimum metrics:

```text
booking requests by service
jobs by service
revenue by service
quote conversion by service if possible
average invoice value by service if possible
```

Include public booking requests from Phase 8 if safe.

Separate requested services from completed/paid services where needed.

Do not mix service demand and revenue without labels.

---

## 6. Quote Conversion Analytics

Show quote funnel performance.

Minimum metrics:

```text
quotes created
quotes sent
quotes accepted
quotes rejected
acceptance rate
rejection rate
draft quote count
average quote value
accepted quote value
quote conversion by service if possible
quote conversion over time
```

Use existing quote statuses.

Quote accept/reject should remain idempotent.

Do not count draft quotes as sent.

---

## 7. Customer History / Customer Analytics

Show useful customer history.

Minimum metrics:

```text
total customers
new customers by period
repeat customers
top customers by revenue
customers with unpaid invoices
customer job history
customer quote history
customer payment history
customer service history
```

This may be shown:

```text
on a reporting page
inside customer detail
both if simple
```

Do not expose one customer's history to another customer.

Client portal users should only see their own records via existing client portal routes, not company-wide analytics.

---

# Reporting Dashboard UI

Add a reporting/analytics page.

Preferred:

```text
reports.html
assets/reports.js
```

or integrate into the existing admin dashboard if the project style fits better.

Minimum UI sections:

```text
Overview cards
Revenue
Unpaid invoices
Jobs
Workers
Services
Quote conversion
Customers
```

Add filters:

```text
date range
service
worker
customer if useful
```

Do not make the UI overly fancy.

Make it useful and readable.

No external chart library is required unless already present.

Simple cards/tables are acceptable.

Charts are optional.

If charts are added, keep them simple.

---

# Backend Reporting API

Add reporting endpoints.

Suggested routes:

```text
GET /api/reports/overview
GET /api/reports/revenue
GET /api/reports/invoices
GET /api/reports/jobs
GET /api/reports/workers
GET /api/reports/services
GET /api/reports/quotes
GET /api/reports/customers
```

or one route with sections:

```text
GET /api/reports?startDate=&endDate=&serviceId=&workerId=&customerId=
```

Choose the simplest maintainable approach.

Rules:

```text
all routes require internal auth
owner/admin only
company scoped
validate date inputs
validate IDs belong to authenticated company
return safe empty results
do not throw on empty data
do not leak passwordHash/secrets
```

---

# Date Filtering Rules

Reports must support date filtering.

Minimum accepted inputs:

```text
startDate
endDate
```

Rules:

```text
validate date format
reject invalid dates
endDate should be inclusive or documented clearly
do not allow huge unbounded expensive queries if avoidable
default to last 30 days or this month
```

Suggested defaults:

```text
period=last30days
```

If custom dates are provided:

```text
startDate <= endDate
```

Return safe 400 for invalid filters.

---

# Export Requirement

Add simple export support if practical.

Minimum acceptable:

```text
CSV export for reports
```

Suggested routes:

```text
GET /api/reports/revenue.csv
GET /api/reports/invoices.csv
GET /api/reports/jobs.csv
```

or:

```text
GET /api/reports/export?section=revenue
```

Rules:

```text
owner/admin only
company scoped
date filters respected
safe CSV escaping
no passwordHash/secrets
```

If export is too large, implement at least one useful CSV export:

```text
unpaid invoices CSV
completed jobs CSV
revenue/payments CSV
```

Do not overbuild PDF exports.

---

# Dashboard Integration

Existing dashboard should be improved or linked.

Add:

```text
Reports/Analytics nav link
summary cards on admin dashboard if simple
```

Possible dashboard cards:

```text
This month revenue
Unpaid invoice total
Jobs completed this month
Quote acceptance rate
Top service
```

Do not duplicate everything.

Dashboard can show summary; reports page can show detail.

---

# SaaS Billing Interaction

Phase 11 added SaaS plans/features.

Reporting may be plan-gated.

Minimum behavior:

```text
basic reports available to allowed active/internal plans
advanced reports can be gated if feature flag exists
blocked plan gets clear message
owner can still access billing
```

If plan gating is too risky, keep reports available to all ACTIVE/FREE_INTERNAL plans and document advanced reports as future.

Do not break existing companies/tests.

---

# Notifications / Audit / Production Integration

Phase 7, 10, 11 must remain intact.

Reporting should not create duplicate notifications.

If reporting export/download is important, optional audit log event can be recorded.

Do not notify customers about internal analytics.

Do not expose notification logs publicly.

System status should not expose analytics data.

---

# Performance Guidance

Keep reports efficient.

Use Prisma aggregations/counts where possible.

Avoid loading every record and doing huge in-memory calculations if a database aggregate is simple.

However, do not over-optimize prematurely.

For MVP scale, simple queries are acceptable if company-scoped and filtered.

Rules:

```text
companyId filter must be applied first
date filters must be applied where possible
large lists should be limited
top lists should have reasonable limits
```

Suggested top list limit:

```text
5 or 10
```

---

# Customer Detail Enhancement

If there is an admin customer detail page/modal, enhance it with customer history.

Show:

```text
quotes
jobs
invoices
payments
receipts
booking requests
total paid
unpaid total
last job date
last payment date
```

If no customer detail page exists, add customer history to reports/customers instead.

Do not create a massive CRM rewrite.

---

# Database / Prisma Guidance

Avoid schema changes unless needed.

Reporting should mostly use existing data.

Do not add analytics snapshot tables unless necessary.

Possible schema addition only if helpful:

```text
ReportExportLog
```

But prefer no schema changes unless required.

Do not destroy migrations.

Do not reset database.

If schema changed:

```bash
npx prisma validate
npm run build
npx prisma migrate dev --name phase_12_reporting_analytics
```

If schema is not changed, do not run migration.

---

# Environment Variables

No new env vars should be needed for basic reporting.

If export storage/email delivery is added, document any new env vars.

Do not add unnecessary env complexity.

---

# Security Rules

Mandatory:

```text
No worker access to company financial reports
No client access to company reports
No public access to reports
No cross-company analytics
No passwordHash leaks
No provider secret leaks
No raw storage secrets
No private internal notes in exports unless intentionally admin-only
No unvalidated companyId from query/body
No fake metrics
No counting another company's data
No unsafe CSV injection if exporting
```

CSV export should guard against formula injection by prefixing dangerous cell values if needed.

Dangerous CSV cell prefixes:

```text
=
+
-
@
```

---

# Backend Tests Required

Add focused tests.

Do not rely only on manual testing.

## Report Access Tests

Test:

```text
owner can access reports
admin can access reports
worker cannot access reports
client cannot access reports
public cannot access reports
company A cannot access company B report data
report responses do not expose passwordHash/secrets
```

## Revenue Tests

Test:

```text
paid revenue totals are calculated correctly
unpaid invoice totals are separate from paid revenue
date filters affect revenue totals
company scope is enforced
```

## Invoice Report Tests

Test:

```text
unpaid invoice count/total works
paid invoices are not counted as unpaid
overdue logic is safe if implemented
top unpaid customers are company scoped
```

## Job Report Tests

Test:

```text
completed job counts work
jobs by status work
jobs by service work
jobs by worker work
date filters work
company scope is enforced
```

## Worker Performance Tests

Test:

```text
worker assigned/completed counts work
worker completion rate works
worker performance does not include another company
worker private data is not overexposed
```

## Service Popularity Tests

Test:

```text
booking requests by service works
jobs by service works
revenue by service works if implemented
service rankings are company scoped
```

## Quote Conversion Tests

Test:

```text
created/sent/accepted/rejected counts work
acceptance rate is calculated safely
draft quotes are not counted as sent
date filters work
company scope is enforced
```

## Customer Analytics Tests

Test:

```text
top customers by revenue works
customer unpaid totals work
customer history is company scoped
client cannot access company-wide customer analytics
```

## Export Tests

If CSV export implemented, test:

```text
owner/admin can export
worker/client/public cannot export
date filters apply
CSV escapes values safely
CSV does not include secrets/passwordHash
company scope is enforced
```

## Regression Tests

Test:

```text
Phase 7 notifications still work
Phase 8 public booking still works
Phase 9 proof-of-work still works
Phase 10 health/readiness/rate limiting still work
Phase 11 billing/subscription gates still work
customer invoice/payment/receipt flow still works
client portal still works
worker job lifecycle still works
no cross-company leaks
no passwordHash leaks
```

---

# Frontend Tests / Checks

If frontend test system exists, add relevant tests.

If not, use syntax checks and manual QA.

Required syntax checks for changed frontend files:

```bash
node --check assets/reports.js
node --check assets/api.js
```

If reports are added to another file, check that file too.

---

# Manual Test Plan

After implementation, run:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/reports.html
```

or the route chosen by implementation.

## Owner/Admin Reports

As owner/admin:

```text
open reports page
view overview
change date range
filter by worker
filter by service
view revenue
view unpaid invoices
view jobs
view worker performance
view service popularity
view quote conversion
view customer history
export CSV if implemented
```

Expected:

```text
reports load
numbers are not obviously wrong
filters work
empty states are safe
no console errors
no secrets
```

## Worker/Client/Public Restrictions

As worker:

```text
try reports page and API
```

Expected:

```text
403 or safe redirect
no company analytics leak
```

As client portal user:

```text
try reports API
```

Expected:

```text
401/403
no company analytics leak
```

As public user:

```text
try reports API
```

Expected:

```text
401
no data leak
```

## Cross-Company Check

Use seeded/test companies if available.

Expected:

```text
Company A reports do not include Company B data.
Company A cannot request Company B worker/customer/service report data.
```

## Regression

Confirm:

```text
public booking still works
public tracking still works
client portal still works
admin quote/invoice/payment/receipt still works
worker proof-of-work flow still works
notifications still log/send
billing page still works
health/readiness still work
```

---

# Checks

Use the smallest relevant checks.

If Prisma schema changed:

```bash
npx prisma validate
npm run build
npx prisma migrate dev --name phase_12_reporting_analytics
```

Backend syntax:

```bash
node --check src/routes/api.js
```

Check new service files:

```bash
node --check src/services/reporting.service.js
```

Frontend syntax:

```bash
node --check assets/api.js
node --check assets/reports.js
```

Run build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

If migrations were added and local Postgres is available:

```bash
npx prisma migrate status
npx prisma migrate deploy
```

Do not run repeated full build/test loops after every small edit.

---

# Final MVP Sign-Off Checklist

Because Phase 12 is the final planned roadmap phase, add a final MVP sign-off checklist document.

Suggested file:

```text
docs/mvp-signoff-checklist.md
```

It should include:

```text
Phase 1-12 complete
manual browser QA complete
database migrations applied
seed/demo reset verified
backup plan reviewed
deployment checklist reviewed
security review reviewed
provider smoke tests complete
email provider tested
WhatsApp provider tested
file upload/storage tested
public booking tested
client portal tested
worker app/flow tested
proof-of-work tested
billing tested
reports tested
no known critical bugs
launch decision
```

Do not claim items are complete automatically.

This document is a checklist for final review.

---

# Done When

Phase 12 is complete when:

```text
Reporting/analytics APIs exist
Owner/admin can access reports
Workers/clients/public cannot access company reports
Revenue analytics work
Unpaid invoice analytics work
Completed jobs analytics work
Worker performance analytics work
Service popularity analytics work
Quote conversion analytics work
Customer history analytics work
Date filters work
Company scoping is enforced
CSV export exists if implemented
Reports UI exists
Dashboard links/summary exist
SaaS billing gates still work
Public booking still works
Client portal still works
Worker proof-of-work still works
Notifications still work
Production readiness checks still work
Customer invoice/payment/receipt flow still works
Tests pass
Manual reports QA passes
Final MVP sign-off checklist document exists
No cross-company leaks
No passwordHash leaks
No provider secret leaks
No fake metrics
No broken previous phases
```
