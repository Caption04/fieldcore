# TASK11 Contract, asset, warranty, SLA, and preventive maintenance automation

TASK11 turns FieldCore contracts and assets into an operational automation layer.

## Added capabilities

- Asset service history now includes linked jobs, proof photos, invoices, parts used, incidents, compliance documents, last serviced date, and next service due date.
- Assets can store warranty provider, warranty notes, last serviced date, next due date, and compliance status.
- Contract service lines can auto-generate preventive maintenance jobs with lead time, service windows, blackout dates, preferred worker/branch, and review-before-dispatch behavior.
- Contract entitlement evaluation returns `INCLUDED`, `BILLABLE`, `OVERAGE`, `WARRANTY`, or `UNKNOWN`.
- Planned jobs created from contract lines record visit usage so included-visit limits can be enforced.
- SLA evaluation marks jobs as `ON_TRACK`, `AT_RISK`, `BREACHED`, `MET`, or `WAIVED`.
- SLA waiver goes through TASK7 approval gates when a policy exists.
- Warranty-related jobs default to protected/non-billable unless explicitly overridden through approval-capable flow.
- Contract profitability report estimates revenue, parts cost, margin, delivered jobs, overdue services, and SLA breaches.

## Main endpoints

- `GET /api/assets/:id/history`
- `POST /api/assets/:id/incidents`
- `POST /api/assets/:id/compliance-documents`
- `POST /api/service-contracts/:id/evaluate-entitlement`
- `POST /api/service-contracts/:id/generate-planned-jobs`
- `POST /api/jobs/:id/sla/evaluate`
- `POST /api/jobs/:id/sla/waive`
- `POST /api/jobs/:id/warranty`
- `GET /api/reports/contract-profitability`

## Manual QA

1. Create an active service contract for a customer.
2. Add a covered asset and service line with `nextDueAt` in the test window.
3. Generate planned jobs and confirm the job is linked to the contract and asset.
4. Generate or evaluate entitlement again to confirm the included visit cap moves later jobs into overage.
5. Set a job completion SLA in the past and run SLA evaluation.
6. Create an SLA waiver policy and confirm waiver requests require approval.
7. Mark a job as warranty-related and confirm total becomes zero unless override is requested.
8. Open asset history and confirm incidents, compliance documents, proof photos, parts, invoices, and linked jobs appear.
9. Open contract profitability report and confirm margin estimates include parts used.
