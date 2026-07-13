# Integration Infrastructure

## Customer invoice payments

FieldCore selects the online payment service for the business country. Customers always see one action: **Make payment online**.

Zimbabwe businesses enter only the Paynow Integration ID and Integration Key. South African businesses enter only the Ozow Site Code, API Key, and Private Key.

`APP_BASE_URL` is the backend base address used to generate return and callback URLs. FieldCore creates payment URLs, hashes, callbacks, status checks, regional values, transaction references, and the deployment test/live setting. Businesses do not enter callback URLs or other technical values.

For Paynow test deployments, backend operators may set `PAYNOW_TEST_AUTH_EMAIL`. It is used only when the payment is in test mode and both `PAYNOW_TEST_COMPANY_ID` and `PAYNOW_TEST_INTEGRATION_ID` exactly match the current tenant connection. Otherwise FieldCore omits it. These values are backend-only and must not be returned by APIs or written to logs.

Merchant credentials never fall back to global environment values. Every company must save its own encrypted Paynow Integration ID and Integration Key, or its own Ozow Site Code, API Key, and Private Key.

Provider secrets are encrypted before storage and returned to settings only as masked text. A blank replacement field keeps its saved value. Status wording is deliberate: **Not set up**, **Details saved**, **Ready**, or **Needs attention**. Details are not marked Ready until FieldCore has verified a signed provider response.

### Paynow manual QA

1. Use a Zimbabwe test company and save only the two Paynow details.
2. Confirm the fields lock, stay masked, and show Details saved until signed verification succeeds.
3. Open an unpaid customer invoice and select Make payment online.
4. Complete, cancel, and replay a test callback; confirm important updates are polled and the invoice is credited once.
5. Check Awaiting Delivery, Delivered, Disputed, and Refunded fixtures use plain payment wording.

### Ozow manual QA

1. Use a South African test company and save only the three Ozow details.
2. Confirm the fields lock, stay masked, and do not claim Ready before signed verification.
3. Open an unpaid ZAR invoice and select Make payment online.
4. Confirm the internal redirect page submits the signed form to Ozow.
5. Confirm the customer return alone does not credit the invoice; the status API must agree.
6. Replay Complete, Cancelled, and Error fixtures and confirm the invoice is credited at most once.

FieldCore stores company-specific provider credentials in encrypted database records. Generate the master key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set the result as `INTEGRATION_SECRET_MASTER_KEY_BASE64`. Rotate by adding a new `INTEGRATION_SECRET_KEY_VERSION` and re-encrypting saved secrets with an operational migration.

### Safe source archives

Ordinary ZIP commands can include ignored `.env` files containing real credentials. Use `npm run package:safe` to create the source archive. The command includes `.env.example` and excludes every real environment file, dependencies, uploads, logs, coverage, database dumps, and generated archives. It does not delete local files.

Admins configure integrations from Settings > Integrations:

- Brevo: sender name, sender email, reply-to email, and Brevo API key.
- Meta WhatsApp Cloud API: WABA ID, phone number ID, display number, template name, permanent access token, webhook verify token, and app secret.
- Clickatell: sender/profile/channel settings and API key.
- Africa's Talking: sender ID or short code, sandbox/live mode, username, and API key.
- Cloudflare R2: account ID, bucket, endpoint, public domain, region, access key ID, and secret access key.

Secrets are encrypted with AES-256-GCM before storage and are never returned by API responses. The UI only receives safe provider config, status, configured secret names, last test results, message logs with masked recipients, and storage usage metadata.

FieldCore stores and uses approved provider credentials. Account ownership and approval steps still happen inside each provider dashboard: WhatsApp WABA ownership, phone number migration, templates, and sender setup in Meta; sender/domain approval in Brevo; sender IDs and short codes in Clickatell or Africa's Talking; R2 buckets and access keys in Cloudflare.

Successful R2 uploads create `StorageObject` records and update monthly usage counters. Company logos use R2 only when the R2 connection has a public/custom URL configured; without that public URL, logos stay on local storage because they are rendered in public-facing and client-facing documents.
