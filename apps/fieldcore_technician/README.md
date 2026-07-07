# FieldCore Technician App

This is the isolated Flutter scaffold for the native FieldCore technician app.
It lives under `apps/fieldcore_technician` so backend changes and mobile changes stay separate.

The app consumes the TASK10 mobile/offline API contract:

- `POST /api/auth/login`
- `POST /api/worker/devices/register`
- `GET /api/worker/mobile/config`
- `GET /api/worker/sync/v2/pull`
- `POST /api/worker/sync/v2/push`

## First-time platform bootstrap

This patch intentionally does not commit generated Flutter `android/`, `ios/`, `build/`, or `.dart_tool/` output. That keeps repo zips below the 512 MB upload limit.

From this directory, run:

```bash
../../scripts/bootstrap_flutter_technician_platforms.sh
```

Then run:

```bash
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=FIELDCORE_API_BASE_URL=http://10.0.2.2:3000
```

Use `http://10.0.2.2:3000` for an Android emulator talking to a backend running on your computer. Use your LAN IP for a physical Android phone.

## Included screens

- Login and device registration
- Today/jobs list
- Job detail
- Start/pause/resume/complete job actions
- Checklist answer queue
- Proof photo metadata queue
- Customer signature queue scaffold
- Parts used queue
- Sync status and manual sync

## Offline approach

The first scaffold stores pending offline actions in `SharedPreferences`. This is deliberately simple and small. Before production release, replace this storage with SQLite/Drift or another durable local database that supports attachments and large queues.
