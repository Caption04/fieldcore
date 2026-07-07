# FieldCore mobile API contract

TASK10 hardens the backend contract for a native offline-first technician app. The current priority is deterministic backend sync behaviour; Flutter/iOS implementation can consume this contract later.

## Authentication

Technicians use the existing internal login endpoint:

- `POST /api/auth/login` with email/password.
- Session cookie is used for subsequent calls.
- Native apps should preserve the authenticated session securely and refresh by re-login when the API returns `401`.

## Device registration

`POST /api/worker/devices/register`

```json
{
  "platform": "ANDROID",
  "deviceId": "hardware-or-installation-id",
  "deviceName": "Samsung A22",
  "deviceModel": "SM-A226B",
  "appVersion": "1.0.0"
}
```

The response returns `active`, `trustedAt`, `lastSeenAt`, and revoke metadata. Revoked devices cannot register or sync. Admins can revoke devices with `PATCH /api/admin/worker-devices/:id/revoke`.

## Mobile config

`GET /api/worker/mobile/config` returns supported offline action types, statuses, max batch size, and server time.

## Pull sync

`GET /api/worker/sync/v2/pull?deviceId=<deviceId>&since=<ISO timestamp>`

Returns:

- `serverTime`
- `syncCursor`
- assigned jobs only
- customer/service summary
- assets
- proof photos
- signature
- completion location
- parts
- checklist answers
- recent sync actions

Workers only receive jobs assigned to their own worker profile.

## Push sync

`POST /api/worker/sync/v2/push`

```json
{
  "deviceId": "device-installation-id",
  "actions": [
    {
      "idempotencyKey": "uuid-per-action",
      "clientActionId": "local-db-row-id",
      "actionType": "JOB_START",
      "snapshotUpdatedAt": "2026-01-10T10:00:00.000Z",
      "payload": { "jobId": "job-a", "capturedAt": "2026-01-10T10:05:00.000Z" }
    }
  ]
}
```

The response always includes per-action results. Successful and failed actions can appear in the same batch. Duplicate `idempotencyKey` values return `DUPLICATE` and do not execute twice.

## Supported offline action types

- `JOB_ARRIVE`
- `JOB_START`
- `JOB_PAUSE`
- `JOB_RESUME`
- `JOB_COMPLETE`
- `JOB_NOTE`
- `PROOF_PHOTO_UPLOADED`
- `SIGNATURE_CAPTURED`
- `LOCATION_CAPTURED`
- `GPS_CHECKPOINT`
- `PART_USED`
- `PART_SHORTAGE`
- `CHECKLIST_COMPLETED`
- `ISSUE_NOTE`
- `CUSTOMER_UNAVAILABLE`

## Conflict format

If a pushed action includes `snapshotUpdatedAt` older than the server job `updatedAt`, FieldCore records the action as `CONFLICT` and returns details:

```json
{
  "status": "CONFLICT",
  "error": "Job changed after offline snapshot",
  "result": {
    "code": "SYNC_CONFLICT",
    "jobId": "job-a",
    "serverUpdatedAt": "...",
    "snapshotUpdatedAt": "..."
  }
}
```

Admins review conflicts through `GET /api/admin/offline-actions` and can mark them resolved with `POST /api/admin/offline-actions/:id/resolve`.

## Checklist payload

`CHECKLIST_COMPLETED` payload:

```json
{
  "jobId": "job-a",
  "templateId": "template-id",
  "answers": [
    { "itemId": "item-id", "answer": "Yes", "passed": true, "note": "OK", "photoUrl": "/uploads/proof/a.jpg" }
  ]
}
```

Required checklist items block `JOB_COMPLETE` until answered. Items with `photoRequired` require `photoUrl`.

## Error/status codes

- `401`: not authenticated
- `403`: role/device/tenant not allowed, including revoked devices
- `404`: record not found in tenant scope
- `409`: business conflict, duplicate state, incomplete checklist, or offline snapshot conflict
- per-action `FAILED`, `REJECTED`, `CONFLICT`, `DUPLICATE`, `PROCESSED` are returned inside sync responses
