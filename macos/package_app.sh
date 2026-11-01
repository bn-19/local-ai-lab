#!/usr/bin/env bash
set -euo pipefail
umask 077

commit=${1:-}
output=${2:-}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
case "$commit" in [a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]) ;; *) echo 'usage: package_app.sh EXACT_40_CHARACTER_COMMIT /absolute/new/output' >&2; exit 64;; esac
case "$output" in /*) ;; *) echo 'Output must be an absolute path' >&2; exit 64;; esac
[ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || { echo 'Packaging requires native Apple Silicon macOS' >&2; exit 1; }
for tool in git node swift tar ditto codesign shasum; do command -v "$tool" >/dev/null || { echo "Missing packaging tool: $tool" >&2; exit 1; }; done
git -C "$root" cat-file -e "$commit^{commit}"

mkdir -p "$output"
app="$output/Local Lab.app"
zip="$output/Local-Lab-Mac-App.zip"
manifest="$output/build-manifest.json"
checksums="$output/SHA256SUMS"
for path in "$app" "$zip" "$manifest" "$checksums"; do [ ! -e "$path" ] || { echo "Refusing existing output: $path" >&2; exit 1; }; done

stage=$(mktemp -d /private/tmp/local-lab-macos.XXXXXX)
cleanup(){ rm -rf -- "$stage"; }
trap cleanup EXIT INT TERM HUP
mkdir -p "$stage/repo"
git -C "$root" archive "$commit" macos | tar -x -C "$stage/repo"
git -C "$root" show "$commit:installer/package.mjs" > "$stage/package.mjs"
(cd "$root" && node "$stage/package.mjs" "$commit" "$stage/bootstrap-package")
bootstrap="$stage/repo/macos/Sources/LocalLabMac/Resources/Bootstrap"
mkdir -p "$bootstrap"
cp -R "$stage/bootstrap-package/Local-Lab-Mac-Installer/." "$bootstrap/"

swift build --package-path "$stage/repo/macos" --scratch-path "$stage/build" -c release --arch arm64
bin=$(swift build --package-path "$stage/repo/macos" --scratch-path "$stage/build" -c release --arch arm64 --show-bin-path)
staged_app="$stage/Local Lab.app"
contents="$staged_app/Contents"
mkdir -p "$contents/MacOS" "$contents/Helpers" "$contents/Resources"
cp "$bin/LocalLabMac" "$contents/MacOS/LocalLabMac"
cp "$bin/LocalLabProcessHelper" "$contents/Helpers/LocalLabProcessHelper"
chmod 700 "$contents/MacOS/LocalLabMac" "$contents/Helpers/LocalLabProcessHelper"
resource_bundle=$(find "$bin" -maxdepth 1 -type d -name 'LocalLabMac_LocalLabMac.bundle' -print -quit)
[ -n "$resource_bundle" ] || { echo 'Swift resource bundle not found' >&2; exit 1; }
cp -R "$resource_bundle" "$contents/Resources/"
version=$(git -C "$root" show "$commit:package.json" | node -e 'let s="";process.stdin.on("data",b=>s+=b).on("end",()=>process.stdout.write(JSON.parse(s).version))')
cat > "$contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>LocalLabMac</string>
<key>CFBundleIdentifier</key><string>ai.locallab.mac</string>
<key>CFBundleName</key><string>Local Lab</string>
<key>CFBundleDisplayName</key><string>Local Lab</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$version</string>
<key>CFBundleVersion</key><string>$version</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
/usr/bin/plutil -lint "$contents/Info.plist"
/usr/bin/codesign --force --deep --sign - "$staged_app"
/usr/bin/codesign --verify --deep --strict "$staged_app"
/usr/bin/ditto "$staged_app" "$app"
/usr/bin/codesign --verify --deep --strict "$app"
(cd "$stage" && /usr/bin/ditto -c -k --keepParent "Local Lab.app" "$zip")
cat > "$manifest" <<JSON
{
  "schemaVersion": 1,
  "sourceCommit": "$commit",
  "version": "$version",
  "platform": "darwin-arm64",
  "minimumMacOS": "14.0",
  "signing": "ad-hoc",
  "notarized": false,
  "modelsBundled": false
}
JSON
zip_sha=$(shasum -a 256 "$zip"); zip_sha=${zip_sha%% *}
manifest_sha=$(shasum -a 256 "$manifest"); manifest_sha=${manifest_sha%% *}
printf '%s  %s\n%s  %s\n' "$zip_sha" "$(basename "$zip")" "$manifest_sha" "$(basename "$manifest")" > "$checksums"
printf 'App: %s\nZIP: %s\nSource commit: %s\nSigning: ad-hoc (not notarized)\n' "$app" "$zip" "$commit"
