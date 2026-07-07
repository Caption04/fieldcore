# TASK9 — Payment rails, reconciliation, refunds, and collections

TASK9 adds a provider-ready quote-to-cash layer without assuming a live gateway is configured.

## Provider abstraction

Payment providers live under `src/services/payments/` and expose:

- `createCheckoutSession()`
- `createPaymentLink()`
- `verifyWebhook()`
- `handleWebhookEvent()`
- `refundPayment()`
- `getPaymentStatus()`

Implemented provider shells:

- PayFast
- Yoco
- Ozow
- Paynow/manual rails through the manual provider
- Mock provider for QA

Live providers remain safe unless environment variables and/or provider secrets are configured. Mock mode exists for manual QA and automated tests.

## Main API surfaces

- `GET /api/payment-providers`
- `POST /api/payment-providers`
- `PATCH /api/payment-providers/:id`
- `POST /api/payment-providers/:id/test`
- `POST /api/invoices/:id/payment-links`
- `GET /api/payment-links`
- `POST /api/payment-webhooks/:provider/:companyId`
- `GET /api/collections`
- `POST /api/collections/invoices/:id/reminders`
- `POST /api/reconciliation/imports`
- `GET /api/reconciliation/items`
- `POST /api/reconciliation/items/:id/match`
- `POST /api/payments/:id/refund`

## Safety rules

- Invoices are marked paid only through confirmed admin capture, reconciliation match, or valid provider webhook.
- Provider webhook signatures are verified before payments are confirmed.
- Duplicate provider events are logged and do not create duplicate payments.
- Reconciliation items cannot be matched twice.
- Refunds continue to use TASK7 approval gates via `PAYMENT_REFUND`.
- Collection reminders are throttled using company finance settings.
- Quote deposit enforcement can block scheduling when enabled.

## Manual QA

1. Create an active `MOCK` payment provider with `mockMode: true` and a `webhookSecret`.
2. Generate a payment link for an open invoice.
3. Send a bad webhook signature and confirm it is rejected.
4. Send a valid `payment.succeeded` webhook and confirm the invoice balance reduces.
5. Send the same webhook again and confirm no duplicate payment is created.
6. Import a bank payment into reconciliation and manually match it to an invoice.
7. Try matching it again and confirm it is rejected.
8. Enable deposit enforcement in finance settings and verify scheduling blocks an accepted quote until deposit is paid.
9. Send a collection reminder twice and confirm the second attempt is throttled.
10. Configure a refund approval policy and confirm large refunds require approval.
