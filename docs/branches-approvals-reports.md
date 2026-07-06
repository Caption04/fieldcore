# Branches, Approvals, and Deeper Reports

TASK5 adds management-control features for larger field-service teams.

## Branches

Branches are company-scoped records. They can be used to group customers, workers, jobs, assets, service contracts, stock locations, purchase requests, purchase orders, quotes, invoices, payments, and receipts.

Branch assignment is optional so old records remain valid after migration.

## Approvals

Approval policies define approval event types such as purchase order send, invoice void, stock adjustment, job reschedule, and SLA waive.

Approval requests can be created, approved, or rejected by OWNER/ADMIN users. Decisions are audit logged. Worker users cannot access approval management.

## Deeper reports

The added report endpoints are JSON foundations for management dashboards:

- `/api/reports/branch-performance`
- `/api/reports/service-profitability`
- `/api/reports/technician-productivity`
- `/api/reports/sla-performance`
- `/api/reports/inventory-value`
- `/api/reports/purchase-spend`
- `/api/reports/accounts-receivable-aging`

Most reports accept an optional `branchId` query parameter. The API verifies that the branch belongs to the authenticated company before using it.

## Current limits

This phase does not automatically block operational actions until approvals are approved. It provides the approval records, decision workflow, audit logs, and reporting foundation. Deeper enforcement can be added per event type after the exact business policy is chosen.
