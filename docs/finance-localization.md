# Finance and Local Accounting Foundation

TASK3 adds a safe finance foundation for FieldCore without pretending to provide live accounting sync.

## What is implemented

- Company finance settings:
  - default currency
  - allowed currencies
  - tax/VAT label
  - tax rate
  - whether prices include tax
  - invoice and receipt prefixes
  - fiscal year start month
  - invoice footer
- Finance integration placeholders for:
  - MANUAL_CSV
  - XERO
  - QUICKBOOKS
  - SAGE
  - ZOHO_BOOKS
  - CUSTOM
- Company-scoped CSV exports for:
  - invoices
  - payments
  - receipts
  - customers
- Finance export logs.
- External record links so exported FieldCore records can later be mapped to accounting records.

## What is not implemented yet

- No live Xero sync.
- No live Sage sync.
- No live QuickBooks sync.
- No OAuth flow.
- No provider API secrets are stored in these finance placeholder records.

Live provider credentials should use encrypted integration secret storage when real sync is built later.

## Security rules

- All finance settings, integrations, exports, export logs, and external record links are scoped by `companyId`.
- Workers cannot access finance settings or finance exports.
- Client portal users cannot access finance settings or finance exports.
- CSV exports are generated only for the authenticated company.
- CSV cells are escaped to reduce spreadsheet formula injection risk.

## Manual QA

1. Log in as OWNER or ADMIN.
2. Open Settings → Finance & Exports.
3. Save currency and tax settings, for example:
   - Currency: ZAR
   - Tax label: VAT
   - Tax rate: 15
4. Create an invoice and confirm the configured invoice prefix is used.
5. Record a confirmed payment and confirm the configured receipt prefix is used.
6. Export invoices, payments, receipts, and customers as CSV.
7. Confirm export logs are created.
8. Log in as a worker and confirm finance endpoints return 403.
