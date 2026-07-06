# Integration Infrastructure

FieldCore stores company-specific provider credentials in encrypted database records. Generate the master key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set the result as `INTEGRATION_SECRET_MASTER_KEY_BASE64`. Rotate by adding a new `INTEGRATION_SECRET_KEY_VERSION` and re-encrypting saved secrets with an operational migration.

Admins configure integrations from Settings > Integrations:

- Brevo: sender name, sender email, reply-to email, and Brevo API key.
- Meta WhatsApp Cloud API: WABA ID, phone number ID, display number, template name, permanent access token, webhook verify token, and app secret.
- Clickatell: sender/profile/channel settings and API key.
- Africa's Talking: sender ID or short code, sandbox/live mode, username, and API key.
- Cloudflare R2: account ID, bucket, endpoint, public domain, region, access key ID, and secret access key.

Secrets are encrypted with AES-256-GCM before storage and are never returned by API responses. The UI only receives safe provider config, status, configured secret names, last test results, message logs with masked recipients, and storage usage metadata.

FieldCore stores and uses approved provider credentials. Account ownership and approval steps still happen inside each provider dashboard: WhatsApp WABA ownership, phone number migration, templates, and sender setup in Meta; sender/domain approval in Brevo; sender IDs and short codes in Clickatell or Africa's Talking; R2 buckets and access keys in Cloudflare.

Successful R2 uploads create `StorageObject` records and update monthly usage counters. Company logos use R2 only when the R2 connection has a public/custom URL configured; without that public URL, logos stay on local storage because they are rendered in public-facing and client-facing documents.
