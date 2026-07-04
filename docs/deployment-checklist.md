# FieldCore Deployment Checklist

## Before Deploy

- Set production environment variables: `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `APP_BASE_URL`, `CLIENT_ORIGIN`, email, WhatsApp, and storage settings.
- Confirm `JWT_SECRET` is long, random, and not the development fallback.
- Confirm database backups and uploaded-file backups are configured.
- Remove demo data or intentionally seed a demo tenant only in a non-production environment.
- Create an owner/admin account for the production company.
- Configure domain and HTTPS.
- Configure email and WhatsApp providers, or explicitly leave them disabled with skipped notifications expected.
- Confirm upload storage path or external storage is backed up.

## Deploy Steps

- Install dependencies in Ubuntu/Linux, not a Windows-mounted folder.
- Run `npm run build`.
- Run migrations using the project migration process.
- Start with `npm run start` or the host process manager.
- Check `/healthz` and `/readyz`.

## Smoke Tests

- Login as owner/admin.
- Submit a public booking.
- Track the public booking with reference plus email/phone.
- Send a quote.
- Accept a quote as client.
- Schedule a job.
- Complete a job with proof photos and signature.
- View proof in the client portal.
- Send an invoice.
- Record payment and check receipt.
- Check notification logs and audit logs in Settings.

## Production Sign-Off

- Backup plan confirmed.
- Security review completed.
- Rate limits enabled.
- No real secrets committed to the repo.
- Manual smoke tests passed.
