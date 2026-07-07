# FieldCore

FieldCore is a field-service SaaS foundation for companies that manage customers, workers, jobs, quotes, invoices, schedules, worker locations, and proof-of-work photos.

The existing static HTML/CSS UI is preserved. `server.js` now starts an Express backend, serves the static pages, and mounts the production-oriented API under `/api`.

## Stack

- Node.js and Express
- PostgreSQL
- Prisma ORM
- Zod validation
- bcrypt-compatible password hashing with bcryptjs
- JWT auth in secure HTTP-only cookies
- Centralized JSON error handling
- Morgan request logging
- CORS configured from environment variables

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create an `.env` file from `.env.example` and update `DATABASE_URL` for your local PostgreSQL database:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Generate Prisma client and run migrations:

```bash
npm run build
npm run migrate
```

4. Seed demo data:

```bash
npm run seed
```

5. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

- `PORT`: HTTP port, defaults to `3000`.
- `NODE_ENV`: use `production` in production. Production startup validates critical config.
- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `JWT_SECRET`: long random secret for signing auth tokens. Production refuses weak/default values.
- `COOKIE_NAME`: auth cookie name, defaults to `fieldcore_token`.
- `CLIENT_ORIGIN`: allowed browser origin for CORS, usually `http://localhost:3000` locally.
- `DEMO_OWNER_EMAIL`: seed owner email, defaults to `owner@fieldcore.test`.
- `DEMO_PASSWORD`: seed user password, defaults to `FieldCoreDemo2026!`.
- `APP_BASE_URL`: public app URL used in notification text when available.
- `NOTIFICATION_CHANNELS`: comma-separated channels, defaults to `EMAIL,WHATSAPP`.
- `EMAIL_PROVIDER`: optional email provider key. Leave empty to safely skip sends; `console` logs email metadata locally; `webhook` POSTs to `EMAIL_API_URL`.
- `EMAIL_API_URL` / `EMAIL_API_KEY`: optional webhook email endpoint and bearer token.
- `EMAIL_FROM`: sender address required before email delivery is considered configured.
- `WHATSAPP_PROVIDER`: optional WhatsApp provider. Use `disabled` or blank to skip safely, `console` for local metadata logging, `meta` for Meta Cloud API, or `360dialog`.
- `WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_FROM_NUMBER`: provider-specific WhatsApp configuration.
- `WHATSAPP_DEFAULT_COUNTRY_CODE`: optional country code used to normalize local phone numbers.
- `WHATSAPP_TEMPLATE_LANGUAGE`: WhatsApp template language code, defaults to `en`.
- `WHATSAPP_TEMPLATE_*`: event-to-template mappings for approved WhatsApp business templates.
- `RATE_LIMIT_*`: optional route-group limits for auth, public booking/tracking, and uploads.
- `ALLOW_DEMO_RESET`: set to `true` only for intentional local/demo reset runs.
- `SAAS_BILLING_PROVIDER`: SaaS subscription billing provider. Leave blank to disable checkout, or use `manual` for local/internal billing workflows.
- `SAAS_BILLING_SUCCESS_URL` / `SAAS_BILLING_CANCEL_URL`: redirect targets for a future live checkout provider.
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`: only required when `SAAS_BILLING_PROVIDER=stripe`; live Stripe checkout is not enabled until the provider implementation is completed.

## Scripts

- `npm run dev`: start the Express backend and static UI.
- `npm start`: same as dev for local hosting.
- `npm run build`: generate the Prisma client.
- `npm run migrate`: run Prisma migrations against PostgreSQL.
- `npm run seed`: create demo company, owner, admin, worker, customer, service, quote, job, schedule item, and invoice.
- `npm run demo:reset -- --yes`: safely reseed local/demo data. Refuses `NODE_ENV=production`.
- `npm test`: run Node test files with the built-in test runner.

## Production Readiness

- Backup plan: `docs/backup-plan.md`
- Deployment checklist: `docs/deployment-checklist.md`
- Security review: `docs/security-review.md`
- SaaS billing operations: `docs/saas-billing.md`

Health checks are available at `/healthz` and `/readyz`. Admins can review system status, audit logs, and notification logs from Settings.

## Demo Login

After seeding, log in from the injected modal with:

```text
owner@fieldcore.test / FieldCoreDemo2026!
```

Worker access can be tested with:

```text
worker@fieldcore.test / FieldCoreDemo2026!
```

Workers can only access worker-safe routes such as assigned jobs, schedule, location updates, and job photos. Admin-only data such as customers, quotes, invoices, workers, and services is protected by role middleware.

## API Shape

Successful responses use:

```json
{ "ok": true, "data": {} }
```

Errors use:

```json
{ "ok": false, "error": { "message": "Validation failed" } }
```

All business data is scoped by `companyId` in Prisma queries. API handlers never trust client-provided `companyId` values.


## TASK6 offer-specific localization

FieldCore now supports company-level localization for country, timezone, currency, allowed currencies, tax/VAT label, quote expiry, payment terms, date/number format preferences, and configurable manual payment methods. Quotes, invoices, receipts, finance exports, public service summaries, and client-facing data can carry localization metadata.

Payment methods are configurable operational options only unless a real provider integration is separately configured. CSV export remains the accounting foundation; live Xero/Sage/QuickBooks sync is not claimed.

Manual QA should verify: finance settings save, payment methods restrict payment capture, public services show currency/tax metadata, invoices get default due dates, quotes get default expiry dates, and new WhatsApp/email template names exist without breaking existing notifications.


## Enterprise approval gates

FieldCore includes enforceable enterprise approval gates, granular permission overrides, branch-scoped access, and audit hardening. See `docs/enterprise-approvals-rbac-audit.md`.

### Enterprise accounting integrations

FieldCore includes an accounting-sync foundation for Xero, Sage, and QuickBooks. Xero has the first full provider path and local mock mode; Sage and QuickBooks use the same provider abstraction as safe stubs. Manual CSV export remains available as a fallback. See `docs/accounting-integrations.md`.

## TASK9 payment rails and collections

FieldCore now includes a provider-ready payment rails layer for PayFast, Yoco, Ozow, Paynow/manual bank rails, and mock payment QA. Invoices can generate payment links, provider webhooks can confirm trusted payments, reconciliation imports can be matched manually, reminders are throttled, and refunds are tied into TASK7 approval gates.

See `docs/payment-rails-reconciliation-collections.md`.


## TASK10 mobile/offline foundation

FieldCore now includes a native-app-ready mobile API contract, device revoke/trust metadata, sync v2 pull/push endpoints, per-action offline results, conflict detection, checklist templates/answers, and an admin Mobile Sync page for failed or conflicted offline actions. See `docs/mobile-api-contract.md`.

## TASK11 contract, asset, warranty, SLA, and preventive maintenance automation

FieldCore now supports enterprise contract automation on top of assets and service contracts:

- asset service history with jobs, proof, invoices, incidents, compliance documents, and parts used;
- preventive maintenance generation from active contract service lines;
- entitlement checks for included, billable, overage, and warranty work;
- SLA at-risk, breach, met, and waiver handling;
- warranty billing protection;
- contract profitability reporting.

See `docs/contract-asset-sla-automation.md`.
