# FieldCore Backup Plan

## Scope

Back up these assets separately:

- PostgreSQL database: tenant data, jobs, quotes, invoices, payments, audit logs, notification logs.
- Uploaded files: company logos, booking photos, proof photos, signatures.
- Environment variables: database URL, JWT secret, provider credentials, notification settings, storage settings.

## Recommended Frequency

- Database: daily automated backups for small deployments, plus point-in-time recovery where the host supports it.
- Uploaded files: daily object/file storage backup or versioned bucket replication.
- Environment variables: update the secure password manager whenever deployment config changes.

## Restore Overview

1. Restore PostgreSQL from the selected backup.
2. Restore uploaded files to the expected storage path or bucket.
3. Restore environment variables from the secure password manager.
4. Run `npm run build`.
5. Run migrations if the restored database is behind the deployed code.
6. Smoke test login, public booking, quote, schedule, proof upload, invoice, payment, receipt, and notifications.

## Responsibilities

The deployment owner is responsible for confirming backups exist, monitoring failures, and testing restores before real customer launch.

## Pre-Launch Test

Before production use, perform a restore into a non-production environment and verify that proof photos/signatures and notification settings still work. Do not claim disaster recovery is ready until restore has been tested.
