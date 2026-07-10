# FieldCore Regional Reset and Local Servers

See [../REGIONAL_LOCAL_DEV.md](../REGIONAL_LOCAL_DEV.md) for the maintained regional local development workflow.

Short version:

```bash
npm run env:regions
createdb fieldcore_zw
createdb fieldcore_sa
npm run db:reset:zw
npm run db:reset:sa
npm run dev:zw
npm run dev:sa
```

Zimbabwe uses `.env.zw`, `fieldcore_zw`, `FIELDCORE_REGION=ZW`, and `http://localhost:3000`.
South Africa uses `.env.sa`, `fieldcore_sa`, `FIELDCORE_REGION=SA`, and `http://localhost:3001`.
