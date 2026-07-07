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

## TASK15 — Enterprise security, compliance, reliability, and admin controls

## Commercial reason

Enterprise buyers need trust before they put operations, finance, customers, and field proof inside a system. This task improves security posture, operational reliability, and compliance readiness.

## Objective

Add practical enterprise security and reliability controls without pretending to be SOC 2/ISO certified before the business is ready.

## Existing foundation to build on

- JWT cookie auth
- `CompanySecuritySettings`
- `AuditLog`
- rate limits
- `/healthz` and `/readyz`
- docs/security-review.md
- docs/backup-plan.md
- integration secret encryption

## Required outcomes

### 1. Two-factor authentication foundation

Support TOTP or email OTP 2FA for admin/owner users.

Requirements:

- enable/disable 2FA
- recovery codes
- require 2FA for owners/admins if company setting enabled
- audit log changes
- rate limit verification attempts

### 2. Session management

Add:

- list active sessions/devices
- revoke session
- revoke all sessions
- session expiry settings
- force logout after password change
- secure cookie behavior maintained

### 3. Password and account policies

Company settings for:

- minimum password length
- require password reset on invite
- failed login lockout threshold
- lockout duration
- inactive user disablement placeholder

### 4. SSO/SAML/OIDC-ready architecture

Do not fully implement every provider unless asked, but create a clean architecture and docs:

- identity provider config model
- OIDC provider interface
- disabled by default
- docs explaining future Google Workspace/Microsoft Entra ID support

### 5. Backup and restore operational tooling

Add docs/scripts for:

- database backup command
- restore command for non-production
- backup verification checklist
- R2/storage backup notes
- disaster recovery runbook

Do not put credentials in docs.

### 6. Data retention and export/delete

Add company settings for retention policy placeholders:

- audit log retention
- notification log retention
- proof photo retention
- deleted customer data policy notes

Add admin data export endpoints for:

- customers
- jobs
- invoices
- payments
- assets
- contracts

### 7. Security event monitoring

Log and surface:

- failed login bursts
- password reset requests
- 2FA failures
- integration secret changes
- role/permission changes
- suspicious webhook failures

### 8. Uptime/ops status page foundation

Add internal status page showing:

- database readiness
- configured integrations
- queue/notification health if applicable
- storage health
- last backup timestamp placeholder

## Tests

Add tests for:

- 2FA required when enabled.
- recovery code works once.
- revoked session cannot access API.
- worker cannot view security events.
- password lockout works.
- role change audit log created.
- data export is company-scoped.
- secrets never appear in status/security logs.

## Manual QA

Verify:

- owner enables 2FA.
- admin login requires 2FA.
- recovery code works once.
- active session can be revoked.
- failed login lockout triggers.
- status page does not leak secrets.

## Acceptance criteria

- Security controls are credible for mid-market procurement conversations.
- Docs are honest: compliance-ready foundation, not certified compliance.
- No secrets leak through logs, status pages, or exports.
