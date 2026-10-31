#!/bin/bash
set -euo pipefail
umask 077
script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
. "$script_dir/common.sh"
bundle=$(cd "$script_dir/../.." && pwd -P)
destination="$HOME/Applications/Local Lab"
while [ "$#" -gt 0 ]; do case "$1" in --dest) [ "$#" -ge 2 ] || fail 'Use --dest /absolute/path'; destination=$2; shift 2;; --no-launch) shift;; *) fail 'Usage: Install.command [--dest /absolute/new/path] [--no-launch]';; esac; done
require_tools uname sw_vers curl tar shasum plutil mktemp mkdir mv cp chmod awk basename dirname rm
check_platform
case "$destination" in /*) ;; *) fail 'Destination must be absolute';; esac
[ ! -e "$destination" ] && [ ! -L "$destination" ] || fail 'Destination already exists. Nothing overwritten. Use its Start.command, or choose a new empty location.'
leaf=$(basename "$destination"); case "$leaf" in ''|.|..) fail 'Invalid destination';; esac
mkdir -p -- "$(dirname "$destination")"
parent=$(cd -- "$(dirname "$destination")" && pwd -P)
destination="$parent/$leaf"
[ ! -e "$destination" ] && [ ! -L "$destination" ] || fail 'Destination already exists'
manifest="$bundle/release-manifest.json"; pins="$bundle/installer/runtime-pins.json"
[ -f "$manifest" ] && [ -f "$pins" ] && [ -f "$bundle/source.tar.gz" ] || fail 'Use the complete GitHub release ZIP, not an individual command file.'
[ "$(json_value "$manifest" schemaVersion)" = 1 ] || fail 'Unsupported installer manifest'
commit=$(json_value "$manifest" source.commit); [[ "$commit" =~ ^[a-f0-9]{40}$ ]] || fail 'Invalid source commit'
check_hash "$bundle/source.tar.gz" "$(json_value "$manifest" source.sha256)"
check_archive "$bundle/source.tar.gz"
check_layout "$bundle/source.tar.gz" source
stage=$(mktemp -d "$parent/.local-lab-install.XXXXXX")
cleanup(){ [ -z "${stage:-}" ] || rm -rf -- "$stage"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
app="$stage/$leaf"; mkdir -p "$app"
tar -xzf "$bundle/source.tar.gz" -C "$app" --strip-components 1
[ -f "$app/package-lock.json" ] && [ -f "$app/web/package-lock.json" ] && [ -f "$app/server.mjs" ] || fail 'Source archive missing required application files'
mkdir -p "$app/.local-lab/runtime" "$app/.local-lab/installer"
node_bin=''; npm_bin=''
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
 candidate=$(command -v node)
 if "$candidate" -e 'if(process.platform!=="darwin"||process.arch!=="arm64"||Number(process.versions.node.split(".")[0])<22)process.exit(1)' 2>/dev/null; then node_bin=$candidate; npm_bin=$(command -v npm); fi
fi
if [ -z "$node_bin" ]; then
 echo 'Downloading the pinned official Node runtime into this installation...'
 download "$(json_value "$pins" node.url)" "$stage/node.tar.gz" "$(json_value "$pins" node.sha256)"
 check_layout "$stage/node.tar.gz" node
 mkdir -p "$app/.local-lab/runtime/node"
 tar -xzf "$stage/node.tar.gz" -C "$app/.local-lab/runtime/node" --strip-components 1
 node_bin="$app/.local-lab/runtime/node/bin/node"; npm_bin="$app/.local-lab/runtime/node/bin/npm"
 [ -x "$node_bin" ] && [ -x "$npm_bin" ] || fail 'Node archive layout is unsupported'
fi
export PATH="$(dirname "$node_bin"):$PATH"
echo 'Downloading the pinned project-owned Ollama runtime (no model weights)...'
download "$(json_value "$pins" ollama.url)" "$stage/ollama.tgz" "$(json_value "$pins" ollama.sha256)"
check_layout "$stage/ollama.tgz" ollama
# Preserve every runtime library, MLX variant, notice and license from the verified archive.
tar -xzf "$stage/ollama.tgz" -C "$app/.local-lab/runtime"
[ -x "$app/.local-lab/runtime/ollama" ] && [ -x "$app/.local-lab/runtime/llama-server" ] || fail 'Ollama archive layout is unsupported'
cd "$app"
"$npm_bin" ci --no-audit --no-fund
"$npm_bin" --prefix web ci --no-audit --no-fund
VERCEL_GIT_COMMIT_SHA="$commit" "$npm_bin" --prefix web run build
cp "$bundle/Start.command" "$bundle/Stop.command" "$app/"
chmod 700 "$app/Start.command" "$app/Stop.command"
cp "$manifest" "$app/.local-lab/installer/release-manifest.json"
case "$node_bin" in "$app"/*) printf '%s\n' "$destination/${node_bin#"$app/"}" > "$app/.local-lab/installer/node-path";; *) printf '%s\n' "$node_bin" > "$app/.local-lab/installer/node-path";; esac
[ ! -e "$destination" ] && [ ! -L "$destination" ] || fail 'Destination appeared during installation; nothing overwritten'
# Target the parent: -n prevents replacing an existing same-name destination.
mv -n -- "$app" "$parent/"
[ ! -e "$app" ] || fail 'Destination appeared during installation; nothing overwritten'
echo "Installed Local Lab source $commit at: $destination"
echo 'No services, cloud workspace, model downloads or browser were started.'
echo 'Double-click Start.command there. Keep its Terminal open while using Local Lab.'
