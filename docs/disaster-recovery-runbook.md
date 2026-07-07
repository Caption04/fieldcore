# Disaster recovery runbook

This runbook is for operational readiness. Do not store passwords, connection strings, API keys, or provider tokens in this document.

## Backup command

Use the environment-provided database URL and write to a secure private backup location:

```bash
./scripts/backup-db.sh /secure/backups/fieldcore-$(date +%F).dump
```

## Non-production restore command

Never restore production data into production using this script. Use it only for test/staging verification:

```bash
./scripts/restore-db-nonprod.sh /secure/backups/fieldcore-2026-07-07.dump
```

## Verification checklist

1. Confirm the backup file exists and has non-zero size.
2. Restore into an isolated non-production database.
3. Run `npx prisma migrate status`.
4. Run `npm test` against the restored database.
5. Verify login, customer list, job list, invoices, and proof photo references.
6. Record the verification timestamp in the operational tracker.

## Storage/R2 notes

Database backups do not include object storage. Mirror R2 buckets or storage objects separately and verify signed/private access behavior after restore.

## Recovery priority

1. Database connectivity and migrations.
2. Authentication and admin login.
3. Jobs, customers, quotes, invoices, and payments.
4. Proof photos and storage references.
5. Integrations and notification delivery.
