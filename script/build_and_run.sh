#!/usr/bin/env bash
set -euo pipefail

mode=${1:-run}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$root"
[ -z "$(git status --porcelain)" ] || { echo 'Commit changes before packaging so the app and embedded source share one exact revision.' >&2; exit 1; }
commit=$(git rev-parse HEAD)
output=$(mktemp -d /private/tmp/local-lab-mac-run.XXXXXX)

"$root/macos/package_app.sh" "$commit" "$output"
app="$output/Local Lab.app"
binary="$app/Contents/MacOS/LocalLabMac"
if [ "$mode" = --build-only ] || [ "$mode" = build ]; then
  printf 'Build output retained at %s\n' "$output"
  exit 0
fi
if pgrep -x LocalLabMac >/dev/null 2>&1; then
  echo 'A Local Lab app is already running. Quit it normally before launching this build; no process was signalled.' >&2
  exit 1
fi
case "$mode" in
  run) /usr/bin/open -n "$app" ;;
  --debug|debug) lldb -- "$binary" ;;
  --logs|logs) /usr/bin/open -n "$app"; /usr/bin/log stream --info --style compact --predicate 'process == "LocalLabMac"' ;;
  --telemetry|telemetry) /usr/bin/open -n "$app"; /usr/bin/log stream --info --style compact --predicate 'subsystem == "ai.locallab.mac"' ;;
  --verify|verify) /usr/bin/open -n "$app"; sleep 2; pgrep -x LocalLabMac >/dev/null ;;
  *) echo "usage: $0 [run|--build-only|--debug|--logs|--telemetry|--verify]" >&2; exit 2 ;;
esac
printf 'Build output retained at %s\n' "$output"
