# FieldCore Backend

This project has been upgraded from a fake in-memory local API to an Express, PostgreSQL, Prisma, Zod, bcrypt-compatible hashing with bcryptjs, and JWT-cookie backend.

## Important Rules

- Keep the existing static HTML/CSS UI intact.
- Every business model belongs to a `companyId`.
- API handlers scope reads and writes to the authenticated user's company.
- Password hashes are never returned in API responses.
- Write routes validate request bodies with Zod.
- Auth routes are rate limited.
- Errors are returned in a consistent JSON envelope.
- Important writes create audit log records.

## Main Files

- `server.js`: starts the HTTP server.
- `src/app.js`: Express middleware, CORS, logging, rate limiting, API mounting, static serving, and error handling.
- `src/routes/api.js`: authenticated API routes.
- `src/auth.js`: password hashing, JWT cookies, auth middleware, role middleware, and audit helper.
- `src/db.js`: Prisma client singleton.
- `prisma/schema.prisma`: PostgreSQL data model.
- `prisma/seed.js`: demo data seed.
- `assets/api.js`: frontend data loading, login modal, table rendering, and simple create modals.

## Local Commands

```bash
npm install
npm run build
npm run migrate
npm run seed
npm run dev
npm test
```

See `README.md` for environment variables and demo credentials.

## TASK4 Offline Worker Sync Contract

FieldCore now exposes a backend foundation for future Android/iOS technician apps that need to work with weak connectivity.

Worker-only endpoints:

```text
POST /api/worker/devices/register
POST /api/worker/sync/bootstrap
GET  /api/worker/sync/pull?since=
POST /api/worker/sync/push
GET  /api/worker/sync/status/:idempotencyKey
```

Key rules:

- Workers can only register and sync against their own worker profile.
- Bootstrap/pull returns only the authenticated worker's assigned jobs.
- Push accepts queued offline actions with idempotency keys.
- Reusing the same idempotency key returns `DUPLICATE` and does not duplicate job activity, proof photos, signatures, location captures, or parts actions.
- Actions against another worker's job are stored as `REJECTED`, not processed.
- Proof photos, signatures, completion locations, and job activities can store offline metadata such as `capturedAt`, `offlineCreatedAt`, `deviceId`, GPS data, and `syncId`.

Supported offline action types:

```text
JOB_ARRIVE
JOB_START
JOB_PAUSE
JOB_RESUME
JOB_COMPLETE
JOB_NOTE
PROOF_PHOTO_UPLOADED
SIGNATURE_CAPTURED
LOCATION_CAPTURED
PART_USED
PART_SHORTAGE
```

This task does not build a native mobile app. It provides the safe API contract that a native app can use later.
