# FieldCore

FieldCore is a field-service SaaS foundation for companies that manage customers, workers, jobs, quotes, invoices, schedules, worker locations, and proof-of-work photos.

The existing static HTML/CSS UI is preserved. `server.js` now starts an Express backend, serves the static pages, and mounts the production-oriented API under `/api`.

## Stack

- Node.js and Express
- PostgreSQL
- Prisma ORM
- Zod validation
- bcrypt-compatible password hashing with bcryptjs
- JWT auth in secure HTTP-only cookies
- Centralized JSON error handling
- Morgan request logging
- CORS configured from environment variables

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create an `.env` file from `.env.example` and update `DATABASE_URL` for your local PostgreSQL database:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Generate Prisma client and run migrations:

```bash
npm run build
npm run migrate
```

4. Seed demo data:

```bash
npm run seed
```

5. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

- `PORT`: HTTP port, defaults to `3000`.
- `DATABASE_URL`: PostgreSQL connection string used by Prisma.
- `JWT_SECRET`: long random secret for signing auth tokens.
- `COOKIE_NAME`: auth cookie name, defaults to `fieldcore_token`.
- `CLIENT_ORIGIN`: allowed browser origin for CORS, usually `http://localhost:3000` locally.
- `DEMO_OWNER_EMAIL`: seed owner email, defaults to `owner@fieldcore.test`.
- `DEMO_PASSWORD`: seed user password, defaults to `FieldCoreDemo2026!`.

## Scripts

- `npm run dev`: start the Express backend and static UI.
- `npm start`: same as dev for local hosting.
- `npm run build`: generate the Prisma client.
- `npm run migrate`: run Prisma migrations against PostgreSQL.
- `npm run seed`: create demo company, owner, admin, worker, customer, service, quote, job, schedule item, and invoice.
- `npm test`: run Node test files with the built-in test runner.

## Demo Login

After seeding, log in from the injected modal with:

```text
owner@fieldcore.test / FieldCoreDemo2026!
```

Worker access can be tested with:

```text
worker@fieldcore.test / FieldCoreDemo2026!
```

Workers can only access worker-safe routes such as assigned jobs, schedule, location updates, and job photos. Admin-only data such as customers, quotes, invoices, workers, and services is protected by role middleware.

## API Shape

Successful responses use:

```json
{ "ok": true, "data": {} }
```

Errors use:

```json
{ "ok": false, "error": { "message": "Validation failed" } }
```

All business data is scoped by `companyId` in Prisma queries. API handlers never trust client-provided `companyId` values.
