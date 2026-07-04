# FieldCore Security Review

## Authentication Boundaries

Internal users use JWT auth with secure HTTP-only cookies. Client portal users use a separate client session cookie. Public booking and tracking routes do not require login and must return only customer-safe data.

## Authorization And Scoping

Admin/owner routes are protected by role checks. Worker routes are scoped to assigned worker jobs. Client routes are scoped to linked client/customer records. Business data queries must include `companyId`.

## Public Tracking

Public request tracking requires a request reference plus matching email or phone. Reference-only tracking is rejected.

## Secrets And Sensitive Data

API responses normalize records to omit `passwordHash`. Production config validation requires non-default auth secrets. System status surfaces only configured/missing labels, never values.

## Error Safety

Unexpected server errors return a generic message. Server logs redact common secret-like strings and include only method/path/context.

## Rate Limiting

High-risk auth, public booking, public tracking, and upload routes use route-group rate limits. In-memory rate limiting is acceptable for a single-instance MVP; distributed deployments should add Redis or provider-level limits.

## File Upload Safety

Uploads accept only configured image MIME types and enforce size limits. Uploaded proof photos, signatures, and booking photos remain linked to scoped records.

## Notifications

Email and WhatsApp providers must not expose API keys in responses or logs. Notification logs store event, channel, recipient, status, and sanitized errors only.

## Backups

Database backups and uploaded-file backups are separate. Losing uploaded files can lose proof photos and signatures. Restore must be tested before production launch.

## Known Follow-Ups

- Use centralized external rate limiting for multi-instance production.
- Move local uploads to managed object storage for serious production deployments.
- Add automated backup monitoring once the deployment provider is selected.
