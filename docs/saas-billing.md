# SaaS Billing Operations

Phase 11 adds FieldCore-to-company subscription billing. This is separate from the existing company-to-customer quotes, invoices, payments, and receipts.

## Provider Modes

- Blank `SAAS_BILLING_PROVIDER`: checkout and plan changes return a safe provider-not-configured error.
- `manual` or `internal`: owner actions are recorded as billing events and require manual follow-up. The app does not mark a subscription paid just because a manual request was made.
- `stripe`: reserved for a live provider implementation. Production validation requires `STRIPE_SECRET_KEY` when Stripe is selected.

## Access

- Owners and admins can view subscription status, plans, usage, and billing events.
- Owners can request checkout, plan changes, and cancellation.
- Workers, client portal users, and public users cannot access SaaS billing routes.

## Gates And Limits

The subscription service centralizes feature and limit checks for public booking, client portal access, WhatsApp notifications, custom branding, proof-of-work requirements, workers/users, and monthly job/public booking counts.

Restricted companies can still log in and owners/admins can access billing information. Data is not deleted when a subscription is restricted.

## Production Notes

Do not store provider secrets in the database or expose them through API responses. Webhook handling for live providers should verify signatures, map provider IDs to company subscriptions server-side, and log sanitized SaaS billing events.
