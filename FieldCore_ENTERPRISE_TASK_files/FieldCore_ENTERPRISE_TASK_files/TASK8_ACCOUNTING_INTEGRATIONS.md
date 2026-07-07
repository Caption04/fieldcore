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

## TASK8 — Real accounting integrations: Xero, Sage, QuickBooks-ready architecture

## Commercial reason

For South Africa, Zimbabwe, and global expansion, finance integration is one of the biggest trust gaps. CSV exports are fine for pilots, but enterprises want less retyping, cleaner VAT handling, invoice/payment reconciliation, and finance-team confidence.

## Objective

Build a real accounting integration layer that can support Xero first, then Sage and QuickBooks, with safe provider abstraction, mapping, sync logs, retries, and reconciliation.

## Provider priority

1. Xero — first full implementation target.
2. Sage Business Cloud Accounting — architecture and provider stub with docs.
3. QuickBooks Online — architecture and provider stub with docs.

Do not fake live integrations. If credentials are not configured, the UI/API must say `Not connected`.

## Existing foundation to build on

- `FinanceIntegration`
- `FinanceProvider`
- `FinanceIntegrationStatus`
- `FinanceExportLog`
- `ExternalRecordLink`
- `CompanyFinanceSettings`
- `Invoice`, `Payment`, `Receipt`, `Quote`, `Customer`
- `docs/finance-localization.md`
- `src/services/integrations/*`
- `settings.html`
- `invoices.html`

## Required outcomes

### 1. Provider architecture

Create a clean finance provider interface, for example:

```js
connect()
refreshToken()
testConnection()
syncCustomer()
syncInvoice()
syncPayment()
syncCreditNote()
fetchAccounts()
fetchTaxRates()
fetchTrackingCategories()
handleWebhook()
```

Implementation files should live under something like:

- `src/services/finance/providers/xero.provider.js`
- `src/services/finance/providers/sage.provider.js`
- `src/services/finance/providers/quickbooks.provider.js`
- `src/services/finance/financeSync.service.js`
- `src/services/finance/financeMapping.service.js`

### 2. OAuth/token storage

Implement secure provider token storage using existing secret encryption patterns.

Requirements:

- access token encrypted
- refresh token encrypted
- token expiry stored
- refresh before sync if needed
- disconnect clears tokens safely
- audit logs for connect/disconnect/test sync

### 3. Finance mapping UI/API

Admins need to map FieldCore data to accounting system settings:

- revenue account
- tax/VAT rate
- payments account
- discounts account
- stock/parts account later
- branch/tracking category if provider supports it
- invoice prefix
- customer naming rule

Add settings UI and API.

### 4. Sync behavior

Support:

- sync customer
- sync invoice
- sync payment
- sync receipt/payment reference
- sync credit note/refund placeholder
- one-click sync for invoice
- batch sync for unsynced invoices/payments
- sync status badges on invoice/payment pages

Rules:

- Do not duplicate remote records.
- Use `ExternalRecordLink` for idempotency.
- Failed sync creates a clear sync error record.
- Retrying a sync should not create duplicates.
- Sync should be tenant-scoped.

### 5. Webhooks

Add safe webhook routes for providers.

Minimum:

- validate signature where provider supports it.
- reject unknown tenant/provider.
- write webhook event log.
- update sync status if remote record changes.
- no secrets in logs.

### 6. CSV remains supported

Keep CSV export as a fallback. Make it clear in UI:

- Manual CSV export
- Live accounting sync
- Not connected

## Tests

Add tests for:

- disconnected provider cannot sync.
- token storage redacts secrets.
- invoice sync creates external record link.
- sync retry is idempotent.
- tenant cannot access another company's finance integration.
- failed provider call records useful error.
- webhook rejects bad signature.
- CSV export still works.

## Manual QA

Create a fake/mock provider mode so local QA can simulate:

- connect
- test connection
- sync invoice
- sync payment
- provider failure
- retry success
- duplicate-prevention

## Acceptance criteria

- Xero-ready provider path exists with real integration shape.
- Sage and QuickBooks are not hacked in; they use the same provider abstraction.
- Finance teams can see sync status and errors clearly.
- FieldCore no longer feels like a finance dead-end.
