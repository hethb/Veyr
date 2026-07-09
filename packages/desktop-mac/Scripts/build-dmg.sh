#!/usr/bin/env bash
# Builds the distributable Veyr DMG with the standard drag-to-install window
# (app on the left, Applications alias on the right, arrow background).
#
# Prerequisites:
#   - Veyr.app already packaged at the repo package root (Scripts/package_app.sh release)
#   - create-dmg installed (brew install create-dmg)
#
# Usage: ./Scripts/build-dmg.sh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
source "$ROOT/version.env"

APP_NAME="Veyr"
APP_PATH="$ROOT/${APP_NAME}.app"
DMG_PATH="$ROOT/${APP_NAME}-${MARKETING_VERSION}.dmg"
VOLUME_NAME="${APP_NAME} ${MARKETING_VERSION}"
VOLICON="$ROOT/Icon.icns"

if ! command -v create-dmg >/dev/null 2>&1; then
  echo "ERROR: create-dmg not found. Install it with: brew install create-dmg" >&2
  exit 1
fi
if [[ ! -d "$APP_PATH" ]]; then
  echo "ERROR: $APP_PATH not found. Build it first: ./Scripts/package_app.sh release" >&2
  exit 1
fi

APP_VERSION=$(plutil -extract CFBundleShortVersionString raw "$APP_PATH/Contents/Info.plist")
if [[ "$APP_VERSION" != "$MARKETING_VERSION" ]]; then
  echo "ERROR: ${APP_NAME}.app is version $APP_VERSION but version.env says $MARKETING_VERSION." >&2
  echo "       Rebuild the app first: ./Scripts/package_app.sh release" >&2
  exit 1
fi

# First-launch notes shipped alongside the app (unsigned build needs xattr -cr).
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT
README_NAME="READ ME FIRST.txt"
cat > "$STAGING/$README_NAME" <<EOF
Veyr ${MARKETING_VERSION} — LLM spend tracking in your menu bar
=================================================

Install: drag Veyr.app into the Applications folder.

IMPORTANT — first launch on this unsigned build:
macOS Gatekeeper will block the app because it isn't notarized yet.
After copying to Applications, run this once in Terminal:

    xattr -cr /Applications/Veyr.app

Then open Veyr normally. (Signed + notarized builds are coming.)

Privacy: Veyr reads your local Claude Code and Codex log files.
No data leaves your machine — no server, no analytics.

Built on CodexBar by Peter Steinberger (MIT). https://github.com/steipete/CodexBar
EOF

rm -f "$DMG_PATH"

VOLICON_ARGS=()
if [[ -f "$VOLICON" ]]; then
  VOLICON_ARGS=(--volicon "$VOLICON")
else
  echo "WARN: $VOLICON not found — building without a volume icon." >&2
fi

create-dmg \
  --volname "$VOLUME_NAME" \
  "${VOLICON_ARGS[@]}" \
  --window-pos 200 120 \
  --window-size 600 440 \
  --icon-size 100 \
  --icon "${APP_NAME}.app" 150 205 \
  --hide-extension "${APP_NAME}.app" \
  --app-drop-link 450 205 \
  --add-file "$README_NAME" "$STAGING/$README_NAME" 300 60 \
  --no-internet-enable \
  "$DMG_PATH" \
  "$APP_PATH"

echo "DMG created: $DMG_PATH"
