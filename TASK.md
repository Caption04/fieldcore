# FieldCore — Final Paynow and Ozow Completion Task

## Purpose

Read `AGENTS.md` and the current `TASK.md` first. Then replace the payment section of `TASK.md` with this task or follow this file directly.

Work only inside:

```text
/home/kuhlinji/code/FieldCore_Software
```

This is a final, evidence-driven completion pass for **customer invoice payments through Paynow and Ozow**.

It is not a request to add every imaginable payment product. It is a request to close every reasonably foreseeable failure path visible in the current FieldCore code and required by the documented Paynow/Ozow flows.

Do not expand this work to:

- FieldCore SaaS subscription billing;
- unrelated payment providers;
- recurring card tokenization;
- automatic Paynow or Ozow refunds unless an official, tested API is intentionally added later;
- unrelated UI redesigns;
- unrelated business modules.

Do not stop after producing a plan. Audit, implement, migrate safely, test, and report exact results.

---

# 1. Non-negotiable product rules

Preserve all of these:

- Zimbabwe businesses use Paynow and USD.
- South African businesses use Ozow and ZAR.
- Customers see one plain action: **Make payment online**.
- Customers do not choose the provider.
- Businesses enter only their provider-issued credentials.
- Saved credentials remain encrypted, masked, and locked.
- Full secrets never return to the browser.
- No tenant can set provider endpoints, callback URLs, test/live mode, hashes, or technical configuration.
- No global merchant credential fallback may be used for an ordinary tenant.
- No `alert()`, `confirm()`, or `prompt()`.
- Use the existing FieldCore toast and modal systems.
- Customer and company-facing wording must be plain and suitable for a Grade 5 reader.
- Preserve tenant isolation, permission checks, and regional restrictions.
- Never delete financial history to correct a state.
- Never lose or roll back a real provider-confirmed payment merely because the invoice changed or was already paid.
- Do not reset `fieldcore_zw`, `fieldcore_sa`, or any database containing QA data.

---

# 2. Honesty and release definitions

There are two different completion levels.

## Code complete

This may be claimed only when:

- all listed code scenarios are implemented;
- focused unit tests pass;
- route/API tests pass;
- the real PostgreSQL suite passes with no skip;
- clean-database migration tests pass;
- representative legacy-data migration tests pass;
- Zimbabwe and South Africa migration preflights pass;
- migrations apply to both local regional databases;
- both regional servers start and pass smoke testing.

Provider API keys are not required for this level because HTTP calls can be mocked.

## Production-ready

This may be claimed only after code completion and:

- a real Paynow test-merchant flow passes;
- a real Ozow test-merchant flow passes;
- public HTTPS callbacks are received;
- delayed and replayed callbacks are tested;
- provider status checks confirm the payment;
- no duplicate credit occurs;
- no secret appears in browser responses or logs.

Do not use “done”, “complete”, or “production-ready” loosely.

---

# 3. Phase 0 — establish the actual starting point

Before editing:

```bash
cd /home/kuhlinji/code/FieldCore_Software
pwd
git status --short
git diff --check
```

Read and map these exact areas:

- `prisma/schema.prisma`
- all payment migrations from `20260713120000` onward
- `src/routes/api.js`
- `src/services/payments/paymentProviderUpdate.service.js`
- `src/services/payments/paymentStateMachine.service.js`
- `src/services/payments/paymentToken.service.js`
- `src/services/payments/paymentProviderRegistry.js`
- `src/services/payments/providers/paynow.provider.js`
- `src/services/payments/providers/ozow.provider.js`
- `src/services/payments/providers/providerUtils.js`
- `src/services/payments/providers/providerEndpointSecurity.js`
- invoice recalculation, receipt, credit-note, deposit, reconciliation, notification, report, collection, export, and client-portal code
- every payment and provider test
- the real PostgreSQL payment test runner
- the regional payment migration preflight

Search the whole repository for duplicate financial logic:

```bash
rg -n "recalcInvoice|CONFIRMED.*payment|payment.*CONFIRMED|depositPaidAt|receiptNumber|creditNote|PaymentRefund|balanceDue|amountPaid|providerPaymentId|merchantTrace|signedResponseVerifiedAt|paymentLink" \
  src assets scripts test prisma
```

Do not assume the two known `recalcInvoice` functions are the only consumers. Replace every inconsistent calculation with shared services.

Check migration state before deciding whether any old migration may be changed:

```bash
set -a
source .env.zw
set +a
npx prisma migrate status

set -a
source .env.sa
set +a
npx prisma migrate status
```

Also inspect `_prisma_migrations` in the dedicated PostgreSQL test database when it becomes available.

Record whether each of these has been applied in any database:

- `20260713120000_complete_regional_customer_payments`
- `20260713150000_harden_regional_payment_integrity`
- `20260713170000_finalize_payment_state_integrity`

Do not edit an applied migration.

---

# 4. Core architecture required before provider-specific fixes

Create or consolidate the following shared services. Names may differ, but responsibilities must be centralized.

## 4.1 Invoice payment ledger service

One service must calculate the usable paid amount and update invoice state.

Required formula:

```text
usable paid amount
=
sum of valid confirmed payment credits
-
sum of completed refunds/reversals that are not already represented by removing the original credit
```

The implementation must prevent double subtraction.

Examples:

- A fully `REFUNDED` original payment contributes zero.
- A `DISPUTED` original payment contributes zero usable credit.
- A `CONFIRMED` payment with a completed partial refund contributes `payment amount - completed refund total`.
- `REQUESTED`, `APPROVAL_REQUIRED`, `PROCESSING`, failed, or cancelled refunds do not reduce paid amount until the accounting policy says they are completed.
- Completed refunds may never exceed the original payment amount.
- Negative usable amounts must become a reconciliation blocker, not silently clamp without an audit record.

Use Prisma `Decimal` or exact decimal strings throughout. Do not convert money through JavaScript `Number` for calculations.

The shared ledger result must drive:

- invoice `balanceDue`;
- invoice `status`;
- invoice `paidAt`;
- client `amountPaid` and `amountDue`;
- admin invoice views;
- reports;
- collections;
- exports;
- dashboard totals;
- payment reminders;
- quote deposit checks;
- any “invoice already paid” gate.

Delete or replace duplicated implementations in `src/routes/api.js` and the provider update service.

## 4.2 Quote deposit coverage service

`depositPaidAt` must be derived from actual net usable payments, not set blindly whenever any payment is confirmed.

For a quote requiring a deposit:

```text
deposit covered = net usable linked payment amount >= required deposit amount
```

Required behavior:

- A $1 payment cannot unlock a $100 deposit.
- A full valid deposit sets `depositPaidAt`.
- A partial refund that drops coverage below the required amount clears `depositPaidAt`.
- A dispute clears it if remaining usable funds do not cover the deposit.
- A different valid payment may keep the deposit covered after another payment is refunded.
- Multiple partial payments may combine to cover the deposit.
- Do not blindly clear the date when other valid payment credit remains.
- Recompute after every payment confirmation, refund, dispute, reversal, manual reconciliation, and invoice/payment reassignment.

Scheduling and job-creation gates must use the derived result.

## 4.3 Financial number allocator

Do not use `count + 1` for:

- receipt numbers;
- credit-note numbers;
- any payment-related sequence.

Create an atomic per-company allocator, using a row counter or a PostgreSQL-safe equivalent.

Requirements:

- simultaneous unrelated payments receive different receipt numbers;
- simultaneous refunds receive different credit-note numbers;
- prefix changes do not create duplicates;
- unique-index races receive a bounded retry;
- a valid payment must not fail permanently because another payment got the same proposed number;
- numbers remain immutable after issue.

## 4.4 Provider update verification orchestrator

Create one shared path for:

```text
signed callback/return
→ ownership and amount validation
→ authoritative provider status lookup
→ mismatch audit
→ application of the authoritative current state
```

The route must not discard a trusted newer status merely because it differs from a stale callback.

Example:

```text
callback = PAID
Paynow poll = REFUNDED
```

Required result:

- audit the mismatch;
- apply `REFUNDED` from the trusted poll;
- do not apply stale `PAID`;
- do not leave the link pending indefinitely.

Move to `NEEDS_RECONCILIATION` only when the authoritative provider result itself cannot be matched confidently by company, reference, provider transaction, amount, currency, and mode.

---

# 5. Payment attempt and payment-link lifecycle

Treat each `PaymentLink` as one immutable provider payment attempt.

## PL-01 — customer double-click / repeated API request

Current risk: every click can create another full-balance payment link.

Required behavior:

- accept an idempotency key from the client or generate a stable request key for the UI action;
- a repeated request for the same invoice, provider, amount, and active attempt returns the existing attempt;
- do not create several live full-balance links from a double-click;
- protect the create operation with an invoice lock and database uniqueness/idempotency rule.

## PL-02 — several active links for one invoice

Define a clear policy:

- creating a replacement attempt expires/cancels older unsubmitted attempts for the same balance; or
- reuse the current valid attempt.

Never invalidate a provider transaction that may already exist upstream without first checking its status.

## PL-03 — two real links are both paid

A real second payment must never be rolled back because it exceeds the invoice balance.

Required behavior:

- record the provider-confirmed payment exactly once;
- apply only the remaining invoice balance;
- record the excess as an unapplied customer credit/overpayment or a reconciliation item with an explicit amount;
- show a plain admin action to refund or apply it elsewhere later;
- do not lose the payment;
- do not create a negative invoice balance;
- never silently assign the excess to another invoice.

Create a proper model if needed, such as `UnappliedCustomerCredit`, rather than hiding the amount in notes.

## PL-04 — invoice changes after a link is created

Store an immutable invoice snapshot/fingerprint on each attempt, including at least:

- invoice ID;
- customer ID;
- amount requested;
- currency;
- invoice total/balance at creation;
- invoice version or `updatedAt` value;
- provider mode;
- credential version.

When an invoice is edited, voided, manually paid, reassigned, or its currency changes:

- prevent new submission of stale links;
- mark them stale/expired only after checking whether an upstream transaction already exists;
- if a late real payment arrives, record it safely as payment/unapplied credit/reconciliation rather than dropping it;
- never credit a different customer or changed invoice blindly.

## PL-05 — voided/deleted invoice

- Do not hard-delete an invoice with a payment attempt, payment, receipt, refund, credit note, or provider event.
- A voided invoice cannot start a new payment.
- A late provider-confirmed payment is retained as unapplied credit/reconciliation.
- Customer-facing wording must not claim the money vanished.

## PL-06 — terminal link reuse

These attempts cannot be restarted:

- `PAID`
- `REFUNDED`
- `DISPUTED`
- `CANCELLED`
- `FAILED`
- `EXPIRED`

A new attempt requires a new FieldCore reference and, for Paynow, a new merchant trace.

## PL-07 — provider transaction uniqueness

Add a nullable unique constraint that prevents one real provider transaction from being attached to two FieldCore attempts.

Use a key appropriate to the architecture, such as:

```text
providerConnectionId + providerPaymentId
```

Requirements:

- exact duplicate callback reuses the existing attempt;
- the same provider transaction cannot credit two invoices;
- a collision involving a different company/link/amount becomes a security/reconciliation event;
- do not blindly swallow `P2002`.

## PL-08 — merchant-trace uniqueness

Paynow merchant traces must be unique per merchant/provider connection.

- enforce uniqueness where practical;
- retry generation on collision;
- never reuse a trace for a new payment attempt.

---

# 6. Provider credential lifecycle and rotation

The current one-row-per-secret design overwrites credentials. That can make old pending callbacks unverifiable.

Create encrypted credential versions.

Suggested model responsibilities:

```text
PaymentProviderCredentialVersion
- companyId
- connectionId
- version number/id
- encrypted credential fields
- provider mode
- createdAt
- activatedAt
- retiredAt
- verification state for that exact version and mode
```

Each `PaymentLink` must store the credential version used to create it.

Required behavior:

## CRED-01 — rotation while payments are pending

- New attempts use the new active version.
- Existing callbacks, polls, and status lookups use the version stored on their payment link.
- Old credentials remain encrypted and available only while unresolved attempts require them.
- Old versions are not exposed in the UI.
- Never delete a credential version while unresolved attempts reference it.

## CRED-02 — partial key replacement

Paynow ID/key and Ozow site/API/private-key form a credential bundle.

- Blank update fields preserve the saved value.
- Any replacement creates a new credential version.
- Reset “Ready” for the new version.
- A test verification for the old version does not make the new version Ready.
- A test-mode verification does not make live mode Ready.

## CRED-03 — atomic save

Connection status reset and encrypted secret-version creation must occur in one database transaction.

A failure saving encrypted data must not leave the connection claiming it has updated details.

## CRED-04 — disabled/disconnected connection

Disabling a connection must:

- block new payment attempts;
- continue accepting and verifying callbacks/status checks for existing attempts using their stored credential version;
- keep required old credentials;
- distinguish “cannot initiate” from “cannot process existing money”.

Do not reject a legitimate pending callback merely because the current connection is disabled.

## CRED-05 — Paynow bound test email

Keep the backend-only binding:

- `PAYNOW_TEST_AUTH_EMAIL`
- `PAYNOW_TEST_COMPANY_ID`
- `PAYNOW_TEST_INTEGRATION_ID`

Use the email only when all values match the payment link’s credential version and test mode.

Never expose or log the values.

---

# 7. Backend base URL and callback identity

## URL-01 — fail closed on `APP_BASE_URL`

Do not fall back to `http://localhost:3000` for a real provider payment.

For Paynow/Ozow real or provider test flows:

- require an explicitly configured `APP_BASE_URL`;
- require HTTPS;
- reject localhost, loopback, private addresses, link-local addresses, metadata addresses, credentials, ports not approved, fragments, and malformed URLs;
- validate that the regional server is generating the expected public host;
- verify callback URL lengths against provider limits.

A local mocked test may inject a test base URL explicitly, but production/provider mode must fail closed.

## URL-02 — opaque callback token

Current routes expose `companyId` in provider callback paths.

Replace or supplement this with a random, unguessable per-connection/per-credential-version callback token.

- Store only a hash or encrypted token as appropriate.
- Locate the connection through the opaque token.
- Then verify company, link, signature, amount, currency, mode, and reference.
- Never trust a callback-supplied company ID.
- Keep a backward-compatible route only for already-created links if required, and retire it safely.

---

# 8. Paynow-specific completion matrix

Use the current official Paynow web-payment flow only.

## PN-01 — ordered form and hash handling

Paynow hashes depend on the values in message order.

- Build outbound forms from an explicit ordered field list.
- Do not depend on incidental JavaScript object property order.
- For callbacks and poll/trace responses, preserve ordered URL-encoded pairs.
- Reject duplicate keys rather than silently letting the last value overwrite the first.
- Exclude only the `hash` field and append the correct credential-version key.
- Use timing-safe comparison.
- Keep unknown optional Paynow fields in the incoming hash calculation, but store only approved safe fields.

Add fixtures based on current official examples.

## PN-02 — exact amount and reference validation

- Use exact two-decimal strings through `Decimal`, never `Number(...).toFixed(2)`.
- Reference must be unique for the attempt.
- Merchant trace must be nonempty, unique, and no more than 32 characters.
- Reject control characters and invalid lengths.
- Compare callback/poll reference, Paynow reference, amount, currency policy, merchant connection, credential version, and test/live mode.

## PN-03 — currency and market

- Paynow connection is available only to the Zimbabwe regional tenant policy.
- FieldCore Paynow invoice payments must use USD unless a separate officially supported currency policy is deliberately introduced later.
- Do not accept a caller-supplied currency override that conflicts with invoice/company/provider policy.
- Do not hardcode callback currency without verifying the saved attempt’s currency.

## PN-04 — checkout and poll URL allowlist

Validate URLs according to mode.

- Live mode: approved live Paynow hosts only.
- Test mode: add an official staging/test host only if the current Paynow test flow actually returns it.
- Never permit a staging host for a live attempt.
- Poll URL path must be the exact documented CheckPayment endpoint/path pattern, case-insensitively where required—not the broad `/interface/` prefix.
- Checkout URL must be on an approved Paynow host.
- No redirects unless every target is revalidated; preferably keep manual redirect rejection.

## PN-05 — callback arrives before initiation response is saved

A callback can race the local update that stores `pollUrl` and `providerPaymentId`.

Required behavior:

- validate the callback-provided poll URL;
- persist/link the provider transaction and poll URL atomically under the payment-link lock;
- permit the verified callback poll URL as a safe temporary source when the local row has not yet stored it;
- poll and process the authoritative state;
- do not fail merely because initiation response persistence lost the race.

## PN-06 — initiation timeout and merchant trace

Do not perform one immediate trace attempt and then abandon the payment.

Persist recovery state:

- initiation state;
- trace attempts;
- next trace time;
- last safe error;
- maximum attempts;
- provider transaction/poll URL when recovered.

Use bounded exponential backoff.

Rules:

- `NotFound` shortly after timeout is not final proof that no transaction exists.
- `Error` is not equivalent to `NotFound`.
- Do not create another attempt automatically while the first is unresolved.
- When recovered, attach the same upstream transaction to the original link.
- Never double-credit.

## PN-07 — authoritative status

For important callbacks, poll Paynow using an empty POST.

- Signed callback proves authenticity.
- Validated poll result is the current source of truth.
- If callback and poll differ, audit and apply the poll result.
- Do not throw away a newer terminal state.
- If poll response cannot be matched, create reconciliation and retry later.

## PN-08 — lifecycle

Deliberately handle:

- `Created`
- `Sent`
- `Paid`
- `Awaiting Delivery`
- `Delivered`
- `Cancelled`
- `Disputed`
- `Refunded`
- unknown status

Required accounting:

- Created/Sent: no credit.
- Paid: credit once.
- Awaiting Delivery: credit once; admin says **Payment received — funds held by provider**.
- Delivered: keep the same credit and receipt.
- Cancelled: old attempt cannot resume.
- Disputed: remove usable credit, keep immutable history.
- Refunded: apply completed refund/reversal exactly once.
- Unknown: no credit; needs reconciliation.

A stale positive callback cannot reopen `REFUNDED` or `DISPUTED`.

## PN-09 — callback retries and response codes

- Exact valid duplicate: return a successful 2xx quickly.
- Temporary internal failure: return an appropriate retryable failure so Paynow may retry.
- Permanent invalid signature/ownership mismatch: reject safely.
- Do not perform slow notifications inside the callback transaction.
- Callback processing must be idempotent even after ten retries.

## PN-10 — token/instrument data

Paynow may include optional token or payment-instrument fields.

FieldCore does not currently need recurring payment tokenization.

- Do not store tokens, instrument details, fraud payloads, or sensitive raw values unless explicitly required and reviewed later.
- They must still be included where needed to validate the ordered hash.
- Immediately discard them after safe validation.

---

# 9. Ozow-specific completion matrix

Use the direct HTTP web-form-post integration already selected.

## OZ-01 — request field constraints

Validate before rendering the form:

- `SiteCode`: max 50;
- `CountryCode`: `ZA`;
- `CurrencyCode`: `ZAR`;
- `Amount`: decimal `(9,2)`, positive;
- `TransactionReference`: max 50;
- `BankReference`: required, nonempty, max 20;
- each optional field: max 50;
- `Customer`: max 100;
- callback URLs: respect current official length limits;
- `IsTest`: backend-controlled boolean.

Do not truncate values silently when truncation could cause a collision or mismatch. Generate validated provider-safe references.

## OZ-02 — request/response hash

- Keep separate explicit request and response field orders.
- Include empty optional values in the correct positions.
- Append the credential-version private key.
- Lowercase the complete concatenated input as required by the selected integration.
- Use SHA-512 and timing-safe comparison.
- Never log the source string or private key.

## OZ-03 — exact status API parameters

Use the exact parameter names/casing required by the current official API examples and prove them with mocked contract tests.

At minimum validate:

- `ApiKey` header;
- `Accept: application/json`;
- site code;
- transaction reference or transaction ID;
- `IsTest` only for test lookup as documented.

Handle:

- 401/403 credential rejection;
- 404/no result;
- 429/rate limit;
- 5xx/transient failure;
- timeout;
- malformed JSON;
- unexpected content type;
- oversized response;
- non-array response;
- empty results;
- up to and beyond the documented result count safely.

## OZ-04 — duplicate transaction references

Ozow may return several transactions for one merchant reference.

- Once a callback/return provides `TransactionId`, prefer `GetTransaction` by that ID.
- Otherwise filter reference results by site, reference, amount, currency, mode, and known creation window.
- Once a link is bound to a provider transaction ID, never silently switch it to a different transaction ID.
- If two valid Ozow transactions exist for the same link/reference, record both real payments safely: one may settle the invoice and the other becomes unapplied credit/reconciliation.
- Never discard the second real payment as a duplicate merely because the merchant reference matches.

## OZ-05 — repeat submission / browser refresh

Refreshing the auto-submit page must not silently create uncontrolled repeated upstream transactions.

Implement one-time submission state/nonce:

- mark the local form attempt as submitted atomically;
- repeated access displays **We are checking this payment** or the existing attempt;
- do not emit another form unless the prior attempt is authoritatively confirmed not to exist and a new link is intentionally created.

## OZ-06 — customer return durability

Ozow test transactions may rely on redirect handling rather than a notification.

For a signed return:

- validate the hash;
- persist a minimal safe RECEIVED event before redirecting;
- query the authoritative status API;
- apply the matched current result;
- if the API is temporarily unavailable, schedule a background retry;
- do not depend on the customer keeping the page open;
- redirect alone never credits the invoice.

## OZ-07 — lifecycle

- `Complete`: credit once after authoritative verification.
- `Cancelled`: no credit; terminal attempt.
- `Error`: no credit; classify safe error.
- Unknown: reconciliation, no credit.

A stale Complete result cannot reopen a refunded/disputed transaction.

---

# 10. Background payment reconciliation

Callbacks and browser returns are not guaranteed to arrive while the app is online.

Create a bounded background reconciler for unresolved attempts.

Suggested stored fields:

- `nextStatusCheckAt`
- `statusCheckAttempts`
- `lastStatusCheckAt`
- `lastStatusCheckErrorCode`
- `reconciliationState`
- `abandonedAt` where appropriate

Required behavior:

## REC-01 — Paynow unresolved attempts

- poll when poll URL exists;
- trace when initiation timed out and poll URL is missing;
- validate every response;
- apply authoritative status through the same shared update service.

## REC-02 — Ozow unresolved attempts

- query by transaction ID when known;
- otherwise query by reference and filter strictly;
- apply through the same shared update service.

## REC-03 — retry policy

- exponential backoff;
- bounded maximum attempts;
- cooldown prevents user/API hammering;
- transient failures remain retryable;
- permanent auth failure marks connection Needs attention but retains the pending attempt;
- no infinite loops.

## REC-04 — explicit admin check

Provide **Check payment** for an authorized finance user.

- enforce cooldown;
- use plain status;
- do not show poll URLs, endpoints, hashes, or raw responses.

## REC-05 — expiry

Before expiring an unresolved provider attempt:

- perform an authoritative provider status check;
- if paid/refunded/disputed, process it;
- expire only when the provider confirms no completed transaction or the attempt is safely abandoned under documented policy;
- provider outage must not turn a potentially paid attempt into a final expired record.

---

# 11. Refund and dispute accounting

## RF-01 — partial refunds

- Net paid amount must decrease by the completed partial refund.
- Invoice balance/status must update immediately.
- Quote deposit coverage must recompute.
- Receipt remains immutable.
- A credit note is issued once.
- Payment may remain `CONFIRMED` with a derived partially-refunded state, or add an explicit status/model if needed; UI must make the net result clear.

## RF-02 — cumulative refund limits

Under a payment row lock:

```text
sum of active/completed refund requests <= refundable remaining amount
```

Prevent concurrent requests from exceeding the payment amount.

Treat statuses deliberately:

- approval required;
- requested/manual provider action;
- processing;
- completed/refunded;
- failed;
- cancelled.

## RF-03 — provider refund after manual request

When a provider `Refunded` event arrives:

- match an existing compatible `REQUESTED` manual refund where possible;
- update it rather than creating a second refund;
- use provider refund identity where available;
- if amount does not match, reconcile instead of guessing.

## RF-04 — full provider refund after prior partial refund

- Apply only the remaining refundable amount.
- Do not create a refund total larger than the original payment.
- Do not subtract the full amount twice.
- End with the correct invoice balance.

## RF-05 — dispute

- Keep original payment, receipt, and provider history.
- Remove disputed amount from usable invoice credit.
- Set payment/link state consistently.
- Recompute deposit coverage.
- Create one audit event and one customer/admin-visible status.

## RF-06 — refund/dispute before original credit

- Retain terminal provider state.
- Create reconciliation.
- Do not create fake payment credit.
- Later stale positive event cannot reopen it.
- A genuinely newer provider-authoritative resolution may transition only according to an explicit supported matrix.

---

# 12. Connection health and error classification

Do not mark a connection `ERROR` for every transaction error.

Classify failures:

## Credential/auth failure

Examples: 401/403 or provider-specific invalid merchant credentials.

- connection: **Needs attention**;
- block new attempts;
- keep processing existing attempts with their credential version where possible.

## Transaction validation failure

Examples: bad amount, invalid customer data, provider-specific rejected payment request.

- fail only that payment attempt;
- connection remains usable.

## Temporary provider/network failure

Examples: timeout, 429, 5xx, DNS/transient network.

- attempt remains pending/retryable;
- connection does not falsely become invalid;
- schedule reconciliation.

## Signed-response readiness

“Ready” must be scoped to:

- exact credential version;
- exact provider mode;
- successful authorized API check where supported;
- valid signed provider response where required.

A test response cannot make live mode Ready.

---

# 13. Public webhook and return endpoint hardening

## WEB-01 — strict body handling

Use provider-specific strict schemas and a small endpoint body limit, such as 32 KB.

- accept only expected content type;
- cap field count, key length, and value length;
- reject duplicate keys;
- preserve Paynow ordered pairs for hash validation;
- reject malformed URL encoding;
- do not rely only on the app-wide 1 MB limit.

## WEB-02 — invalid signature floods

Do not allow random unauthenticated requests to create unlimited unique database events.

- rate-limit by route/IP with provider retry behavior in mind;
- aggregate or throttle invalid-signature security logs;
- do not use a nullable/random event ID that defeats uniqueness;
- retain enough evidence for security without storing every hostile payload.

## WEB-03 — safe payload storage

Replace the shallow blacklist with provider-specific recursive allowlists.

Store only fields needed for audit, such as:

- safe reference;
- provider transaction ID;
- amount;
- currency;
- status;
- safe status message;
- mode;
- safe timestamps.

Never store:

- hash/signature;
- API/private/integration keys;
- auth email;
- tokenized instrument token;
- card/bank instrument details;
- checkout/poll URLs in event raw payload;
- nested unreviewed provider objects;
- oversized strings or deep objects.

## WEB-04 — response behavior

- Exact valid duplicate: quick 2xx.
- Successfully queued/reconciled event: 2xx.
- Temporary internal failure: retryable status.
- Invalid signature: 401/400.
- Ownership/reference mismatch: safe rejection and security audit.
- Never return stack traces or provider secrets.

---

# 14. Notifications and outbox

Financial commits must not depend on email/WhatsApp delivery.

Add an idempotent post-commit outbox for:

- payment received;
- payment received but held;
- payment refunded;
- payment disputed;
- payment needs review.

Requirements:

- notification failure does not roll back money;
- retry safely;
- one notification per business event key;
- no duplicate notifications from webhook replay;
- no provider secrets/raw payloads in notification content.

---

# 15. UI, reports, and exports consistency

Search all API/UI/report/export code for raw payment sums or hardcoded Paid labels.

Required plain wording:

## Customer

- Paid: **Payment received**
- Pending: **We are still checking your payment**
- Refunded: **Payment refunded**
- Disputed: **This payment is under review**
- Cancelled: **Payment cancelled**
- Failed: **Payment could not be completed**
- Expired: **This payment link has expired**

## Admin

- Paid: **Paid**
- Awaiting Delivery: **Payment received — funds held by provider**
- Refunded: **Payment refunded**
- Disputed: **Payment disputed**
- Overpayment: **Extra payment received — needs review**
- Reconciliation: **Payment needs review**

Fix:

- client invoice amount paid;
- client payment history;
- receipt badges;
- admin payment lists;
- invoice detail;
- collections;
- business performance reports;
- accounting exports;
- dashboards;
- deposit/scheduling status.

Every surface must use the shared ledger result.

---

# 16. Migration safety

## MIG-01 — enum migration risk

The current `20260713170000_finalize_payment_state_integrity` adds enum values and then uses them in `UPDATE` statements in the same migration file.

PostgreSQL may reject use of a newly added enum value until the transaction that added it commits.

First determine whether this migration has been applied anywhere.

### If it has been applied nowhere

- Do not casually deploy it as currently written.
- Split enum additions and data backfill into separate migrations/transactions in a migration-history-safe way.
- Because it has never been applied, it may be replaced only after proving every database reports it as unapplied.
- Record the decision clearly.

### If it has been applied anywhere

- Do not edit it.
- Restore/keep its exact applied checksum.
- Add a corrective follow-up migration.
- Resolve any failed migration explicitly and safely; do not fake success.

Never use `prisma migrate reset` on regional databases.

## MIG-02 — new schema support

Create additive migrations as needed for:

- credential versions;
- payment-link credential version reference;
- provider transaction uniqueness;
- merchant-trace uniqueness;
- invoice attempt snapshot/version;
- unapplied customer credit/overpayment;
- background reconciliation state;
- atomic financial counters;
- callback token;
- notification outbox;
- any explicit partial-refund state.

Make fields nullable/backward-compatible where needed.

Do not guess old data.

## MIG-03 — expanded read-only preflight

Update `scripts/preflight-regional-payment-migration.js` to detect at least:

- duplicate payment per link;
- duplicate provider transaction IDs;
- duplicate Paynow merchant traces per connection;
- duplicate completed provider refunds;
- cumulative refunds above payment amount;
- completed partial refunds not reflected in invoice balance;
- refunded/disputed payment with paid link;
- invoice marked paid despite net refunded/disputed funds;
- `depositPaidAt` with insufficient net deposit coverage;
- multiple active full-balance links for one invoice;
- active links on paid/void/changed invoices;
- links whose amount/currency/customer snapshot no longer matches;
- overpaid invoices/negative balance;
- real provider payment with no invoice application or unapplied credit;
- duplicate receipt or credit-note numbers;
- provider transaction attached to several links;
- pending links on disabled connection without credential version;
- test/live mismatch;
- regional currency/provider mismatch;
- orphaned events, links, payments, receipts, refunds, credits, and credential versions;
- enum migration status/checksum problems.

The preflight is read-only. Print safe IDs/counts only. Never auto-delete or auto-merge money records.

## MIG-04 — migration tests

Test all migrations against:

1. a completely empty PostgreSQL database;
2. a representative legacy database seeded with pre-payment-hardening records;
3. data containing exact safe legacy disputes/refunds;
4. data containing intentional blockers to prove preflight stops.

---

# 17. Automated test matrix

Do not count a skipped real-PostgreSQL test as a pass.

## 17.1 Unit/provider contract tests

### Shared money

- exact Decimal rounding;
- confirmed payment with no refund;
- partial completed refund;
- full refund;
- dispute;
- multiple partial payments;
- multiple partial refunds;
- cumulative refund cap;
- no double subtraction;
- deposit covered/uncovered/recovered;
- report/client/admin totals agree.

### Link lifecycle

- double-click returns one attempt;
- active link reuse;
- replacement link behavior;
- terminal link cannot restart;
- stale invoice snapshot cannot submit;
- late real payment becomes unapplied credit;
- two paid links do not lose the second payment;
- provider transaction cannot bind to two links.

### Credentials

- rotation creates new version;
- old callback uses old version;
- disabled connection blocks new initiation but accepts existing callback;
- readiness resets per version/mode;
- atomic secret update rollback;
- no secret/version data in API or logs.

### Paynow

- explicit ordered request hash;
- ordered response hash with optional fields;
- duplicate form field rejected;
- successful initiation;
- error initiation;
- invalid hash;
- exact amount/reference validation;
- merchant trace uniqueness/length;
- callback before poll URL persistence;
- empty POST polling;
- callback/poll mismatch applies poll state;
- Paid/Awaiting Delivery/Delivered/Cancelled/Disputed/Refunded;
- stale positive after terminal state;
- timeout trace NotFound then later found;
- trace Error remains unresolved;
- live/test URL host rules;
- test email binding;
- optional instrument/token fields are not stored.

### Ozow

- exact request and response hash order;
- all field limits;
- correct currency/country;
- exact API header/query contract;
- signed return persistence;
- return alone does not credit;
- missing test notification recovered via status API;
- several results filtered correctly;
- transaction ID lookup preferred;
- two real transactions with same reference handled separately;
- repeat redirect does not submit another uncontrolled transaction;
- malformed/oversized/non-JSON/rate-limited/transient status responses.

### Web security

- body limit;
- duplicate key rejection;
- invalid signature flood throttled;
- recursive payload allowlist;
- opaque callback token;
- no tenant/company selection from body/query;
- no SSRF/redirect bypass;
- no native dialogs.

## 17.2 API-route tests

Use the real Express routes with mocked provider HTTP.

Test complete customer flows, not only helpers:

### Paynow happy path

```text
save complete tenant credentials
→ create invoice/link
→ initiate
→ persist checkout/poll/trace
→ valid callback
→ authoritative poll
→ one payment
→ one receipt
→ one invoice credit
→ deposit recomputation
→ idempotent notification
→ callback replay
```

### Ozow happy path

```text
save complete tenant credentials
→ create invoice/link
→ render one signed form
→ signed return/notification
→ status API lookup
→ exact transaction match
→ one payment
→ one receipt
→ one invoice credit
→ replay
```

Test all negative/late paths:

- wrong company;
- wrong reference;
- wrong amount;
- wrong currency;
- wrong mode;
- wrong provider transaction ID;
- expired/stale link;
- edited/voided invoice;
- disabled connection;
- rotated credentials;
- callback/poll mismatch;
- duplicate active links;
- provider outage;
- delayed callback;
- second real overpayment;
- partial refund and deposit relock;
- notification failure after commit.

## 17.3 Real PostgreSQL application tests

Use `PAYMENT_TEST_DATABASE_URL` only when:

- hostname is `localhost` or `127.0.0.1`;
- database name ends in `_test`;
- database is not `fieldcore_zw` or `fieldcore_sa`.

The suite must run the same services used by production routes.

Add genuine concurrent scenarios using `Promise.all` and independent Prisma transactions:

1. exact duplicate Paynow callback;
2. Paid and Refunded together;
3. Paid and Disputed together;
4. Awaiting Delivery and Delivered together;
5. two unrelated payments allocating receipt numbers;
6. two unrelated refunds allocating credit-note numbers;
7. two concurrent partial refund requests;
8. two active links both provider-confirmed;
9. provider transaction ID presented for two links;
10. callback before initiation response persistence;
11. credential rotation during callback;
12. disabled connection during callback;
13. partial refund recalculates invoice and deposit;
14. full refund after earlier partial refund;
15. stale invoice/void followed by late provider payment;
16. failure after payment create rolls back payment, receipt, invoice, deposit, outbox, and event together;
17. retry after rollback succeeds;
18. background reconciler race with webhook;
19. expiry race with a paid provider status;
20. company A event cannot affect company B;
21. migration preflight identifies intentionally seeded blockers;
22. all new unique constraints exist and behave correctly.

## 17.4 Migration tests

- Apply complete migration history to a fresh PostgreSQL database.
- Confirm enum migration does not fail.
- Apply against representative legacy schema/data.
- Confirm no reset is required.
- Confirm schema and migration history agree.

---

# 18. Required operational setup and commands

Codex must not merely report that PostgreSQL is unavailable without attempting the safe local setup steps or giving exact commands.

First check service state:

```bash
sudo service postgresql status
sudo service postgresql start
pg_isready -h localhost -p 5432
```

Do not guess the database credentials. Parse the existing local `.env` database URL only for the username/host and ask for a password only if PostgreSQL requires it.

Create a dedicated test database safely, for example:

```bash
sudo -u postgres createdb -O <real_local_db_owner> fieldcore_payments_test
```

Set in the current shell or a local ignored test environment file:

```text
PAYMENT_TEST_DATABASE_URL=postgresql://<user>:<password>@localhost:5432/fieldcore_payments_test
```

Never commit it.

Run:

```bash
npx prisma format
npx prisma validate
npx prisma generate
npm run test:payments:postgres
```

Then focused tests and the trusted regression:

```bash
node --test test/payment-hardening.test.js
node --test test/regional-payment-providers.test.js
node --test \
  --test-name-pattern="task9 payment link webhook confirms trusted provider payment idempotently" \
  test/api.security.test.js
```

Then:

```bash
npm test
npm run build
git diff --check
git status --short
```

No skipped PostgreSQL suite may be reported as success.

---

# 19. Regional preflight and migration deployment

Proceed only after every automated gate passes.

## Zimbabwe

```bash
cd /home/kuhlinji/code/FieldCore_Software
set -a
source .env.zw
set +a

npm run payments:migration-preflight
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

Expected final state:

```text
Database schema is up to date!
```

## South Africa

```bash
cd /home/kuhlinji/code/FieldCore_Software
set -a
source .env.sa
set +a

npm run payments:migration-preflight
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

Expected final state:

```text
Database schema is up to date!
```

If a preflight or migration fails:

- stop;
- report the exact safe IDs/counts and migration name;
- do not reset;
- do not delete or merge financial records automatically;
- do not mark a failed migration as applied without proving the schema/data state.

---

# 20. Post-migration regional smoke tests

Restart both servers.

```bash
fuser -k 3000/tcp 2>/dev/null || true
cd /home/kuhlinji/code/FieldCore_Software
npm run dev:zw
```

In another terminal:

```bash
fuser -k 3001/tcp 2>/dev/null || true
cd /home/kuhlinji/code/FieldCore_Software
npm run dev:sa
```

Verify:

- `/healthz` and `/readyz` on both;
- owner login on both;
- payment settings load;
- credentials stay masked;
- ZW displays Paynow only;
- SA displays Ozow only;
- existing pending payment links still load;
- customer invoice displays one **Make payment online** action;
- partial refund changes balance correctly;
- refund/dispute changes link and invoice consistently;
- deposit gate relocks after insufficient net payment;
- no migration-related 500;
- no technical provider data appears in the UI.

---

# 21. Real provider test matrix required for production readiness

Do not claim these were performed unless they were actually performed with public HTTPS callbacks.

## Paynow

- correctly bound test company/integration/email;
- initiate web payment;
- successful test payment;
- delayed callback;
- callback replay;
- callback arrives before local initiation response persistence where reproducible;
- callback/poll disagreement fixture;
- cancelled payment;
- Awaiting Delivery and Delivered where available;
- merchant-trace recovery after simulated timeout;
- old pending link after credential rotation;
- disabled connection still processes existing callback;
- no duplicate credit/receipt/notification.

## Ozow

- signed web form;
- success test redirect;
- test flow without notification;
- status query by reference;
- transaction ID query;
- cancelled and error flows;
- repeat browser refresh;
- status API temporary failure and later recovery;
- duplicate-reference fixture where possible;
- old pending link after credential rotation;
- no duplicate credit/receipt/notification.

---

# 22. Final report format

Report these exact sections:

1. Starting migration state for test, ZW, and SA.
2. Files changed.
3. Existing migrations changed or preserved, with proof they were unapplied/applied.
4. New migrations.
5. Shared invoice ledger implementation.
6. Partial-refund handling.
7. Deposit coverage handling.
8. Overpayment/unapplied-credit handling.
9. Payment-link idempotency and invoice snapshot handling.
10. Provider transaction and merchant-trace uniqueness.
11. Credential versioning and rotation.
12. Disabled-connection callback behavior.
13. APP_BASE_URL and callback-token hardening.
14. Paynow ordered hashing, poll, trace, and lifecycle changes.
15. Ozow form, transaction-ID lookup, duplicate-reference, and return changes.
16. Background reconciliation and expiry checks.
17. Receipt/credit-note number allocator.
18. Refund/dispute/manual-request matching.
19. Webhook body, rate-limit, and payload-storage hardening.
20. Notification outbox.
21. UI/report/export consistency.
22. Unit tests: exact count/pass/fail.
23. API tests: exact count/pass/fail.
24. Real PostgreSQL tests: exact count/pass/fail; no skip accepted.
25. Fresh migration test result.
26. Legacy migration test result.
27. Full `npm test` exact result.
28. Build result.
29. ZW preflight result.
30. ZW migration result.
31. SA preflight result.
32. SA migration result.
33. Regional smoke-test result.
34. Real Paynow test performed or not.
35. Real Ozow test performed or not.
36. Public HTTPS callbacks performed or not.
37. Remaining limitations.
38. Final label: **Not complete**, **Code complete**, or **Production-ready**, with the release gates used.

Do not omit failed or skipped tests.

---

# 23. Stop conditions

Stop and report rather than guessing if:

- migration history differs between files and `_prisma_migrations`;
- `20260713170000` was applied with a different checksum;
- existing financial data is ambiguous;
- a refund total exceeds its payment;
- one provider transaction is tied to multiple companies/invoices;
- PostgreSQL test database safety checks fail;
- ZW/SA preflight identifies blockers;
- a provider document conflicts with an assumption in this task.

Do not solve ambiguity by deleting records, rewriting history, or weakening tests.

---

# 24. Completion checklist

The task is not code-complete until every box is true:

- [ ] One shared exact-decimal invoice ledger is used everywhere.
- [ ] Completed partial refunds reduce paid totals.
- [ ] Deposit coverage is recalculated after payment/refund/dispute.
- [ ] Receipt and credit-note numbering is concurrency-safe.
- [ ] Customer double-click cannot create duplicate attempts.
- [ ] Multiple paid attempts never cause a real payment to be lost.
- [ ] Overpayments become explicit unapplied credit/reconciliation.
- [ ] Stale/void invoice links cannot initiate blindly.
- [ ] Late real payments are retained safely.
- [ ] Provider transaction identity is unique.
- [ ] Paynow merchant trace is unique and recoverable.
- [ ] Credential rotation preserves pending verification.
- [ ] Disabled connection accepts existing callbacks but blocks new attempts.
- [ ] APP_BASE_URL fails closed for provider flows.
- [ ] Callback identity is opaque and tenant-safe.
- [ ] Paynow uses ordered form/hash processing.
- [ ] Paynow callback/poll mismatch applies authoritative poll state.
- [ ] Paynow timeout recovery retries durably.
- [ ] Ozow exact field limits and API contract are enforced.
- [ ] Ozow transaction ID resolves duplicate references.
- [ ] Ozow return evidence survives browser closure/provider outage.
- [ ] Background reconciliation covers missed callbacks.
- [ ] Expiry checks provider status before final expiry.
- [ ] Cumulative refunds cannot exceed payment.
- [ ] Manual requested refund is matched to provider refund.
- [ ] Invalid webhook flooding is bounded.
- [ ] Stored provider payloads are strictly allowlisted.
- [ ] Financial notifications are post-commit and idempotent.
- [ ] Reports/exports/client/admin all show the same net figures.
- [ ] Enum migrations apply cleanly on fresh PostgreSQL.
- [ ] Legacy migration tests pass.
- [ ] Real PostgreSQL application/concurrency suite passes without skip.
- [ ] Full suite and build pass.
- [ ] ZW preflight and migrations pass.
- [ ] SA preflight and migrations pass.
- [ ] Both regional smoke tests pass.

Only then may the report say **Code complete**.