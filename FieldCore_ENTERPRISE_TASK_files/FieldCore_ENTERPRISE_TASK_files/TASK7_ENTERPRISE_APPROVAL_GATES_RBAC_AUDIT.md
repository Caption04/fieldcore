# FieldCore Enterprise Readiness Task

These tasks assume the current codebase is the uploaded `FieldCore_Software(52).zip` project: Node/Express, Prisma/PostgreSQL, static HTML/CSS/JS UI, JWT auth, multi-tenant company scoping, existing assets/contracts, inventory/purchasing, finance localization, offline worker sync foundation, branches, approvals, reports, notifications, integrations, and SaaS billing foundations.

General rules for Codex:

- Work on one task file at a time.
- Do not remove or weaken existing features.
- Preserve company-level tenant isolation. Never trust client-provided `companyId`.
- Keep existing static UI patterns unless explicitly asked to redesign.
- Add Prisma migrations for schema changes.
- Add/extend seed data so manual QA has realistic enterprise examples.
- Add/extend automated tests in `test/api.security.test.js` or new test files.
- Run `npm run build` and `npm test` before marking the task complete.
- Update `README.md`, `BACKEND.md`, and relevant docs when behavior changes.
- Any live third-party integration must be disabled safely unless env vars are configured.
- Do not claim real provider sync/payment works unless the provider call, webhook handling, retry behavior, audit logs, and tests exist.

## TASK7 — Enterprise approval gates, RBAC depth, and audit hardening

## Commercial reason

The current approval system is a good foundation, but enterprise buyers need risky actions to be **blocked until approval**, not merely recorded. This task turns approvals into real control gates and makes FieldCore feel safer for multi-branch operators.

## Objective

Implement enforceable approval gates, deeper role permissions, delegated branch-level authority, and stronger audit trails.

## Existing foundation to build on

- `ApprovalPolicy`
- `ApprovalRequest`
- `ApprovalStatus`
- `ApprovalEventType`
- `AuditLog`
- `Branch`
- `User.role`
- `CompanySecuritySettings`
- `src/routes/api.js`
- `approvals.html`
- `branches.html`
- `settings.html`

## Required outcomes

### 1. Permission model

Add a granular permission system without breaking the existing `OWNER`, `ADMIN`, `WORKER`, `CLIENT` role model.

Implement:

- permission keys such as:
  - `invoice.void`
  - `invoice.discount.approve`
  - `payment.refund`
  - `quote.discount.approve`
  - `purchaseOrder.send`
  - `purchaseOrder.approve`
  - `stock.adjust`
  - `contract.sla.override`
  - `job.reassign.after_dispatch`
  - `branch.manage`
  - `report.enterprise.view`
  - `settings.finance.manage`
  - `integration.manage`
- default permission bundles for owner/admin/worker/client.
- optional per-user permission overrides.
- optional branch-scoped permissions.

Suggested schema additions:

- `PermissionRoleTemplate`
- `UserPermissionOverride`
- `UserBranchAccess`

Keep the design simple enough for the current product. Do not overbuild a full IAM platform.

### 2. Real approval gates

For configured policies, risky actions must return an approval-required response instead of completing immediately.

Gate at minimum:

- void invoice
- cancel paid job
- refund payment
- quote discount above configured threshold
- invoice discount above configured threshold
- send purchase order above threshold
- stock adjustment above threshold/value
- SLA override or breach excuse
- job reassignment after worker already started
- contract cancellation before end date

Expected behavior:

- If no approval policy applies, action proceeds if user has permission.
- If policy applies and user is not allowed to self-approve, create `ApprovalRequest` and return `409` or `202` with clear approval metadata.
- Pending approval should block the original action.
- Approver approves/rejects from API/UI.
- Approved request can be executed by a safe `execute approved action` route.
- Rejected request never executes.
- All actions must be audit logged.

### 3. Approval policy UI

Improve `approvals.html` and/or `settings.html` so admins can configure:

- event type
- enabled/disabled
- threshold amount
- branch scope
- required approver role
- whether requester can self-approve
- expiry window
- reason required yes/no

### 4. Approval inbox

Approvers need a clean queue:

- pending requests
- risk type
- amount/threshold
- requester
- branch
- related record link/id
- reason
- approve/reject buttons
- audit trail

### 5. Audit log hardening

Every sensitive enterprise action must write a useful audit record:

- actor user
- company
- branch if applicable
- action
- before/after snapshot where safe
- IP/user agent if available
- related model/id
- approval request id if relevant

Never store secrets in audit snapshots.

## API requirements

Add or extend endpoints for:

- list permissions
- get/update user permission overrides
- get/update branch access
- list approval policies
- create/update approval policy
- list pending approval requests
- approve/reject request
- execute approved action
- list audit logs with filters

All endpoints must be company scoped.

## Tests

Add tests for:

- worker cannot access admin permissions.
- branch admin cannot approve another branch unless permitted.
- threshold policy blocks risky action.
- approval request is created and audited.
- rejected approval does not execute.
- approved request executes exactly once.
- approval cannot be replayed.
- tenant isolation across approval requests.
- secrets are redacted in audit records.

## Manual QA

Create demo users:

- owner
- global admin
- branch manager
- finance admin
- technician

Verify:

- branch manager only sees their branch approvals.
- quote discount above threshold requires approval.
- PO above threshold requires approval.
- stock adjustment requires approval.
- approval audit log shows complete history.

## Acceptance criteria

- Risky actions are actually blocked until approved.
- Permissions are enforceable server-side.
- UI exposes approval policy and approval queue.
- Tests pass.
- Docs explain approval behavior clearly.
