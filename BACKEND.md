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
