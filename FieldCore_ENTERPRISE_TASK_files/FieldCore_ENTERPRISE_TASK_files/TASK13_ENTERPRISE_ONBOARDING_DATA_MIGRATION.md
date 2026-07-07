# FieldCore Enterprise Readiness Task

These tasks assume the current codebase is the uploaded `FieldCore_Software(52).zip` project: Node/Express, Prisma/PostgreSQL, static HTML/CSS/JS UI, JWT auth, multi-tenant company scoping, existing assets/contracts, inventory/purchasing, finance localization, offline worker sync foundation, branches, approvals, reports, notifications, integrations, and SaaS billing foundations.

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

## TASK14 — Enterprise onboarding, imports, migration, and implementation tooling

## Commercial reason

Mid-market buyers do not start from a blank database. They have customers, sites, assets, workers, stock lists, contracts, and open invoices. If onboarding is painful, sales stall and churn risk rises before value is seen.

## Objective

Create onboarding and data migration tools that make FieldCore sellable as a serious implementation, not just a signup app.

## Required outcomes

### 1. Company onboarding checklist

Add an admin onboarding page or settings checklist:

- company profile
- branches
- users/workers
- customers
- properties/sites
- services
- assets
- contracts
- inventory
- finance settings
- payment methods
- notifications
- approvals
- first test job

Show completion percentage.

### 2. CSV import framework

Build a safe import system for:

- customers
- customer properties/sites
- workers
- assets
- inventory items
- suppliers
- stock levels
- service contracts
- contract assets

Requirements:

- upload CSV
- preview mapped columns
- validate rows
- show row errors
- support dry run
- import with audit log
- prevent duplicate creation where possible
- produce import summary

### 3. Import templates

Add downloadable CSV templates for each import type.

Include docs explaining required columns.

### 4. Data quality tools

Add duplicate detection:

- customer duplicate by email/phone/name
- asset duplicate by serial number/site/name
- worker duplicate by email/phone
- inventory duplicate by SKU/name

Allow safe merge suggestions, but do not auto-merge unless explicitly confirmed.

### 5. Implementation mode

Add a company flag or setup mode:

- hide or mark test/demo data
- allow reset only outside production and only for authorized owner
- track implementation notes
- track go-live date
- track assigned implementation owner

### 6. Sample vertical demo data

Create seed options for:

- HVAC/refrigeration company
- solar O&M company
- fire/access-control company
- facilities maintenance contractor

This is critical for sales demos.

### 7. Onboarding fee support

Add internal records for implementation package:

- onboarding fee amount
- migration fee amount
- training package
- implementation status
- go-live checklist

This should support the commercial model without forcing payment provider integration.

## Tests

Add tests for:

- CSV import is tenant-scoped.
- bad CSV returns row-level errors.
- dry run does not write data.
- duplicate detection works.
- unauthorized user cannot import.
- import audit log is created.
- onboarding checklist updates as setup progresses.

## Manual QA

Test imports with:

- valid CSV
- missing required column
- invalid phone/email
- duplicate customer
- duplicate asset serial number
- partial row failure
- dry run
- real import

## Acceptance criteria

- A new mid-market customer can be migrated without manual database editing.
- Sales demos can be vertical-specific.
- Implementation becomes a paid service, not founder chaos.
