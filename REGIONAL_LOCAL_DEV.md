# FieldCore Regional Local Development

Use separate local databases when you want Zimbabwe and South Africa QA to stay completely isolated.

## 1. Generate regional env files

Make sure the root `.env` has a working local `DATABASE_URL`, then run:

```bash
npm run env:regions
```

This creates or updates:

```text
.env.zw -> fieldcore_zw, PORT=3000, FIELDCORE_REGION=ZW
.env.sa -> fieldcore_sa, PORT=3001, FIELDCORE_REGION=SA
```

The generator reuses the same PostgreSQL username, password, host, port, and query string from the root `.env`, changing only the database name. It does not print the database password.

## 2. Create the regional databases

Create both local databases once:

```bash
createdb fieldcore_zw
createdb fieldcore_sa
```

If your local PostgreSQL setup requires an explicit user, use your usual `createdb` flags for that user.

## 3. Reset each region

Run each reset against its regional env file:

```bash
npm run db:reset:zw
npm run db:reset:sa
```

`db:reset:zw` loads `.env.zw`, force-resets `fieldcore_zw`, and seeds only Zimbabwe.
`db:reset:sa` loads `.env.sa`, force-resets `fieldcore_sa`, and seeds only South Africa.

If either env file still has placeholder database credentials, reset stops early and tells you to run `npm run env:regions`.

## 4. Run both servers

Start each server in a separate terminal:

```bash
npm run dev:zw
npm run dev:sa
```

Zimbabwe runs at:

```text
http://localhost:3000
DATABASE_NAME=fieldcore_zw
FIELDCORE_REGION=ZW
```

South Africa runs at:

```text
http://localhost:3001
DATABASE_NAME=fieldcore_sa
FIELDCORE_REGION=SA
```

## 5. Seeded accounts

Password for every seeded account:

```text
FieldCoreDemo2026!
```

Zimbabwe:

```text
owner.zw@fieldcore.test
admin.zw@fieldcore.test
worker.zw@fieldcore.test
```

South Africa:

```text
owner.sa@fieldcore.test
admin.sa@fieldcore.test
worker.sa@fieldcore.test
```

## 6. Regional defaults

Zimbabwe seeds:

```text
country=ZW
currency=USD
timezone=Africa/Harare
payment methods=CASH, BANK_TRANSFER, PAYNOW
online provider=PAYNOW
```

South Africa seeds:

```text
country=ZA
currency=ZAR
timezone=Africa/Johannesburg
payment methods=CASH, BANK_TRANSFER, OZOW, YOCO, PAYFAST, SNAPSCAN
online providers=OZOW, YOCO, PAYFAST, SNAPSCAN
```

Paynow is not a South Africa payment option.

## 7. Avoid data mixing

Use `npm run dev:zw` only with `.env.zw` and `npm run dev:sa` only with `.env.sa`.

Do not point both env files at the same database. To verify the important values without exposing passwords, run:

```bash
grep -n '^DATABASE_URL\|^PORT\|^FIELDCORE_REGION' .env.zw .env.sa
```

The database names should be `fieldcore_zw` and `fieldcore_sa`, with ports `3000` and `3001`.
