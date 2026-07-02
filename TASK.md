\# TASK.md



\# FieldCore Task: Complete Phase 6 - Full Client Portal



\## Read First



Read `AGENTS.md` before making changes.



Work only inside:



```cmd

C:\\Dev\\FieldCore\_Software

```



Use Windows CMD-safe commands only:



```cmd

npm.cmd

npx.cmd

node

```



Do not use PowerShell.



Do not inspect Codex attachment paths.



Do not read:



```cmd

C:\\Users\\USER\\.codex\\attachments

C:\\Users\\USER\\OneDrive

C:\\Windows

```



Do not request escalated access unless the user explicitly approves it.



Do not fight the shell. If a command fails because of quoting, escaping, redirection, or sandbox ACL, do not retry the same approach more than once. Use direct file edits/patches instead.



Do not run repeated full test/build loops after every small edit.



Use the smallest relevant checks.



\---



\# Current State



Completed:



```text

Phase 1: Backend foundation

Phase 2: White-label branding

Phase 3: Quote → Job → Invoice → Payment → Receipt

Phase 4: Scheduling engine

Phase 5: Worker operations

Phase 6A: Public booking intake

Phase 6B: Client portal foundation + client auth

```



Phase 6B added:



```text

ClientAccount model

ClientAccountStatus enum

Client auth register/login/logout/session

client-login.html

client-register.html

client-portal.html

assets/client-portal.js

Client dashboard

Client booking requests

Client profile

```



Manual test has passed for Phase 6B.



\---



\# Big Goal



Complete the rest of Phase 6:



```text

Full Client Portal

```



This is not a lightweight portal.



This is the real customer/client-facing portal for FieldCore.



The portal should now support:



```text

client quote viewing

client quote accept/reject

client invoice viewing

client receipt viewing

client payment status visibility

client job tracking

client proof-of-work viewing

client completion/signature evidence viewing

client profile management

client property/address management

client booking/request history

client dashboard summary across requests, quotes, jobs, invoices, receipts

```



Do not build fake data.



Do not build temporary throwaway pages.



Use the real existing Phase 3, Phase 4, Phase 5, Phase 6A, and Phase 6B systems.



\---



\# Implementation Strategy



You may implement this as one task, but keep it internally organized as:



```text

Phase 6C: Client Quotes

Phase 6D: Client Invoices / Payments / Receipts

Phase 6E: Client Jobs / Scheduling / Proof-of-Work

Phase 6F: Client Profile / Properties / Addresses

Phase 6G: Final Client Portal Polish + Security Regression

```



Do not break completed phases.



Do not rewrite the whole app.



Extend the existing client portal from Phase 6B.



Prefer adding client-safe API routes under:



```text

/api/client/...

```



Do not expose admin routes to clients.



\---



\# Absolute Security Rules



These rules apply to every client portal feature.



```text

Client can only access data for their own company

Client can only access data linked to their ClientAccount and linked Customer

Client cannot access admin routes

Client cannot access worker routes

Client cannot access other customers

Client cannot set companyId

Client cannot set customerId directly

Client cannot set internal statuses directly

Client cannot set quote totals

Client cannot set invoice totals

Client cannot edit job status

Client cannot edit worker assignments

Client cannot edit proof photos

Client cannot edit signatures

Client cannot see passwordHash

Client cannot see internal user records

Client cannot see admin-only notes unless they are clearly customer-facing

Client cannot see company-wide revenue/stats

Worker cannot access client portal routes

Public unauthenticated users cannot access client portal routes

No cross-company leaks

No passwordHash leaks

```



Use the existing client auth middleware from Phase 6B.



If middleware is incomplete, improve it carefully.



Do not reuse internal OWNER/ADMIN/WORKER permissions for client access.



\---



\# Data Ownership Rule



Client ownership should be based on:



```text

ClientAccount.companyId

ClientAccount.customerId

```



If `ClientAccount.customerId` is missing, safely return empty lists for customer-linked resources until a Customer is linked.



Do not guess ownership by email alone for sensitive data unless it happens during a controlled account-linking step.



Safe default:



```text

No linked customer = no quotes, invoices, jobs, receipts

```



Booking requests may be visible if linked by:



```text

BookingRequest.clientAccountId

```



or safely linked customer ownership.



\---



\# Do Not Build Yet Unless Already Supported



Do not build a brand-new payment gateway from scratch.



If the app already has a payment initiation flow, expose a safe client-facing invoice payment action.



If the app only supports admin-recorded payments, then the client portal should show:



```text

invoice status

amount paid

amount due

receipts

payment history

```



and should not fake payment processing.



Do not build WhatsApp/email notifications in this task.



Do not build full messaging/chat in this task.



Do not build admin client-account management unless it is tiny and necessary.



\---



\# Required Client Portal Sections



Update the client portal so the navigation has real sections:



```text

Dashboard

My Requests

My Quotes

My Jobs

My Invoices

Receipts

Profile

Properties

Logout

```



If `Properties` is too large, keep it simple but real.



Do not show fake data.



Do not use the admin sidebar.



Do not show admin dashboards, worker dashboards, reports, settings, customers table, internal schedule management, or company-wide financial numbers to clients.



\---



\# Phase 6C - Client Quotes



\## Backend Routes



Add routes under:



```text

/api/client/quotes

```



Required:



```text

GET  /api/client/quotes

GET  /api/client/quotes/:id

POST /api/client/quotes/:id/accept

POST /api/client/quotes/:id/reject

```



All require client auth.



\## GET /api/client/quotes



Return only quotes owned by the logged-in client.



Suggested safe fields:



```text

id

quoteNumber

status

customerId

createdAt

updatedAt

validUntil / expiresAt if available

subtotal

tax

discount

total

currency if available

short service/job/request summary if available

```



Sort newest first.



Do not expose:



```text

other customers

internal users

workers

admin audit internals

passwordHash

```



\## GET /api/client/quotes/:id



Return safe quote detail.



Include:



```text

quote header

quote number

status

customer-safe customer details

line items

subtotal

tax

discount

total

customer-facing notes

validUntil / expiry if available

linked job if already created

created date

updated date

```



Line items should include:



```text

description/name

quantity

unit price

total

```



Do not expose internal-only notes unless already clearly customer-facing.



\## POST /api/client/quotes/:id/accept



Allow the client to accept their own quote.



Rules:



```text

client must own quote

quote must be in acceptable status

accept should use existing Phase 3 quote acceptance logic if available

accept should create/link job only if existing admin quote acceptance flow does that

do not duplicate jobs on repeated accept

accept should be idempotent if already accepted

write status history/audit if existing system supports it

return updated safe quote

```



Suggested acceptable statuses:



```text

SENT

PENDING

```



Already accepted status:



```text

ACCEPTED

```



Do not allow acceptance if quote is:



```text

DRAFT

REJECTED

CANCELLED

EXPIRED

```



unless the existing app uses different status names.



Use the existing enum/status names.



\## POST /api/client/quotes/:id/reject



Allow the client to reject their own quote.



Request body:



```json

{

&#x20; "reason": "optional text"

}

```



Rules:



```text

client must own quote

quote must be rejectable

reject should update quote status using existing model/status history

reason should be stored only if there is an existing safe place

if no reason field exists, store as status history note if supported

return updated safe quote

```



Reject should not delete the quote.



Reject should not delete customer/job/payment data.



\## Client Portal UI



Make `My Quotes` real.



Show:



```text

quote list

quote status badge

quote total

quote date

quote expiry if available

View button

```



Quote detail view/modal should show:



```text

quote number

status

line items

subtotal

tax/discount if available

total

customer-facing notes

accept button

reject button

```



Accept flow:



```text

client clicks Accept

confirmation appears

client confirms

quote updates to ACCEPTED

UI refreshes

accept button disappears/disabled

success message appears

```



Reject flow:



```text

client clicks Reject

optional reason input appears

client confirms

quote updates to REJECTED

UI refreshes

reject button disappears/disabled

success message appears

```



Empty state:



```text

No quotes yet.

When your quote is ready, it will appear here.

```



\---



\# Phase 6D - Client Invoices / Payments / Receipts



\## Backend Routes



Add routes:



```text

GET /api/client/invoices

GET /api/client/invoices/:id

GET /api/client/receipts

GET /api/client/receipts/:id

GET /api/client/payments

```



Optional if existing payment initiation flow exists:



```text

POST /api/client/invoices/:id/pay

```



Do not build fake payment processing.



\## GET /api/client/invoices



Return only invoices belonging to the client’s linked customer.



Safe fields:



```text

id

invoiceNumber

status

customerId

quoteId if available

jobId if available

createdAt

updatedAt

dueDate if available

subtotal

tax

discount

total

amountPaid if available

amountDue if available

currency if available

```



Sort newest first.



\## GET /api/client/invoices/:id



Return safe invoice detail.



Include:



```text

invoice header

invoice number

status

line items

subtotal

tax

discount

total

amount paid

amount due

due date

linked quote/job if available

payment history if safe

receipt references if available

customer-facing notes

```



Line items:



```text

description/name

quantity

unit price

total

```



\## GET /api/client/payments



Return only payment records linked to the client’s own invoices/customer.



Safe fields:



```text

id

invoiceId

amount

method

status

createdAt

reference if customer-safe

```



Do not expose admin-only payment notes or gateway secrets.



\## GET /api/client/receipts



Return only receipts belonging to the client’s linked customer/invoices.



Safe fields:



```text

id

receiptNumber

invoiceId

paymentId

amount

createdAt

download/view reference if existing

```



\## Optional Pay Action



Only add:



```text

POST /api/client/invoices/:id/pay

```



if the existing codebase already has a payment initiation provider/service.



Rules:



```text

client must own invoice

invoice must have amount due

do not allow paying another client’s invoice

return safe payment redirect/session/reference

do not expose provider secrets

do not fake success

```



If no real provider flow exists, show a disabled/status message:



```text

Online payment is not available yet. Please contact the company.

```



\## Client Portal UI



Make `My Invoices` real.



Show:



```text

invoice list

invoice number

status badge

total

amount paid

amount due

due date

View button

Pay button only if real payment route exists and invoice is payable

```



Invoice detail:



```text

invoice number

status

line items

subtotal

tax/discount

total

paid

due

payment history

linked receipts

```



Make `Receipts` real.



Show:



```text

receipt list

receipt number

invoice number

payment amount

date

View button

```



Receipt detail:



```text

receipt number

invoice reference

payment reference

amount

date

customer/company safe details

```



Do not create fake PDF downloads unless existing generation exists.



If existing receipt generation/download exists, expose it safely.



\---



\# Phase 6E - Client Jobs / Scheduling / Proof-of-Work



\## Backend Routes



Add routes:



```text

GET /api/client/jobs

GET /api/client/jobs/:id

GET /api/client/jobs/:id/proof-photos

GET /api/client/jobs/:id/signature

GET /api/client/jobs/:id/activity

```



All require client auth.



\## GET /api/client/jobs



Return only jobs belonging to the client’s linked customer.



Safe fields:



```text

id

jobNumber / reference if available

status

customerId

quoteId if available

invoiceId if available

scheduledStart if available

scheduledEnd if available

address

service summary

createdAt

updatedAt

completedAt if available

```



Do not expose:



```text

all workers

internal worker notes

worker private phone/email unless deliberately customer-facing

internal route optimization data

admin notes

company-wide schedule

```



\## GET /api/client/jobs/:id



Return safe job detail.



Include:



```text

job reference

status

service details

address

scheduled date/time

arrival/start/pause/resume/complete timestamps if customer-safe

completion notes if customer-facing

linked quote

linked invoice

proof requirement summary

signature/completion evidence summary

```



Do not expose internal notes unless safe.



\## Proof Photos



Route:



```text

GET /api/client/jobs/:id/proof-photos

```



Return only proof photos for the client’s own job.



Safe fields:



```text

id

url/path

caption if available

createdAt

uploadedBy role/name only if safe

```



Do not allow clients to upload/delete proof photos in this phase.



\## Signature



Route:



```text

GET /api/client/jobs/:id/signature

```



Return customer-visible signature/completion evidence if present.



Safe fields:



```text

id

url/path

signedByName if available

createdAt

```



Do not allow clients to delete/edit signature in this phase.



\## Activity



Route:



```text

GET /api/client/jobs/:id/activity

```



Return customer-safe activity only.



Allowed examples:



```text

Job scheduled

Worker arrived

Work started

Work paused

Work resumed

Work completed

Proof uploaded

Signature collected

```



Do not expose internal admin/audit logs.



\## Client Portal UI



Make `My Jobs` real.



Jobs list should show:



```text

job status

service/job title

scheduled date/time

address

completion status

View button

```



Job detail should show:



```text

job status

schedule

service/address

timeline

linked quote/invoice if available

proof photos gallery

signature/completion evidence preview

```



Empty state:



```text

No jobs yet.

Accepted quotes and scheduled work will appear here.

```



Do not let client mutate job status.



No client reschedule requests in this phase unless already easy and safe.



\---



\# Phase 6F - Client Profile / Properties / Addresses



\## Profile Routes



Use existing Phase 6B profile routes, improve if needed:



```text

GET   /api/client/profile

PATCH /api/client/profile

```



Safe editable fields:



```text

name

phone

```



Email can remain read-only unless validation already exists.



Client cannot edit:



```text

companyId

customerId

status

passwordHash

internal fields

```



If linked to Customer, keep safe fields synced where appropriate.



\## Property / Address Model



If there is already a customer address/property model, use it.



If not, add a simple model.



Suggested model:



```text

ClientProperty

```



or if better aligned with existing code:



```text

CustomerProperty

```



Suggested fields:



```text

id

companyId

customerId

clientAccountId optional

label

addressLine1 / address

city optional

notes optional

isDefault

createdAt

updatedAt

```



Rules:



```text

belongs to company

belongs to customer or client account

client can only access own properties

client cannot set companyId directly

client cannot attach property to another customer

```



If creating a new model, add Prisma migration:



```cmd

npm.cmd run migrate -- --name phase\_6\_client\_properties

```



\## Property Routes



Add:



```text

GET    /api/client/properties

POST   /api/client/properties

PATCH  /api/client/properties/:id

DELETE /api/client/properties/:id

```



Rules:



```text

client can list own properties

client can create own property

client can update own property

client can delete own property only if safe

client cannot access another client’s property

client cannot set companyId

client cannot set customerId unless server verifies it

```



Validation:



```text

label required or defaulted

address required

notes max length

isDefault boolean

only one default property per client/customer if implemented

```



\## Client Portal UI



Make `Profile` real.



Show:



```text

name

email

phone

linked customer summary if available

save button

```



Make `Properties` real.



Show:



```text

property/address list

default badge

add property form/modal

edit property

delete property confirmation

```



Booking request forms inside the client portal may optionally use saved properties.



Do not break public `booking.html`.



\---



\# Phase 6G - Dashboard + Portal Polish



Update client dashboard to summarize the full portal.



Dashboard should include:



```text

open booking requests

pending quotes

accepted quotes

upcoming jobs

active jobs

unpaid invoices

paid invoices/receipts

recent activity

profile completeness

```



Only use client-owned data.



Do not show company-wide stats.



Dashboard should include useful quick actions:



```text

Submit New Request

View Quotes

View Jobs

View Invoices

Update Profile

```



No fake numbers.



If data is unavailable, show clean empty states.



\---



\# Client Portal Routing / Frontend Structure



You can keep using:



```text

client-portal.html

assets/client-portal.js

```



with tabbed sections.



Do not create many separate pages unless simpler.



Preferred:



```text

client-portal.html

assets/client-portal.js

```



Sections:



```text

dashboard

requests

quotes

jobs

invoices

receipts

profile

properties

```



State should be simple and reliable.



Use existing API helper style if available.



Do not use admin `layout.js` sidebar for client portal.



Client portal should have its own shell.



\---



\# Public Booking Integration



Do not break:



```text

booking.html

assets/booking.js

```



Public booking must still work without login.



Optional improvement:



If client is logged in and submits a request from the public booking page, link it to ClientAccount where safe.



But do not spend too much time on this if it risks breaking Phase 6A.



Client portal should have its own logged-in request submission already from Phase 6B.



\---



\# Admin Integration



Do not rewrite admin systems.



But ensure:



```text

admin-created quotes appear in correct client portal

admin-created invoices appear in correct client portal

admin-created receipts appear in correct client portal

admin-created/scheduled jobs appear in correct client portal

admin booking request conversion still works

```



Admin booking request detail may show:



```text

linked ClientAccount yes/no

client name/email

```



Only if easy and already partly present.



Do not build full admin client management now unless tiny.



\---



\# Worker Integration



Do not change worker flows except if necessary to make proof/job data visible client-side.



Worker must still be able to:



```text

view assigned jobs

arrive/start/pause/resume/complete

upload proof photos

collect signature

complete job with required proof/signature

```



Client portal must only read safe outputs of worker operations.



Clients must not be able to alter worker operations.



\---



\# Database / Prisma Guidance



Avoid schema changes unless needed.



Possible schema changes:



```text

ClientProperty / CustomerProperty model

BookingRequest clientAccountId already exists from Phase 6B

Maybe customer-facing notes fields only if absolutely necessary

```



Do not rename existing models/enums.



Do not destroy migrations.



Do not reset database.



If schema changed:



```cmd

npx.cmd prisma validate

npm.cmd run build

npm.cmd run migrate -- --name phase\_6\_complete\_client\_portal

```



If schema is not changed, do not run migration.



\---



\# Required Tests



Add focused tests for each area.



\## Client Quotes



Test:



```text

client can list own quotes

client with no linked customer gets empty list

client cannot see another customer’s quote

company A client cannot see company B quote

client can open own quote detail

quote detail includes line items/totals

client can accept own acceptable quote

accept does not duplicate job on repeated call

client can reject own rejectable quote

client cannot accept/reject another customer’s quote

unauthenticated cannot access client quotes

worker/internal auth does not count as client auth

no passwordHash leaks

```



\## Client Invoices / Receipts / Payments



Test:



```text

client can list own invoices

client can open own invoice detail

client cannot see another customer’s invoice

client can list own receipts

client can open own receipt detail

client can list own payments if route exists

client cannot see another customer’s payments/receipts

invoice detail includes safe line items/totals/payment status

unauthenticated cannot access client invoices

no gateway secrets leak

no passwordHash leaks

```



\## Client Jobs / Proof / Signature



Test:



```text

client can list own jobs

client can open own job detail

client cannot see another customer’s job

client can see own job proof photos

client can see own job signature/completion evidence

client can see customer-safe activity

client cannot mutate job status

client cannot upload/delete proof photos

client cannot delete/edit signatures

unauthenticated cannot access client jobs

worker/internal auth does not count as client auth

no internal notes leak

no passwordHash leaks

```



\## Client Profile / Properties



Test:



```text

client can read profile

client can update safe profile fields

client cannot update companyId/customerId/status/passwordHash

client can list own properties

client can create own property

client can update own property

client can delete own property if safe

client cannot access another customer’s property

company A client cannot access company B property

no passwordHash leaks

```



\## Dashboard



Test:



```text

client dashboard summarizes only own data

dashboard does not include admin/company-wide stats

dashboard handles empty data

dashboard does not leak other customer data

```



\## Regression



Test:



```text

client auth still works

client booking requests still work

public booking intake still works

admin booking request review/decline/convert still works

admin quote flow still works

quote-to-job flow still works

invoice/payment/receipt flow still works

schedule conflict detection still works

worker dashboard still works

worker proof/signature completion still works

admin nav still works

worker nav still restricted

no cross-company leaks

no passwordHash leaks

```



\---



\# Manual Test Plan



After implementation, start server:



```cmd

npm.cmd run dev

```



\## Client Login



Open:



```text

http://localhost:3000/client-login.html

```



Login with existing test client or register:



```text

Name: Client Test

Email: client-test@example.com

Phone: 0771111111

Password: ClientTest123!

```



Open:



```text

http://localhost:3000/client-portal.html

```



Expected:



```text

client portal loads

client nav shows Dashboard, My Requests, My Quotes, My Jobs, My Invoices, Receipts, Profile, Properties, Logout

no admin sidebar

no worker sidebar

no admin stats

```



\## Quotes



As admin, create/send a quote for the linked customer.



As client:



```text

My Quotes shows quote

quote detail opens

line items/totals are correct

accept works

status changes to ACCEPTED

repeated accept does not duplicate job

```



Create another quote.



As client:



```text

reject works

optional reason works

status changes to REJECTED

accept no longer available

```



\## Invoices / Receipts



As admin, create invoice/payment/receipt for the linked customer.



As client:



```text

My Invoices shows invoice

invoice detail opens

line items/totals are correct

amount paid/due is correct

Receipts shows receipt

receipt detail opens

```



If online payment is not implemented, there must be no fake payment success.



\## Jobs / Proof / Signature



As admin/worker, create/schedule/operate a job for the linked customer.



As worker:



```text

arrive/start/pause/resume/complete still works

proof photo upload still works

signature canvas still works

completion requirements still work

```



As client:



```text

My Jobs shows job

job detail opens

schedule/status are visible

timeline is visible

proof photos are visible after upload

signature/completion evidence is visible after collected

client cannot alter job status

client cannot delete proof/signature

```



\## Profile / Properties



As client:



```text

Profile loads

name/phone update works

email is read-only or safely validated

restricted fields cannot be changed

Properties loads

add property works

edit property works

delete property works if enabled

default property works if implemented

```



\## Security



Try:



```text

logged-out user opens client routes

worker opens client routes

client guesses another quote ID

client guesses another invoice ID

client guesses another job ID

client guesses another receipt ID

client guesses another property ID

```



Expected:



```text

401/403/404 safe rejection

no data leak

no passwordHash

no cross-company access

```



\## Regression



Confirm:



```text

Public booking page still works without login

Logged-in client booking request still works

Admin Booking Requests page still works

Admin can review/decline/convert booking requests

Admin quote pages still work

Quote acceptance still creates/links job according to existing logic

Schedule conflict modal still works

New Job form still works

Proof/signature requirement fields still work

Invoice/payment/receipt flow still works

Worker dashboard still works

Worker nav still restricted

Admin nav still has Booking Requests

No console errors

```



\---



\# Checks



Use the smallest relevant checks.



If Prisma schema changed:



```cmd

npx.cmd prisma validate

npm.cmd run build

npm.cmd run migrate -- --name phase\_6\_complete\_client\_portal

```



Backend syntax:



```cmd

node --check src/routes/api.js

```



Frontend syntax:



```cmd

node --check assets/api.js

node --check assets/layout.js

node --check assets/booking.js

node --check assets/client-portal.js

```



Run tests:



```cmd

npm.cmd test

```



If a new frontend file is added, run `node --check` on it too.



Do not run repeated full build/test loops after every small edit.



\---



\# Done When



Phase 6 is complete when:



```text

Client portal has real Dashboard, Requests, Quotes, Jobs, Invoices, Receipts, Profile, and Properties sections

Client can view own quotes

Client can accept/reject own quotes

Client can view own invoices

Client can view own payments/payment status where available

Client can view own receipts

Client can view own jobs

Client can view own job schedule/status/timeline

Client can view own proof photos

Client can view own signature/completion evidence

Client can manage own profile safely

Client can manage own properties/addresses safely

Client cannot access another customer’s data

Client cannot access admin/worker/internal data

Public booking intake still works

Admin booking requests still work

Admin quote/invoice/payment/receipt flows still work

Worker operations still work

Scheduling still works

Proof/signature completion still works

Tests pass

Manual browser test passes

No passwordHash leaks

No cross-company leaks

No fake payment success

No fake data

```

