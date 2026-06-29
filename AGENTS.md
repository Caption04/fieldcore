# FieldCore Agent Instructions

## Project
FieldCore is a field-service SaaS system for businesses that manage customers, workers, jobs, quotes, invoices, schedules, and proof-of-work photos.

## Important rule
Do not destroy the existing UI design. The current HTML/CSS is the visual base.

## Backend standards
- Use Express, PostgreSQL, Prisma, Zod, and JWT auth.
- Every business record must be scoped to companyId.
- Never allow one company to access another company’s data.
- Use clear folder structure.
- Use validation on every write route.
- Use centralized error handling.
- Keep responses consistent.

## Roles
- OWNER: full company access.
- ADMIN: manage jobs, customers, quotes, invoices, workers.
- WORKER: only assigned jobs, schedule, and own location updates.

## Done means
- The app runs locally.
- Database migrations work.
- Seed data works.
- Auth works.
- Dashboard shows real data.
- Main pages fetch from the database.
- No fake in-memory backend remains.