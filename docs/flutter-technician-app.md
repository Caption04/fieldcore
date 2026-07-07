# TASK16 Flutter technician app scaffold

TASK16 adds a separated Flutter scaffold under `apps/fieldcore_technician`. The backend remains the system of record. The app consumes the existing mobile/offline API contract from `docs/mobile-api-contract.md`.

## Directory

```text
apps/fieldcore_technician/
  pubspec.yaml
  lib/
  test/
```

Generated Flutter output is intentionally excluded from Git and future zip uploads:

- `apps/*/build/`
- `apps/*/.dart_tool/`
- `apps/*/android/.gradle/`
- `apps/*/ios/Pods/`

## Bootstrap

From the app directory:

```bash
cd apps/fieldcore_technician
../../scripts/bootstrap_flutter_technician_platforms.sh
flutter pub get
flutter analyze
flutter test
```

Run against local backend:

```bash
flutter run --dart-define=FIELDCORE_API_BASE_URL=http://10.0.2.2:3000
```

For a physical Android device, replace `10.0.2.2` with the computer LAN IP that can reach the Node backend.

## Current app capabilities

- Login with technician credentials.
- Register the current install/device with the backend.
- Pull assigned jobs through `/api/worker/sync/v2/pull`.
- Queue offline actions locally.
- Push queued actions through `/api/worker/sync/v2/push`.
- Queue start, pause, resume, complete, customer unavailable, checklist, proof photo metadata, signature metadata, and parts-used actions.
- Show per-action sync results and leave failed/conflict actions in the queue.

## Production-hardening notes

This scaffold uses `SharedPreferences` for a small offline queue to keep the repo light and easy to review. Before production release, replace it with durable local storage such as SQLite/Drift and add attachment handling for proof photos and signature images.

Recommended next steps:

1. Add secure credential/session storage.
2. Replace local placeholder proof/signature URLs with actual file upload and durable attachment queue.
3. Add camera/gallery capture.
4. Add GPS capture permissions and background-safe checkpoints.
5. Add push notifications and technician ETA flows.
6. Add release signing for Android/iOS.
