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

## TASK9 — Payment rails, reconciliation, deposits, refunds, and collections

## Commercial reason

Enterprise buyers care about cash flow. If FieldCore can reduce payment chasing, support deposits, match payments, and show overdue risk, it becomes easier to defend $1,000+ pricing.

## Objective

Turn payment handling from internal records/manual methods into a provider-ready collections and reconciliation system.

## Market priority

South Africa first:

- PayFast
- Yoco
- Ozow EFT
- SnapScan/Zapper as optional later

Zimbabwe:

- Paynow foundation if already relevant
- manual bank transfer + EcoCash-style reference capture where provider APIs are not available

Global later:

- Stripe-ready architecture, but do not make Stripe the Africa-first assumption.

## Existing foundation to build on

- `Payment`
- `Receipt`
- `Invoice`
- `PaymentMethod`
- finance settings payment methods
- integration provider system
- notification system
- invoice pages
- client portal

## Required outcomes

### 1. Payment provider abstraction

Create provider interface:

```js
createCheckoutSession()
createPaymentLink()
verifyWebhook()
handleWebhookEvent()
refundPayment()
getPaymentStatus()
```

Provider files should be isolated, for example:

- `src/services/payments/providers/payfast.provider.js`
- `src/services/payments/providers/yoco.provider.js`
- `src/services/payments/providers/ozow.provider.js`
- `src/services/payments/paymentProviderRegistry.js`
- `src/services/payments/reconciliation.service.js`

### 2. Payment links

Invoices should support payment links:

- generate link
- send link by email/WhatsApp
- show payment status in client portal
- mark as paid only after trusted provider webhook or authorized admin capture

### 3. Deposits and partial payments

Support:

- invoice deposit requirement
- quote deposit requirement before job scheduling
- partial payment records
- remaining balance
- overdue balance
- payment plan notes

### 4. Reconciliation

Add reconciliation workflow:

- unmatched payment imports/provider events
- match by reference/invoice/customer/amount
- manual match with audit log
- duplicate detection
- suspicious mismatch flag

### 5. Refunds and credit notes

Refunds must be gated by TASK7 approval rules.

Support:

- refund request
- approval required above threshold
- provider refund if provider supports it
- manual refund record if not
- credit note placeholder for accounting sync

### 6. Collections dashboard

Add collections view:

- overdue invoices
- aging buckets: 0–30, 31–60, 61–90, 90+
- promised payment dates
- last reminder sent
- next reminder date
- customer risk level
- branch filter

### 7. Automated reminders

Add configurable reminders:

- before due date
- on due date
- after due date
- stop reminders after paid/cancelled/disputed
- WhatsApp/email template support

Do not spam customers. Add rate limits and audit logs.

## Tests

Add tests for:

- payment link generation requires configured provider.
- provider webhook validates signature.
- invoice cannot be marked paid by forged webhook.
- partial payment updates balance correctly.
- deposit requirement blocks scheduling until satisfied if company setting says so.
- refund requires approval above threshold.
- reconciliation cannot match same payment twice.
- reminder does not send repeatedly inside throttle window.
- tenant isolation.

## Manual QA

Create mock payment provider mode:

- pending payment
- successful payment webhook
- failed payment webhook
- duplicate webhook
- refund success/failure

## Acceptance criteria

- FieldCore can credibly support quote-to-cash operations.
- Invoices have payment status, links, reminders, and reconciliation.
- Admins can see where money is stuck.
- Provider integrations are safely disabled unless configured.
