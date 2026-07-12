Read AGENTS.md first and follow it strictly.

Work only inside:

/home/kuhlinji/code/FieldCore_Software

Before editing:
1. Confirm pwd.
2. Inspect the current implementation.
3. Make a short implementation plan.
4. Preserve all completed functionality.
5. Do not redesign the entire application.
6. Use the existing FieldCore visual language.
7. Do not integrate a real SaaS payment provider in this task.

This task changes:
- owner signup/onboarding
- SaaS plan selection and mock billing UX
- FieldCore subscription management
- global profile/account dropdown
- company member invitations
- role templates
- granular permissions
- access scopes
- onboarding delegation

IMPORTANT CURRENT REPO CONTEXT

The current system has:
- register.html
- onboarding.html
- settings.html
- assets/auth.js
- assets/api.js
- assets/layout.js
- assets/app.css
- src/app.js
- src/routes/api.js
- prisma/schema.prisma
- src/services/subscription.service.js
- src/services/saasBilling.service.js

The current Prisma Role enum is:

OWNER
ADMIN
WORKER

The repo already contains:
- PermissionRoleTemplate
- UserPermissionOverride
- UserBranchAccess
- permissionKeys
- defaultPermissionBundles
- requirePermission()
- branch-scoped access support

Do not throw this away and create a completely separate authorization system.

However, the existing permission system is currently too shallow:
- many pages and routes still rely directly on OWNER / ADMIN / WORKER
- PermissionRoleTemplate is tied directly to the Role enum
- only a relatively small set of enterprise permissions exists
- ADMIN still effectively means broad access
- there is no proper invitation lifecycle
- there are no rich business role templates
- there is no proper team/group management scope
- signup currently creates the company and immediately redirects to the dashboard
- SaaS billing currently has mock/incomplete provider behaviour
- FieldCore Subscription currently exists as a Settings panel
- the current global layout places the user block at the bottom of the sidebar instead of a top-right account menu

Do not rebuild unrelated completed features.

==================================================
PART 1 — NEW OWNER SIGNUP AND ONBOARDING FLOW
==================================================

The current signup flow is too simple.

Replace the current behaviour:

Register
→ immediately enter dashboard

with:

Create owner account
→ answer basic business questions
→ choose FieldCore plan
→ confirm mock plan/payment
→ enter dashboard

The person initially signing up is the COMPANY OWNER.

The owner does not need to complete detailed operational configuration during signup.

The signup process should collect only basic information needed to create the company workspace.

Use a polished multi-step onboarding experience.

Suggested signup structure:

STEP 1 — OWNER ACCOUNT
- Full name
- Work email
- Password
- Confirm password if appropriate

STEP 2 — BUSINESS BASICS
- Company name
- Country / market
- Industry / business vertical
- Approximate company/team size

Do not turn signup into a giant configuration form.

Detailed company configuration belongs inside the application and can later be completed by the owner or an invited senior staff member.

The business vertical must be stored because it will later influence the built-in role templates available to that company.

Do NOT hard-code HVAC as the chosen vertical.

HVAC was only an example.

The architecture must support different verticals later.

Examples conceptually:

verticalKey:
- generic
- hvac
- plumbing
- electrical
- cleaning
- facilities
- etc.

Do not invent FieldCore's final target vertical in this task.

For an unknown or unsupported vertical, use generic business role templates.

--------------------------------------------------
ONBOARDING STATE
--------------------------------------------------

After registration, create the authenticated owner and company, but do not allow normal dashboard onboarding to be silently skipped.

Introduce a clear onboarding state, for example:

ACCOUNT_CREATED
PLAN_SELECTION_REQUIRED
PLAN_SELECTED
COMPLETED

Use the cleanest implementation for the current architecture.

The owner may have a valid authenticated session while onboarding is incomplete, but normal application navigation should redirect them to the required onboarding step until plan selection is completed.

Do not create redirect loops.

Existing users and seeded/demo users must continue to work.

Do not break the demo company.

==================================================
PART 2 — PLAN SELECTION PAGE
==================================================

After basic signup, send the owner to a dedicated FieldCore plan selection page.

Create a polished SaaS pricing page inspired by the STRUCTURE of the supplied Brevo screenshots, but do not copy Brevo branding or blindly reproduce its design.

The page should use FieldCore styling.

Required structure:

Top:
- clear heading
- short explanation
- Monthly / Annual segmented toggle

Example:

[ Monthly ] [ Annual — Save 10% ]

The annual option must clearly show:
- that annual billing saves money
- the percentage saving
- the annual total
- preferably the equivalent monthly cost where useful

Use one central configurable annual discount value.

For the current mock/demo implementation, use:

10% annual saving

Do not scatter the 10% calculation around multiple frontend files.

Keep the commercial calculation in one source of truth.

The current plans are based on the existing SaaSPlan/subscription system.

Do not casually change:
- existing plan identities
- limits
- features
- regional pricing
- company isolation

Current public plan concepts include:
- Basic
- Standard
- Enterprise / custom pricing

Use the actual current plan data returned by the backend.

Do not hard-code duplicate pricing tables in multiple places.

--------------------------------------------------
PLAN CARDS
--------------------------------------------------

Each plan card should include:

- Plan name
- Short description
- Price
- Billing interval
- Key included features
- Main CTA
- Current plan badge where relevant
- Recommended / most popular treatment where appropriate if already defined or intentionally configured

For monthly mode:

Example:

$500 / month

For annual mode:

Show something like:

$5,400 billed annually
Equivalent to $450/month
Save $600/year

The exact numbers must be calculated from the plan's actual monthly price and annual discount.

Regional pricing must continue to work.

Do not assume every company is billed in USD.

Enterprise/custom-priced plans must continue to show:

Contact us

rather than a fake numeric price.

==================================================
PART 3 — MOCK PAYMENT / PLAN CONFIRMATION
==================================================

THERE MUST BE NO REAL PAYMENT PROCESSING IN THIS TASK.

Do not:
- call Stripe
- call Paynow
- call PayFast
- open a real payment checkout
- send card details anywhere
- introduce a real external payment provider

This is still a mock/test billing flow.

When the user clicks a paid plan CTA:

1. Open a confirmation modal.
2. Clearly show:
   - selected plan
   - monthly or annual interval
   - displayed amount
3. Show a confirmation action.

Example:

You are selecting the Standard plan.

Billing:
Annual

Amount:
$16,200/year

[Cancel] [Confirm Plan]

The wording can be polished, but the interaction must be clear.

When Confirm is clicked:

- simulate the plan selection internally
- save the selected plan
- save the billing interval
- update the company subscription using the current internal/mock billing architecture
- create an appropriate billing/audit event
- mark required onboarding plan selection as complete
- redirect to the dashboard

No external payment must occur.

Make it obvious in the implementation that this is mock billing and can later be replaced with a real provider.

Do not add fake credit-card forms.

--------------------------------------------------
ENTERPRISE PLAN
--------------------------------------------------

Enterprise is contact-based.

When the owner clicks the Enterprise CTA:

Open a modal explaining that Enterprise requires contact/custom setup.

The modal should have an appropriate action such as:

Contact us / Continue

For the current mock QA flow, clicking the final action should:
- record that Enterprise was selected or requested
- record an appropriate mock/contact billing event
- complete the onboarding gate
- take the owner to the dashboard

Do not open a real payment process.

Do not invent an external CRM workflow in this task.

==================================================
PART 4 — FIELDCORE SUBSCRIPTION PAGE
==================================================

The same polished billing structure must also exist after onboarding.

The current Settings page contains:

FieldCore Subscription

as a Settings sub-panel.

Move FieldCore Subscription out of the Settings side-tab navigation and make it a dedicated account-level page.

Create or use a clean dedicated route/page such as:

subscription.html

The subscription page must use the same reusable billing components and calculations as onboarding.

Do not create two unrelated pricing implementations.

The dedicated FieldCore Subscription page should show:

1. Current subscription
2. Current plan
3. Current billing interval
4. Current subscription status
5. Monthly / Annual toggle
6. Available plans
7. Annual savings
8. Current plan indicator
9. Mock plan-change confirmation modal
10. Enterprise contact behaviour
11. Existing usage information where appropriate

Changing plans in this page must remain mock/internal.

Use the same shared pricing calculation logic as the onboarding plan page.

Avoid duplicating:
- annual calculations
- plan card rendering rules
- regional price handling
- enterprise/custom pricing logic

==================================================
PART 5 — GLOBAL TOP-RIGHT PROFILE / ACCOUNT MENU
==================================================

Change the global authenticated application layout.

The current user/account control is primarily at the bottom of the sidebar.

Replace or refactor this into a proper top-right account dropdown similar in STRUCTURE to the supplied Brevo screenshot.

Do not copy Brevo styling exactly.

Use FieldCore styling.

The top-right trigger should show appropriate account identity, for example:
- initials/avatar
- user name or company context
- current role title where appropriate
- dropdown arrow

Clicking it opens an account menu.

Required items:

- Settings
- FieldCore Subscription
- Security
- Log out

The red-marked items currently shown inside the Settings workspace navigation should no longer live there as normal settings sub-tabs:

- FieldCore Subscription
- Security

FieldCore Subscription should open the dedicated subscription page.

Security should open the existing dedicated security experience/page.

Settings should open normal company/application settings.

Log out must continue using the existing secure logout flow.

Do not duplicate logout logic.

The menu must:
- close when clicking outside
- be keyboard-accessible where practical
- work across authenticated desktop pages
- not break the mobile sidebar/menu

Remove the redundant old sidebar-bottom logout/account treatment if it is no longer needed.

Avoid showing two competing account menus.

==================================================
PART 6 — OWNER, MEMBERS, ROLE TEMPLATES AND PERMISSIONS
==================================================

This is a major architectural improvement.

The system must stop treating:

OWNER
ADMIN
WORKER

as the complete business organisational structure.

However:

DO NOT simply add dozens of new values to the Prisma Role enum.

Do not create:

COO
ACCOUNTANT
GENERAL_MANAGER
DISPATCHER
SENIOR_TECHNICIAN
etc.

as hard-coded application logic where every role directly controls functionality.

Instead build:

ROLE TEMPLATE
+
PERMISSIONS
+
SCOPE
=
ACTUAL ACCESS

A person's displayed business role/job title and their actual permissions are related but not identical.

Example:

Job title:
COO

Role template:
Senior Executive

Permissions:
Almost everything

Scope:
Entire company

Another example:

Job title:
Personal Assistant

Role template:
Full Administrator

Permissions:
Almost everything

Scope:
Entire company

Another:

Job title:
Operations Manager

Permissions:
- view jobs
- manage jobs
- view schedules
- manage schedules
- view workers
- manage workers
- view operational reports

No permissions for:
- revenue
- accounting
- subscription billing

Another:

Job title:
Accountant

Permissions:
- invoices
- payments
- finance reports
- exports
- accounting integrations

No permissions for:
- worker GPS
- field scheduling
- job reassignment

Another:

Job title:
Senior Technician / Team Supervisor

Permissions:
- view assigned team
- see team jobs
- monitor completion
- approve/review certain operational work

Scope:
Specific team only

--------------------------------------------------
KEEP A SMALL INTERNAL SYSTEM CLASSIFICATION
--------------------------------------------------

The existing OWNER / ADMIN / WORKER enum is heavily used throughout the current system.

Do not recklessly delete it and break the application in one migration.

Use a safe migration strategy.

The legacy/system role can remain as an internal coarse classification where needed during the transition:

OWNER
ADMIN
WORKER

But it must stop being the only source of authorization.

Conceptually:

OWNER
= legal/account owner classification

ADMIN
= office/business member capable of using the administrative web application

WORKER
= field workforce member with worker-specific operational behaviour

The user-facing business role should come from the new role template/job title system.

Actual access must come from effective permissions and scopes.

Do not rely on:

if role === "ADMIN"

for every administrative capability.

==================================================
PART 7 — BUILT-IN ROLE TEMPLATES
==================================================

Create a real role-template system that is not limited to the Prisma Role enum.

The existing PermissionRoleTemplate model is currently tied to:

role Role

This is too restrictive.

Refactor/replace it safely so a role template can represent business roles independently.

A role template should support concepts such as:

- id
- companyId nullable for FieldCore system templates
- key
- name
- description
- verticalKey
- isSystemTemplate
- isCustom
- defaultPermissions
- defaultScopeType if useful
- active
- timestamps

Use the cleanest schema names for the project.

System templates:
- created by FieldCore
- reusable
- may be vertical-specific

Company templates:
- created/customized by a company
- company-scoped
- never visible to another company

The system must support many templates without hard-coding behaviour around template names.

--------------------------------------------------
GENERIC DEFAULT ROLE TEMPLATES
--------------------------------------------------

Because the final target vertical has not been chosen, create sensible GENERIC templates first.

Examples:

- Owner
- Executive / COO
- General Manager
- Operations Manager
- Finance Manager
- Accountant
- Office Administrator
- Dispatcher / Scheduler
- Customer Service
- Department Manager
- Team Supervisor
- Senior Field Worker / Senior Technician
- Field Worker / Technician
- Apprentice / Junior Field Worker

These are templates, not rigid rules.

Do not hard-code HVAC-specific roles as the universal FieldCore structure.

The architecture must make it easy to seed vertical-specific role libraries later.

When a company has a known vertical:
- show applicable vertical templates
- also allow generic templates

When it has no supported vertical:
- use generic templates

==================================================
PART 8 — CUSTOM ROLE AND PERMISSION OVERRIDES
==================================================

The owner or an authorized team administrator must be able to:

1. Select a built-in role template.
2. Use its default permissions.
3. Modify permissions for that specific person.
4. Create a custom company role template if desired.

Example:

Invite:
jane@company.com

Job title:
COO

Template:
Executive / COO

Option:
[x] Give access to everything

or:

[ ] Give access to everything

Then individual permission checkboxes.

The Full Access option must mean:

all delegatable company permissions

It must NOT silently grant protected ownership powers.

--------------------------------------------------
OWNER-ONLY POWERS
--------------------------------------------------

Keep a small set of actions reserved to actual OWNER users.

At minimum protect:

- transfer company ownership
- delete the company/account
- remove or demote the final owner
- actions that would leave the company with no owner

A non-owner COO/PA/administrator may otherwise be given very broad access.

Do not make "Full Access" equal to becoming an OWNER.

Do not let a non-owner grant themselves ownership.

Do not let a non-owner escalate their own permissions beyond what they are allowed to delegate.

==================================================
PART 9 — EXPAND THE PERMISSION SYSTEM
==================================================

The existing permissionKeys list is too narrow.

Expand authorization into meaningful permission families covering the real application.

Do not create one absurd permission for every tiny button.

Use sensible resource/action permissions.

Examples of permission families:

DASHBOARD
- dashboard.operational.view
- dashboard.financial.view
- dashboard.executive.view

CUSTOMERS
- customers.view
- customers.create
- customers.edit
- customers.delete

JOBS
- jobs.view
- jobs.create
- jobs.edit
- jobs.assign
- jobs.cancel
- jobs.review

SCHEDULING
- schedule.view
- schedule.manage
- schedule.override

WORKFORCE
- workers.view
- workers.manage
- workers.location.view
- teams.manage

BOOKINGS
- bookings.view
- bookings.manage

QUOTES
- quotes.view
- quotes.create
- quotes.edit
- quotes.send
- quote.discount.approve

INVOICES
- invoices.view
- invoices.create
- invoices.edit
- invoices.send
- invoice.void
- invoice.discount.approve

PAYMENTS / FINANCE
- payments.view
- payments.manage
- payment.refund
- finance.reports.view
- settings.finance.manage
- finance.exports.manage
- finance.integrations.manage

INVENTORY / PROCUREMENT
- inventory.view
- inventory.manage
- purchaseRequest.create
- purchaseRequest.approve
- purchaseOrder.manage
- purchaseOrder.approve

COMPANY
- company.settings.view
- company.settings.manage
- company.branding.manage

PEOPLE / ACCESS
- members.view
- members.invite
- members.manage
- roles.manage
- permissions.manage

SUBSCRIPTION
- subscription.view
- subscription.manage

SECURITY
- security.view
- security.manage
- audit.view

INTEGRATIONS
- integration.view
- integration.manage

BRANCHES / TEAMS
- branch.view
- branch.manage
- team.view
- team.manage

Keep existing important permission keys compatible where practical.

Do not break approval logic.

Map existing special enterprise permissions into the expanded system rather than deleting them carelessly.

==================================================
PART 10 — REPLACE BROAD ROLE-ONLY AUTHORIZATION
==================================================

Audit the current authenticated pages and API routes.

Many currently use logic like:

requireRole(...adminRoles)

or page maps such as:

OWNER / ADMIN allowed
WORKER denied

This is too broad for the new system.

Do not remove all coarse role checks blindly.

Instead:

1. Keep authentication and company isolation.
2. Keep WORKER-specific operational boundaries where genuinely needed.
3. Add permission checks to resources and sensitive actions.
4. Change page access so users only see/open modules they have permission to use.
5. Change navigation so inaccessible modules are hidden.
6. Backend authorization remains the source of truth.

Hiding a menu item is not security.

An unauthorized direct API request must return 403.

An unauthorized direct page request must not expose usable protected functionality.

Do not rely only on frontend checks.

==================================================
PART 11 — ACCESS SCOPES
==================================================

Permissions alone are not enough.

The system must support:

WHAT CAN THIS PERSON DO?
+
WHERE / TO WHOM CAN THEY DO IT?

Required scope concepts:

- COMPANY — entire company
- BRANCH — selected branch(es)
- TEAM — selected team(s)
- SELF — only themselves / their own assigned work

Use the existing UserBranchAccess where useful.

Do not duplicate branch access unnecessarily.

Extend the access model cleanly for team scope.

Example:

General Manager
Permission:
workers.view
Scope:
COMPANY

Regional Manager
Permission:
workers.view
Scope:
BRANCH A

Team Supervisor
Permission:
workers.view
Scope:
TEAM 3

Technician
Permission:
jobs.view
Scope:
SELF

==================================================
PART 12 — TEAMS / GROUPS
==================================================

The system must support the organisational case where one manager or senior field worker oversees only a group of workers.

Add a clean company-scoped Team model if one does not already exist.

Conceptually:

Team
- id
- companyId
- branchId optional
- name
- description optional
- active
- timestamps

Team membership:
- company-scoped
- user/worker association
- safe for one or more teams if the architecture supports it cleanly

Do not expose cross-company teams.

A user with TEAM scope must not gain access to workers/jobs outside authorized teams.

Use current WorkerProfile relationships appropriately.

Do not duplicate workers into a second workforce table.

==================================================
PART 13 — MEMBER INVITATION FLOW
==================================================

The owner should not need to create passwords for employees.

Implement a secure email invitation flow.

From People/Members or an appropriate Team & Roles management experience, an authorized user should be able to:

1. Enter invitee email.
2. Enter/display job title.
3. Select a built-in or custom role template.
4. Choose:
   - Full delegatable access
   OR
   - granular permissions
5. Choose access scope:
   - whole company
   - branch
   - team
   - self where relevant
6. Send invitation.

The invitee receives an email.

Reuse the existing FieldCore email infrastructure:
- emailProvider.service.js
- notification/email integration patterns
- configured Brevo/transactional provider where appropriate

Do not create a second unrelated email delivery system.

--------------------------------------------------
SECURE INVITATION MODEL
--------------------------------------------------

Create a proper invitation record.

Conceptually include:

- id
- companyId
- email
- invitedByUserId
- roleTemplateId
- jobTitle
- selected permissions / initial access configuration
- scope configuration
- tokenHash
- expiresAt
- acceptedAt
- revokedAt or status
- createdAt
- updatedAt

Security requirements:

- use a cryptographically secure random token
- store only a hash of the invitation token
- invitation links must expire
- token must be single-use
- revoked invitations cannot be accepted
- accepted invitations cannot be reused
- company isolation must be enforced
- email address should be normalized
- do not send passwords by email
- do not store a plaintext temporary password
- do not expose token hashes through APIs

The email link should take the invitee to a dedicated acceptance page.

Example:

accept-invite.html?token=...

The invitee should:
- see which company invited them
- see their intended role/job title
- set their own password
- confirm password
- accept invitation

After successful acceptance:
- create/activate their User account
- attach the correct role template
- apply permissions
- apply scope
- mark invitation accepted
- invalidate the token
- log the action
- create a secure authenticated session or send them to login

Handle the case where the email already belongs to an existing FieldCore user safely.

Do not accidentally allow one company to hijack an existing user's account.

==================================================
PART 14 — DELEGATED ONBOARDING
==================================================

The owner who buys FieldCore may not be the person who knows the operational details.

The application must support this reality.

After entering the dashboard, the owner should be able to invite someone such as:

- COO
- General Manager
- Office Administrator
- PA
- Accountant
- Operations Manager

and give them enough access to finish setup.

A delegated senior administrator with sufficient permissions should be able to complete company configuration such as:
- company information
- services
- scheduling defaults
- finance setup if permitted
- workers
- operational configuration

The owner should not be forced to know every operational detail during signup.

Do not make detailed company setup a prerequisite for plan selection.

==================================================
PART 15 — PEOPLE/MEMBERS UX
==================================================

The existing customers.html page currently also represents People/Members and workers.

Do not destroy the existing customer functionality.

Improve the organisational member experience carefully.

There should be a clear distinction between:

CUSTOMERS
and
COMPANY MEMBERS / WORKERS

The company member management experience should allow authorized users to see:

- Name
- Email
- Job title
- Role template
- Internal system classification if needed
- Scope
- Status
- Invitation status
- Last activity/login where available
- Actions

Actions may include:
- Invite member
- Resend invite
- Revoke invite
- Edit job title
- Change role template
- Customize permissions
- Change scope
- Disable account
- Reactivate account where safe

Do not allow unauthorized users to manage permissions.

Do not allow a user to escalate themselves.

Protect the final owner.

==================================================
PART 16 — ROLE/PERMISSION EDITING UX
==================================================

Create a usable permission editor.

Do not dump 60 raw technical permission keys into one giant unstructured list.

Group them by category.

Example:

Customers
[x] View customers
[x] Add customers
[x] Edit customers
[ ] Delete customers

Jobs
[x] View jobs
[x] Manage jobs
[x] Assign jobs

Finance
[ ] View financial dashboard
[ ] View invoices
[ ] Manage payments

People
[x] View workers
[ ] Manage workers
[ ] Manage roles and permissions

Use:
- section headings
- checkboxes
- Select all within category where useful
- Full access master checkbox
- clear scope selector

When Full Access is selected:
- select all delegatable permissions
- do not select protected owner-only powers

Allow further customization if technically sensible.

==================================================
PART 17 — EFFECTIVE PERMISSIONS
==================================================

Implement one reliable effective-permission calculation.

Conceptually:

system/ownership rules
+
role template default permissions
+
company-specific role customization
+
user permission overrides
+
scope grants
=
effective access

Do not calculate permissions differently in five unrelated places.

Create/reuse centralized authorization helpers.

Backend routes should use the central logic.

Frontend session/bootstrap data should receive a safe representation of effective permissions so navigation and UI can render correctly.

Do not trust the frontend's permission list for authorization.

==================================================
PART 18 — CURRENT USER / SESSION RESPONSE
==================================================

Update the authenticated session/user response where appropriate so the frontend can safely know:

- user id
- name
- email
- company
- displayed job title
- role template
- system role/classification
- effective permissions
- accessible scopes/branches/teams where needed

Never return:
- passwordHash
- invitation token hash
- 2FA secrets
- security secrets

==================================================
PART 19 — SETTINGS NAVIGATION CLEANUP
==================================================

After the account dropdown change:

The internal Settings page should remain focused on business/application configuration.

Remove these from the Settings left-side tab list:
- FieldCore Subscription
- Security

Keep normal configuration such as:
- Company Information
- Team & Roles where still appropriate
- Job Defaults
- Scheduling
- Invoice Defaults
- Finance & Exports
- Notifications
- Integrations
- Admin Tools

However, make sure Team & Roles does not conflict with the improved People/Members access management experience.

Use one clear source of truth.

Do not create two different role editors with different behaviour.

FieldCore Subscription:
→ dedicated subscription page

Security:
→ dedicated security page

==================================================
PART 20 — BILLING DATA MODEL
==================================================

The existing SaaSPlan model has a monthly plan structure.

Do not create duplicate monthly and annual versions of every plan unless there is a strong architectural reason.

Prefer:

Plan
+
selected billing interval
+
central annual pricing rule

Store the company's chosen billing interval on the subscription.

Use a clear enum/string such as:

MONTHLY
ANNUAL

The selected billing interval must persist.

Annual price should be calculated consistently from:
- actual applicable regional monthly price
- 12 months
- configured annual discount

Example formula:

annualTotal =
monthlyPrice * 12 * (1 - annualDiscountPercent / 100)

annualEquivalentMonthly =
annualTotal / 12

annualSavings =
monthlyPrice * 12 - annualTotal

Do not calculate custom-priced Enterprise as a numeric plan.

==================================================
PART 21 — MOCK BILLING SAFETY
==================================================

This task is NOT production SaaS billing.

The system should make the current billing mode explicit internally.

Do not accidentally pretend an external provider charged money.

Use appropriate:
- mock/internal provider indicator
- billing event
- audit record

The UI does not need an ugly developer warning everywhere, but the implementation must not call real providers.

Keep the architecture replaceable later with:
- Stripe or another provider
without rebuilding the whole plan-selection UI.

==================================================
PART 22 — MIGRATION AND BACKWARD COMPATIBILITY
==================================================

This is an existing system.

Create safe Prisma migrations.

Do not destroy current users.

Do not delete current permission overrides.

Do not break:
- existing owner login
- admin login
- worker login
- worker app behaviour
- company isolation
- quotes
- invoices
- payments
- scheduling
- jobs
- worker lifecycle
- branding
- regional environment support

Existing users should receive sensible default role templates/permissions during migration or seeding.

Suggested conceptual mapping:

OWNER
→ Owner template
→ full delegatable permissions + owner powers

ADMIN
→ General Administrator template
→ broad current admin-equivalent permissions

WORKER
→ Field Worker template
→ current worker-restricted behaviour

Do not silently reduce existing users' access during migration.

==================================================
PART 23 — ROUTE AND PAGE GUARDING
==================================================

Review src/app.js.

It currently uses hard-coded role-based page access.

Refactor this carefully so page access can respect effective permissions.

Do not simply allow every ADMIN to every page.

Create a central mapping such as:

page/resource
→ required permission

Examples:

invoices.html
→ invoices.view

map.html
→ workers.location.view

reports.html
→ relevant report permission

settings.html
→ company.settings.view

subscription.html
→ subscription.view

security-center.html
→ security.view

The backend remains authoritative.

Do not make public/auth pages require business permissions.

==================================================
PART 24 — AUDIT LOGGING
==================================================

Create audit records for important access-management actions:

- invitation created
- invitation resent
- invitation revoked
- invitation accepted
- member disabled
- member reactivated
- role template changed
- permissions changed
- scope changed
- full access granted/revoked
- subscription plan selected
- billing interval changed
- mock plan change
- Enterprise contact request

Do not log:
- plaintext invitation tokens
- passwords
- API secrets

Use the existing safe audit metadata patterns.

==================================================
PART 25 — TESTS
==================================================

Add targeted automated tests.

At minimum test:

SIGNUP / ONBOARDING
1. New registration creates owner + company.
2. New signup is directed to plan selection before normal dashboard use.
3. Plan selection completes onboarding.
4. Monthly selection persists.
5. Annual selection persists.
6. Annual price/savings calculations are correct.
7. Enterprise contact flow does not call a real payment provider.
8. Mock plan selection does not call a real payment provider.

INVITATIONS
9. Authorized owner can invite a member.
10. Invitation email flow is invoked.
11. Token is not stored plaintext.
12. Expired invitation is rejected.
13. Revoked invitation is rejected.
14. Accepted invitation cannot be reused.
15. Invitee sets their own password.
16. Invite cannot cross company boundaries.

PERMISSIONS
17. Full-access non-owner gets delegatable permissions but not owner-only powers.
18. Accountant-style user can access finance when granted.
19. Operations manager cannot access finance when not granted.
20. Team-scoped supervisor cannot access another team's protected data.
21. Branch-scoped user cannot cross branch boundaries.
22. Direct API access returns 403 without required permission.
23. Hidden navigation is not the only security control.
24. Existing worker restrictions remain intact.
25. Existing admins retain sensible access after migration.
26. Final owner cannot be removed accidentally.
27. User cannot escalate their own permissions without authorization.

PROFILE MENU
28. Account dropdown opens/closes correctly.
29. Settings link works.
30. Subscription link works.
31. Security link works.
32. Logout works.

==================================================
PART 26 — MANUAL QA
==================================================

After implementation manually verify:

A. New owner signup
- create a new company
- complete basic business questions
- reach pricing page
- toggle monthly/annual
- confirm Basic or Standard
- enter dashboard

B. Annual pricing
- correct annual total
- correct equivalent monthly amount
- correct saving amount

C. Enterprise
- Contact us modal
- no real checkout
- continue into dashboard in current mock flow

D. Existing owner
- can open top-right account dropdown
- can open Settings
- can open FieldCore Subscription
- can open Security
- can log out

E. Member invitation
- invite a COO with Full Access
- invite an accountant with finance-only permissions
- invite an operations manager without finance
- invite a team supervisor scoped to one team

F. Invitation acceptance
- email/link works in configured or console email mode
- invitee sets own password
- invitee signs in
- permissions match configuration

G. Security
- non-owner Full Access cannot transfer ownership
- accountant cannot manage workers unless granted
- operations manager cannot see finance unless granted
- team supervisor cannot see another team's protected records
- worker remains restricted to worker functionality

==================================================
PART 27 — IMPLEMENTATION APPROACH
==================================================

Before coding, inspect the repo and produce a concise plan covering:

1. Schema changes
2. Migration/backfill strategy
3. Permission architecture
4. Invitation architecture
5. Signup/onboarding flow
6. Billing UI reuse
7. Global account dropdown
8. Test strategy

Then implement in logical phases.

Do not rewrite the whole application.

Prefer reusable helpers/components over duplicate logic.

Likely files to inspect/change include, but are not limited to:

prisma/schema.prisma
prisma/seed.js
src/routes/api.js
src/app.js
src/auth.js
src/services/subscription.service.js
src/services/saasBilling.service.js
src/services/emailProvider.service.js
src/services/notification.service.js
register.html
onboarding.html
settings.html
customers.html
assets/auth.js
assets/api.js
assets/layout.js
assets/app.css

Potential new files may include:
- dedicated plan selection page
- dedicated subscription page
- invitation acceptance page
- centralized access/permission service
- shared billing/pricing frontend helper

Use existing project conventions.

==================================================
PART 28 — VERIFICATION RULE
==================================================

Use the smallest relevant checks while developing.

Because this task changes Prisma:
- run npx prisma validate after schema changes
- create a proper migration

Because backend JS changes:
- run the smallest relevant syntax checks

Because frontend JS changes:
- run node --check on changed JS files where applicable

After the entire feature is complete:
- run npm run build
- run npm test

Then start the app and manually verify the critical browser flows.

Do not repeatedly run the full build/test suite after every tiny edit.

Do not modify unrelated completed system logic merely to make tests easier.

At the end report:

1. What changed
2. Schema/migration changes
3. New pages/routes
4. Permission architecture
5. Invitation flow
6. Mock billing behaviour
7. Tests/checks run
8. Any remaining limitations