# Codex Task: FieldCore Integration Infrastructure

## Important context

This is a Codex implementation task for the FieldCore / service-business SaaS codebase.

The app already has a Node.js / Express backend, Prisma, PostgreSQL, frontend admin screens, existing notification work, and provider-specific files such as Brevo / Paynow-style integrations.

Do **not** rewrite the app.
Do **not** replace the backend with Supabase/Firebase.
Do **not** hard-code one client’s credentials.
Do **not** store secrets in plaintext.

This task requires a **real Prisma migration**.

---

## Goal

Build the foundation that lets each company configure and use its own integrations from the frontend admin panel.

The supported providers for this task are:

1. **Brevo** for email
2. **Meta WhatsApp Cloud API** for WhatsApp messaging
3. **Clickatell** for SMS
4. **Africa's Talking** for SMS
5. **Cloudflare R2** for cloud file storage

The system must support:

- frontend-managed API keys and provider settings
- encrypted secret storage
- company-scoped integration records
- provider-agnostic backend services
- message logs
- storage usage tracking
- safe provider testing from the admin UI
- future provider expansion without rewriting the system

---

## Non-negotiable requirement: Prisma migration

This task **must include a Prisma migration**.

Do not only add service files, environment variables, or frontend forms.
Codex must update `prisma/schema.prisma` and create a committed migration under:

```txt
prisma/migrations/<timestamp>_add_integration_infrastructure/
```

Do **not** use `prisma db push` as the final solution.

Run the proper Prisma flow:

```bash
npx prisma format
npx prisma migrate dev --name add_integration_infrastructure
npx prisma generate
```

The migration must add database support for:

- integration connections
- encrypted integration secrets
- message logs
- storage object / storage usage tracking
- safe provider status metadata
- company-scoped integration ownership

---

## Database design requirements

Inspect the existing Prisma schema first and adapt naming to match the project.
Do not duplicate existing models blindly.
If there is already a `NotificationLog` model, either extend it carefully or add a separate provider-level `MessageLog` model that links cleanly to existing notification records.

### 1. Integration connections

Create a model similar to:

```prisma
model IntegrationConnection {
  id              String   @id @default(cuid())
  companyId       String
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  provider        IntegrationProvider
  channel         IntegrationChannel
  displayName     String?
  status          IntegrationStatus @default(DISCONNECTED)

  // Safe, non-secret config only.
  // Examples: sender name, sender email, WABA ID, phone number ID,
  // SMS sender ID, R2 bucket name, public endpoint, region.
  config          Json?

  lastTestedAt    DateTime?
  lastTestStatus  String?
  lastTestError   String?
  lastUsedAt      DateTime?

  createdById     String?
  updatedById     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  secrets         IntegrationSecret[]
  messageLogs     MessageLog[]
  storageObjects  StorageObject[]

  @@index([companyId])
  @@index([provider])
  @@index([channel])
  @@index([status])
  @@index([createdAt])
}
```

Use enums or equivalent fields for:

```prisma
enum IntegrationProvider {
  BREVO
  META_WHATSAPP_CLOUD
  CLICKATELL
  AFRICAS_TALKING
  CLOUDFLARE_R2
}

enum IntegrationChannel {
  EMAIL
  WHATSAPP
  SMS
  STORAGE
}

enum IntegrationStatus {
  DISCONNECTED
  CONFIGURED
  ACTIVE
  ERROR
  DISABLED
}
```

### 2. Encrypted secret storage

Add a dedicated encrypted secret model.

Example shape:

```prisma
model IntegrationSecret {
  id                      String   @id @default(cuid())
  companyId               String
  integrationConnectionId String

  company                 Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  integrationConnection   IntegrationConnection @relation(fields: [integrationConnectionId], references: [id], onDelete: Cascade)

  keyName                 String
  encryptedValue          String
  iv                      String
  authTag                 String
  keyVersion              String

  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@unique([integrationConnectionId, keyName])
  @@index([companyId])
  @@index([integrationConnectionId])
}
```

Secrets must include things such as:

- Brevo API key
- Meta WhatsApp access token
- WhatsApp webhook verify token
- WhatsApp app secret if needed
- Clickatell API key
- Africa's Talking API key
- Africa's Talking username
- Cloudflare R2 access key ID
- Cloudflare R2 secret access key
- Cloudflare R2 account ID if treated as sensitive
- webhook signing secrets

Never store these in plaintext.

### 3. Message logs

Add provider-level message logging for email, WhatsApp, and SMS.

Example shape:

```prisma
model MessageLog {
  id                      String   @id @default(cuid())
  companyId               String
  integrationConnectionId String?

  company                 Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  integrationConnection   IntegrationConnection? @relation(fields: [integrationConnectionId], references: [id], onDelete: SetNull)

  provider                IntegrationProvider
  channel                 IntegrationChannel
  direction               MessageDirection @default(OUTBOUND)
  status                  MessageStatus @default(QUEUED)

  // Link to business records where available.
  bookingId               String?
  jobId                   String?
  customerId              String?
  invoiceId               String?
  notificationLogId        String?

  recipientMasked         String?
  recipientHash           String?
  senderMasked            String?

  providerMessageId       String?
  providerStatus          String?
  errorCode               String?
  errorMessageSanitized   String?

  templateName            String?
  metadata                Json?

  queuedAt                DateTime?
  sentAt                  DateTime?
  deliveredAt             DateTime?
  failedAt                DateTime?
  readAt                  DateTime?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@index([companyId])
  @@index([provider])
  @@index([channel])
  @@index([status])
  @@index([bookingId])
  @@index([jobId])
  @@index([customerId])
  @@index([createdAt])
}
```

Use enums or equivalent fields:

```prisma
enum MessageDirection {
  OUTBOUND
  INBOUND
}

enum MessageStatus {
  QUEUED
  SENT
  DELIVERED
  READ
  FAILED
  CANCELLED
}
```

Important:

- Do not store full sensitive message bodies unless absolutely necessary.
- Prefer template name, event type, and safe metadata.
- Mask phone numbers and emails before saving.
- Store a hash for searching/deduplication where needed.
- Store sanitized provider errors, not raw provider payloads containing secrets.

### 4. Storage usage tracking

Add storage tracking for Cloudflare R2 uploads.

Example shape:

```prisma
model StorageObject {
  id                      String   @id @default(cuid())
  companyId               String
  integrationConnectionId String?

  company                 Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  integrationConnection   IntegrationConnection? @relation(fields: [integrationConnectionId], references: [id], onDelete: SetNull)

  provider                IntegrationProvider @default(CLOUDFLARE_R2)
  bucket                  String
  objectKey               String
  safeUrl                 String?

  fileName                String?
  mimeType                String?
  sizeBytes               BigInt
  checksum                String?

  bookingId               String?
  jobId                   String?
  customerId              String?
  uploadedById            String?

  createdAt               DateTime @default(now())
  deletedAt               DateTime?

  @@index([companyId])
  @@index([provider])
  @@index([bucket])
  @@index([jobId])
  @@index([bookingId])
  @@index([customerId])
  @@index([createdAt])
}
```

Also add a monthly usage rollup model if useful:

```prisma
model StorageUsageMonthly {
  id             String   @id @default(cuid())
  companyId      String
  company        Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  provider       IntegrationProvider @default(CLOUDFLARE_R2)
  year           Int
  month          Int
  totalBytes     BigInt   @default(0)
  objectCount    Int      @default(0)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([companyId, provider, year, month])
  @@index([companyId])
  @@index([provider])
}
```

---

## Security requirements

### Secret encryption

Create a backend encryption utility using Node crypto.

Use AES-256-GCM or a similarly secure authenticated encryption method.

Required encrypted fields:

- `encryptedValue`
- `iv`
- `authTag`
- `keyVersion`

The master key must come from environment config, for example:

```bash
INTEGRATION_SECRET_MASTER_KEY_BASE64=
INTEGRATION_SECRET_KEY_VERSION=v1
```

Rules:

- The master key must never be stored in the database.
- Secrets must be encrypted before database insert/update.
- Secrets must be decrypted only inside trusted backend provider services.
- Secrets must never be returned to the frontend.
- Secrets must never appear in logs, errors, or test responses.
- Add a redaction helper for logs and error objects.
- Any failed provider test must return a safe error message.

### Frontend-safe responses

When the frontend asks for integration settings, return only safe metadata:

- provider
- channel
- display name
- configured / not configured
- status
- last tested time
- last test status
- last used time
- safe config fields

Never return:

- API keys
- access tokens
- webhook secrets
- encrypted secret values
- IVs
- auth tags
- full provider payloads containing sensitive data

---

## Backend requirements

### Provider-agnostic integration service

Add a service layer that resolves the correct company integration at runtime.

Suggested structure, adapt to the repo:

```txt
src/services/integrations/
  integrationRegistry.js
  integrationSecrets.service.js
  integrationConnections.service.js
  messageLog.service.js
  storageUsage.service.js
  providers/
    brevoEmail.provider.js
    metaWhatsApp.provider.js
    clickatellSms.provider.js
    africasTalkingSms.provider.js
    cloudflareR2Storage.provider.js
src/utils/crypto/
  encryptSecret.js
  redact.js
```

The service should support:

- saving provider config
- encrypting provider secrets
- updating provider config
- testing provider credentials
- disabling an integration
- resolving active company provider by channel
- sending email / WhatsApp / SMS through the active provider
- recording message logs
- recording storage usage

### Admin routes

Add backend routes for company admins.

Suggested route shape:

```txt
GET    /api/admin/integrations
GET    /api/admin/integrations/:id
POST   /api/admin/integrations
PATCH  /api/admin/integrations/:id
POST   /api/admin/integrations/:id/test
POST   /api/admin/integrations/:id/disable
GET    /api/admin/integrations/message-logs
GET    /api/admin/integrations/storage-usage
```

Every route must:

- require authentication
- require admin/company permission
- scope all records by `companyId`
- never expose secrets
- validate provider-specific fields
- return safe error messages

### Provider testing

Implement safe test functions:

#### Brevo

Test that the API key is valid and can access the Brevo account/sender setup.
Do not send a real customer email during a basic credential test unless explicitly requested.

#### Meta WhatsApp Cloud API

Test that:

- access token works
- WABA ID / phone number ID is valid
- configured phone number can be accessed
- webhook verify token is stored safely

Do not assume the WhatsApp Business Account can be changed through FieldCore code.
The code should store and use the IDs/tokens configured inside Meta.
Company/WABA/phone-number ownership changes must still happen inside Meta.

#### Clickatell

Test that the Clickatell API key works.
Store sender ID or channel config as safe config unless provider docs require otherwise.

#### Africa's Talking

Test that the username and API key work.
Store sender ID / short code config safely.
Do not hard-code sandbox credentials.

#### Cloudflare R2

Test that:

- access key and secret key can authenticate
- configured bucket exists or can be reached
- object upload/list permission works safely

Use a tiny temporary test object and delete it after the test if needed.

---

## Frontend requirements

Add or update an admin settings area for integrations.

Suggested tabs/cards:

1. Email / Brevo
2. WhatsApp / Meta Cloud API
3. SMS / Clickatell
4. SMS / Africa's Talking
5. Storage / Cloudflare R2
6. Message logs
7. Storage usage

Each integration card should show:

- provider name
- configured / not configured
- active / disabled / error
- last tested
- last used
- safe provider config
- buttons:
  - Save / Update settings
  - Test connection
  - Disable integration

Secret input behavior:

- Secret fields may be blank on edit.
- Blank secret fields should mean “keep existing secret.”
- Show placeholder text like `•••••••• saved` when configured.
- Never display the real saved secret.
- Never fetch saved secrets from the backend.

Frontend forms must support these provider settings:

### Brevo

Safe config:

- sender name
- sender email
- reply-to email

Secret fields:

- Brevo API key

### Meta WhatsApp Cloud API

Safe config:

- WABA ID
- phone number ID
- business phone display number
- default template namespace/name where applicable

Secret fields:

- permanent access token
- webhook verify token
- app secret if used for signature verification

### Clickatell

Safe config:

- sender ID
- SMS profile/channel config if applicable

Secret fields:

- Clickatell API key

### Africa's Talking

Safe config:

- sender ID / short code
- environment mode: sandbox or live

Secret fields:

- Africa's Talking username if treated as sensitive
- Africa's Talking API key

### Cloudflare R2

Safe config:

- account ID if not treated as secret
- bucket name
- endpoint
- public/custom domain if used
- region/auto setting

Secret fields:

- access key ID
- secret access key

---

## Messaging requirements

Update the notification/message sending layer so it can use company-level integration settings.

Email should use Brevo through the configured company connection.
WhatsApp should use Meta WhatsApp Cloud API through the configured company connection.
SMS should support both Clickatell and Africa's Talking.

The system should be able to choose:

- active email provider for a company
- active WhatsApp provider for a company
- active SMS provider for a company

For SMS, if both Clickatell and Africa's Talking are configured, support selecting which one is active.
Do not send duplicate SMS messages through both unless explicitly requested by the business logic.

Every outbound message attempt must write or update a `MessageLog` record.

Log statuses:

- queued
- sent
- delivered if callback/webhook supports it
- read if WhatsApp callback supports it
- failed

---

## Webhook / callback requirements

Where applicable, add safe webhook handling for provider status callbacks.

Required principles:

- verify signatures where the provider supports it
- never trust provider payloads blindly
- map provider status to internal `MessageStatus`
- update `MessageLog` using provider message ID
- store only sanitized metadata
- never log tokens or secrets

For Meta WhatsApp Cloud API:

- support webhook verification with the saved verify token
- support message status callbacks if already practical in the codebase

For Clickatell / Africa's Talking:

- add callback route structure if status callbacks are supported
- make it safe and company-scoped where possible

---

## Cloud storage requirements

Wire Cloudflare R2 into a provider abstraction.

The storage provider should support:

- upload file
- delete file
- get signed/private access URL if needed
- record `StorageObject`
- update monthly usage rollup

All uploaded files must be scoped to company paths, for example:

```txt
companies/<companyId>/jobs/<jobId>/<filename>
companies/<companyId>/bookings/<bookingId>/<filename>
```

Do not mix files from different companies.
Do not expose raw private bucket URLs unless intended.

Track:

- company ID
- bucket
- object key
- file size
- MIME type
- related job/booking/customer
- uploader
- upload timestamp

---

## Multi-tenant safety

Every integration-related table must include `companyId`.

This includes:

- integration connections
- integration secrets
- message logs
- storage objects
- storage usage rollups
- webhook events if added

Every query must be scoped by company.
No admin from one company should read, test, update, or use another company’s integrations.

Add indexes for:

- `companyId`
- `provider`
- `channel`
- `status`
- `createdAt`
- `bookingId`
- `jobId`
- `customerId`

---

## Environment variables

Add documented environment variables to `.env.example`.

Required:

```bash
INTEGRATION_SECRET_MASTER_KEY_BASE64=
INTEGRATION_SECRET_KEY_VERSION=v1
```

Keep existing provider env vars only as optional fallback/development defaults if the app already uses them.
The main production path should be company-specific encrypted credentials stored in the database.

Do not commit real keys.
Do not seed real keys.

---

## Testing requirements

Add or update tests for:

1. Prisma schema compiles
2. migration runs
3. integration secrets are encrypted before storage
4. saved secrets are never returned by API responses
5. integration list returns safe metadata only
6. Brevo provider can be resolved from company config
7. WhatsApp provider can be resolved from company config
8. Clickatell SMS provider can be resolved from company config
9. Africa's Talking SMS provider can be resolved from company config
10. Cloudflare R2 provider can be resolved from company config
11. message logs are created on send attempt
12. storage objects are recorded on upload
13. monthly storage usage can be calculated or updated
14. company A cannot access company B integrations
15. blank secret field on update preserves existing encrypted secret

Run the existing test suite and ensure nothing breaks.

Suggested commands:

```bash
npm run lint
npm test
npx prisma format
npx prisma migrate dev --name add_integration_infrastructure
npx prisma generate
npm run build
```

Use the actual project scripts if names differ.

---

## Documentation requirements

Update project documentation with:

- how to generate `INTEGRATION_SECRET_MASTER_KEY_BASE64`
- how admins configure Brevo
- how admins configure Meta WhatsApp Cloud API
- how admins configure Clickatell
- how admins configure Africa's Talking
- how admins configure Cloudflare R2
- what secrets are stored encrypted
- what data is shown safely in the frontend
- how to test integrations
- what remains configured inside provider dashboards

Make this clear:

FieldCore can store and use provider IDs/keys/tokens, but some things must still be configured inside the provider platform itself.

Examples:

- WhatsApp WABA ownership, phone number migration, templates, and sender setup happen inside Meta.
- Brevo sender/domain approval happens inside Brevo.
- SMS sender IDs, short codes, and approval rules happen inside Clickatell or Africa's Talking.
- Cloudflare R2 buckets/access keys are created in Cloudflare.

FieldCore should not pretend to create or transfer these external accounts by code.
It should only store the approved credentials/settings and use them safely.

---

## Acceptance criteria

The task is complete only when all of these are true:

- A real Prisma migration exists under `prisma/migrations/...add_integration_infrastructure/`.
- `schema.prisma` includes integration tables or equivalent project-matching models.
- Integration records are scoped to `companyId`.
- Secrets are encrypted with authenticated encryption.
- Secrets are never returned to the frontend.
- Frontend admins can save/update integration credentials.
- Frontend admins can test provider connections safely.
- Brevo integration is supported.
- Meta WhatsApp Cloud API integration is supported.
- Clickatell SMS integration is supported.
- Africa's Talking SMS integration is supported.
- Cloudflare R2 storage integration is supported.
- Message logs exist for email, WhatsApp, and SMS.
- Storage object/usage tracking exists.
- Monthly storage usage can be calculated or rolled up.
- Existing notification flows still work.
- Existing booking/job/payment flows still work.
- No plaintext API keys, tokens, sender secrets, or webhook secrets are stored.
- No real secrets are committed, logged, or seeded.
- Tests pass.
- The app builds.

---

## Final Codex instruction

Implement this carefully in small commits.

Start with the Prisma schema and migration first.
Then add encryption utilities.
Then add backend integration services.
Then add admin routes.
Then update the frontend settings screens.
Then wire message logs and storage usage tracking.
Then add tests and docs.

Do not skip the migration.
Do not fake the provider layer with hard-coded keys.
Do not expose secrets back to the frontend.
