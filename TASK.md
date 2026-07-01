# TASK.md

# FieldCore Task: Phase 6A - Customer Booking Intake

## Read First

Read `AGENTS.md` before making changes.

Work only inside this repository:

```cmd
C:\Dev\FieldCore_Software
```

Do not inspect Codex attachment paths.

Do not read:

```cmd
C:\Users\USER\.codex\attachments
C:\Users\USER\OneDrive
C:\Windows
```

Use Windows CMD-safe commands only:

```cmd
npm.cmd
npx.cmd
node
```

Do not use PowerShell commands.

Do not use:

```cmd
npm
npx
.ps1 scripts
PowerShell-only syntax
```

Do not request escalated access unless the user explicitly approves it.

Do not fight the shell. If a command fails because of quoting, escaping, redirection, or sandbox ACL, do not retry the same approach more than once. Use direct file edits/patches instead.

---

# Current State

Completed phases:

```text
Phase 1: Backend foundation
Phase 2: White-label branding
Phase 3: Quote → Job → Invoice → Payment → Receipt
Phase 4: Scheduling engine
Phase 5: Worker operations
```

Phase 5 includes:

```text
Worker lifecycle
Activity timeline
Proof photos
Customer signature
Completion evidence
Worker-specific dashboard/interface
```

Do not rebuild completed phases.

Do not redesign the whole UI.

Do not touch worker lifecycle, proof photos, signatures, scheduling, invoices, payments, or receipts unless directly necessary.

---

# Phase 6 Direction

Phase 6 is Customer Portal + Booking Intake.

This task is only Phase 6A.

Do not build the full customer portal yet.

Do not build customer login yet unless absolutely necessary.

Do not build online payment yet.

Do not build WhatsApp/email notifications yet.

Do not build customer quote acceptance yet.

Those come later.

---

# Goal

Implement a customer-facing booking intake flow.

A public/customer page should allow a customer to submit a booking/service request.

The request should create a company-scoped booking/request record that admins can review.

Admin can then convert the booking request into an internal job or customer record.

The flow should be:

```text
Customer opens booking page
→ customer fills request form
→ request is stored
→ admin sees new booking request
→ admin reviews request
→ admin converts request into customer + job
```

---

# Key Product Rule

This should feel simple and stress-free.

The customer should not need an account for Phase 6A.

The customer should be able to submit a request quickly.

The admin should not have to manually copy/paste customer details into a job.

---

# Database

Add a model if it does not already exist.

## BookingRequest

Suggested fields:

```text
id
companyId
customerId optional
serviceId optional
status
customerName
customerEmail optional
customerPhone optional
address optional
serviceName optional
preferredDate optional DateTime
preferredTimeWindow optional
notes optional
source optional
convertedJobId optional
createdAt
updatedAt
```

Suggested status enum:

```text
NEW
REVIEWED
CONVERTED
DECLINED
CANCELLED
```

Rules:

* Every booking request must have `companyId`.
* Company A must never access Company B booking requests.
* A booking request can optionally link to a customer.
* A booking request can optionally link to a converted job.
* Do not delete booking requests after conversion.

If Prisma schema changes, add a migration:

```cmd
npm.cmd run migrate -- --name phase_6a_booking_intake
```

---

# Public Booking Page

Add a public/customer-facing booking page.

Suggested file:

```text
booking.html
```

The page should use existing FieldCore visual style.

It should not expose admin navigation.

It should show company branding if possible.

The form should include:

```text
Customer name
Email
Phone
Address
Service
Preferred date
Preferred time window
Notes / job details
Submit button
```

Service field:

* Prefer loading active services from the backend.
* If services cannot be loaded, allow free-text serviceName as fallback.

Preferred time window options:

```text
Morning
Afternoon
Evening
Any time
```

After submit, show a success message:

```text
Request received. The team will contact you shortly.
```

Do not redirect to admin dashboard.

Do not require login.

---

# Public API Routes

Add public-safe routes.

Suggested routes:

```text
GET  /api/public/company
GET  /api/public/services
POST /api/public/booking-requests
```

Important:

Since this is a public route, it cannot rely on logged-in user auth.

For now, use the current company/seed company as the target company if the app is single-company locally.

If the app already supports company slug/tenant lookup, use that.

Do not expose private company data.

Public company data may include only:

```text
brandName
logoUrl
primaryColor
secondaryColor
accentColor
supportEmail
supportPhone
```

Public services may include only:

```text
id
name
description
basePrice if already public/safe
```

Do not expose:

```text
users
workers
invoices
payments
receipts
internal settings
private customer data
```

---

# Admin Booking Requests UI

Add an admin page or admin section for booking requests.

Suggested file:

```text
booking-requests.html
```

Or add a section/page using existing admin layout patterns.

Admin/Owner should be able to see:

```text
New booking requests
Customer name
Phone/email
Address
Requested service
Preferred date/time
Status
Created date
Actions
```

Admin actions:

```text
View
Mark reviewed
Decline
Convert to Job
```

Do not show booking requests to workers.

---

# Convert Booking Request to Job

Add backend route:

```text
POST /api/booking-requests/:id/convert
```

Only OWNER/ADMIN can use it.

Conversion should:

1. Find or create a customer using booking request details.
2. Create a job using booking request details.
3. Link the booking request to the new job.
4. Change booking request status to `CONVERTED`.
5. Create audit log.

Job title should be reasonable, for example:

```text
Solar Panel Cleaning - Customer Name
```

If service is selected, link `serviceId`.

If no service is selected, use `serviceName` in the job title/notes.

Do not schedule automatically unless the preferred date is safe to use.

For Phase 6A, it is acceptable to create the job as unscheduled unless the current code already safely supports scheduled creation with conflict checks.

Do not bypass scheduling conflict logic.

---

# Admin Nav

Add booking requests to admin navigation only.

Suggested label:

```text
Booking Requests
```

Do not show this nav item to workers.

---

# Validation

Use Zod validation on write routes.

Customer name is required.

At least one contact method should be required:

```text
email or phone
```

Service is optional but recommended.

Notes should have a reasonable max length.

Do not allow huge unbounded text fields.

---

# Security

Public booking request creation must be safe.

Do not expose admin data.

Do not allow public users to set:

```text
companyId
status
convertedJobId
customerId
internal fields
```

The server must determine those fields.

Admin routes must require auth.

Worker must not access booking request admin routes.

Company isolation must be enforced on all admin booking request routes.

---

# Activity / Audit

When booking request is created:

```text
No internal job activity needed yet.
```

When admin converts a booking request:

```text
Create AuditLog
```

When admin declines/reviews a booking request:

```text
Create AuditLog
```

---

# Frontend UX Rules

Keep the UI clean.

Public booking page should be simple:

```text
Clear heading
Short description
Clean form
Submit button
Success state
Error state
```

Admin booking request page should use existing table/card styles.

Do not create an ugly separate design.

Do not break existing pages.

---

# Do Not Break

Do not break:

```text
Admin dashboard
Worker dashboard
Jobs page
Schedule/reschedule/unschedule
Quote creation
Quote acceptance
Invoice creation
Payment recording
Receipt viewing
Worker lifecycle
Proof photo upload
Signature canvas
Completion evidence checks
Branding
Login/logout
```

---

# Tests

Add focused tests.

Public booking request tests:

```text
Public user can submit valid booking request
Booking request requires customerName
Booking request requires email or phone
Public user cannot set status
Public user cannot set companyId
Public services route does not expose private data
```

Admin booking request tests:

```text
Admin can list company booking requests
Worker cannot list booking requests
Company A cannot see Company B booking requests
Admin can mark request reviewed
Admin can decline request
Admin can convert request to customer + job
Converted request links to job
Converting twice is idempotent or safely blocked
No passwordHash leaks
```

Regression tests:

```text
Existing job tests still pass
Existing worker lifecycle tests still pass
Existing proof/signature tests still pass
Existing money tests still pass
```

---

# Checks

Use the smallest relevant checks.

If Prisma schema changed:

```cmd
npx.cmd prisma validate
npm.cmd run build
npm.cmd run migrate -- --name phase_6a_booking_intake
```

For backend JS changes:

```cmd
node --check src/routes/api.js
```

For frontend JS changes:

```cmd
node --check assets/api.js
node --check assets/layout.js
```

After implementation:

```cmd
npm.cmd test
```

Do not run repeated build/test loops after every small edit.

---

# Manual Test

After implementation:

1. Start server:

```cmd
npm.cmd run dev
```

2. Open public booking page:

```text
http://localhost:3000/booking.html
```

3. Submit a booking request:

```text
Name: Test Customer
Phone: 0770000000
Email: test@example.com
Address: Test Address
Service: Any available service
Preferred date: Tomorrow
Time window: Morning
Notes: This is a Phase 6A test booking.
```

Expected:

```text
Success message appears
No login required
No console errors
```

4. Login as admin/owner.

5. Open booking requests page.

Expected:

```text
New request appears
Customer details visible
Requested service visible
Preferred date/time visible
Status is NEW
```

6. Click View.

Expected:

```text
Full request details visible
```

7. Mark reviewed.

Expected:

```text
Status changes to REVIEWED
```

8. Convert to Job.

Expected:

```text
Customer is created or linked
Job is created
Booking request status becomes CONVERTED
Booking request links to job
Job appears on Jobs page
```

9. Login as worker.

Expected:

```text
Worker cannot see booking requests nav
Worker cannot access booking requests admin data
Worker dashboard still works
```

---

# Regression Test

Confirm:

```text
Admin dashboard still works
Worker dashboard still works
New Job form still works
Proof/signature requirement fields still work
Worker proof photo upload still works
Signature canvas still works
Job completion evidence still works
Schedule conflict modal still works
Quote → accept → job still works
Completed job → invoice still works
Invoice → payment → receipt still works
No console errors
No passwordHash leaks
No cross-company access
```

---

# Done When

Done means:

```text
Public booking page exists
Customer can submit booking request without login
Admin can view booking requests
Admin can review/decline booking requests
Admin can convert booking request to customer + job
Worker cannot see booking request admin UI
Public routes do not expose private data
Company isolation is correct
Tests pass
Manual browser test passes
Existing phases still work
```
