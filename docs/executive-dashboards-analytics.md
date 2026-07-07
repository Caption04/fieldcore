# TASK13 — Executive dashboards, analytics, and leakage reporting

FieldCore now exposes enterprise analytics endpoints for owners and admins. The dashboards are company-scoped, support branch filtering, and are designed to surface revenue leakage, SLA risk, proof gaps, stock issues, and quote-to-cash bottlenecks.

## API

- `GET /api/analytics/executive`
- `GET /api/analytics/branches`
- `GET /api/analytics/technicians`
- `GET /api/analytics/quote-to-cash`
- `GET /api/analytics/contracts-sla`
- `GET /api/analytics/inventory-procurement`
- `GET /api/analytics/export.csv?section=executive|branches|technicians|quote-to-cash|inventory`
- `POST /api/analytics/report-schedules`

Supported filters: `startDate`, `endDate`, and `branchId`. The implementation keeps definitions with the payload so incomplete metrics are not presented as precise truth when FieldCore does not yet have the underlying source data.

## UI

`executive-dashboard.html` gives a simple owner/manager view with cards for revenue, outstanding invoices, overdue invoices, jobs, SLA risk, quote acceptance, proof gaps, and low stock. It also shows branch performance and quote-to-cash funnel sections with CSV export links.

## Security

Workers and clients cannot access these endpoints. Branch filters are validated against company ownership and active branch access records where present. CSV exports run through the same scoped analytics builder and create audit logs.
