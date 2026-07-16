#!/usr/bin/env bash
# Manual v1 step: after a GitHub Release is published (not just drafted) and
# the CLI is on npm at the matching version, fetch both artifacts, compute
# their sha256s, and rewrite the tap repo's Formula/veyr.rb + Casks/veyr.rb
# in place. Review the diff and push yourself — this script never commits
# or pushes on its own.
#
# Not automated in CI yet (see .github/workflows/release.yml's header
# comment) because there's no way to dry-run a push to a tap repo that,
# as of this writing, doesn't exist yet.
#
# Usage: scripts/bump-homebrew-tap.sh <version> <path-to-homebrew-veyr-checkout>
# Example: scripts/bump-homebrew-tap.sh 0.2.3 ../homebrew-veyr
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <version> <path-to-homebrew-veyr-checkout>" >&2
  echo "Example: $0 0.2.3 ../homebrew-veyr" >&2
  exit 1
fi

VERSION="$1"
TAP_DIR="$2"

if [[ ! -d "$TAP_DIR/Formula" || ! -d "$TAP_DIR/Casks" ]]; then
  echo "ERROR: $TAP_DIR doesn't look like a homebrew-veyr checkout (missing Formula/ or Casks/)." >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "==> Fetching getcanopy@${VERSION} from npm..."
NPM_TARBALL_URL=$(npm view "getcanopy@${VERSION}" dist.tarball 2>/dev/null) || {
  echo "ERROR: getcanopy@${VERSION} not found on npm." >&2
  echo "       Publish it first — either 'npm publish' from packages/cli," >&2
  echo "       or add the NPM_TOKEN repo secret so the release workflow does it." >&2
  exit 1
}
curl -fsSL "$NPM_TARBALL_URL" -o "$TMP/getcanopy.tgz"
NPM_SHA256=$(shasum -a 256 "$TMP/getcanopy.tgz" | awk '{print $1}')
echo "    sha256: $NPM_SHA256"

echo "==> Fetching Veyr-${VERSION}.dmg from the GitHub release..."
DMG_URL="https://github.com/hethb/Veyr/releases/download/v${VERSION}/Veyr-${VERSION}.dmg"
if ! curl -fsSL "$DMG_URL" -o "$TMP/Veyr.dmg"; then
  echo "ERROR: couldn't fetch $DMG_URL" >&2
  echo "       Is the release published (not just left as a draft)?" >&2
  exit 1
fi
DMG_SHA256=$(shasum -a 256 "$TMP/Veyr.dmg" | awk '{print $1}')
echo "    sha256: $DMG_SHA256"

echo "==> Updating $TAP_DIR/Formula/veyr.rb"
sed -i '' \
  -e "s|url \"https://registry.npmjs.org/getcanopy/-/getcanopy-.*\.tgz\"|url \"https://registry.npmjs.org/getcanopy/-/getcanopy-${VERSION}.tgz\"|" \
  -e "s|sha256 \".*\"|sha256 \"${NPM_SHA256}\"|" \
  "$TAP_DIR/Formula/veyr.rb"

echo "==> Updating $TAP_DIR/Casks/veyr.rb"
sed -i '' \
  -e "s|version \".*\"|version \"${VERSION}\"|" \
  -e "s|sha256 \".*\"|sha256 \"${DMG_SHA256}\"|" \
  "$TAP_DIR/Casks/veyr.rb"

echo
echo "Done. Review the diff, then commit and push:"
echo "  cd $TAP_DIR && git diff"
echo "  cd $TAP_DIR && git commit -am 'veyr ${VERSION}' && git push"
