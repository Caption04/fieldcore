#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../apps/fieldcore_technician" && pwd)"
BACKUP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$BACKUP_DIR"
}
trap cleanup EXIT

cp -R "$APP_DIR/lib" "$BACKUP_DIR/lib"
cp "$APP_DIR/pubspec.yaml" "$BACKUP_DIR/pubspec.yaml"
cp "$APP_DIR/README.md" "$BACKUP_DIR/README.md"
cp -R "$APP_DIR/test" "$BACKUP_DIR/test"

cd "$APP_DIR"
flutter create --project-name fieldcore_technician --org com.fieldcore --platforms=android,ios .

rm -rf "$APP_DIR/lib" "$APP_DIR/test"
cp -R "$BACKUP_DIR/lib" "$APP_DIR/lib"
cp -R "$BACKUP_DIR/test" "$APP_DIR/test"
cp "$BACKUP_DIR/pubspec.yaml" "$APP_DIR/pubspec.yaml"
cp "$BACKUP_DIR/README.md" "$APP_DIR/README.md"

flutter pub get

echo "Flutter platforms bootstrapped for apps/fieldcore_technician."
