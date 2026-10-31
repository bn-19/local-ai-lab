#!/bin/bash
set -euo pipefail
fail(){ echo "Local Lab: $*" >&2; exit 1; }
require_tools(){ local tool; for tool in "$@"; do command -v "$tool" >/dev/null 2>&1 || fail "Missing required macOS tool: $tool"; done; }
check_platform(){ [ "$(uname -s)" = Darwin ] || fail 'Requires macOS 14 or later.'; [ "$(uname -m)" = arm64 ] || fail 'Requires Apple Silicon in a native (not Rosetta) Terminal.'; local version; version=$(sw_vers -productVersion); [ "${version%%.*}" -ge 14 ] || fail 'Requires macOS 14 or later.'; }
json_value(){ /usr/bin/plutil -extract "$2" raw -o - "$1"; }
check_hash(){ local actual; [[ "$2" =~ ^[a-f0-9]{64}$ ]] || fail 'Invalid checksum metadata'; actual=$(shasum -a 256 "$1"); actual=${actual%% *}; [ "$actual" = "$2" ] || fail "Checksum mismatch: $(basename "$1"). Nothing installed."; }
check_archive(){ local entry listing; listing=$(tar -tzf "$1") || fail 'Cannot inspect archive'; [ -n "$listing" ] || fail 'Empty archive'; while IFS= read -r entry; do case "$entry" in /*|..|../*|*/../*|*/..) fail 'Unsafe archive path';; esac; done <<< "$listing"; }
download(){ case "$1" in https://nodejs.org/dist/v22.23.4/node-v22.23.4-darwin-arm64.tar.gz|https://github.com/ollama/ollama/releases/download/v0.40.13/ollama-darwin.tgz) ;; *) fail 'Unapproved download URL';; esac; curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --max-time 600 --output "$2" "$1"; check_hash "$2" "$3"; check_archive "$2"; }
# Version-specific layouts: validate before extraction; reject special files and
# every link except the official runtime's known in-tree relative links.
check_layout(){
 local archive=$1 kind=$2 entry listing
 listing=$(tar -tzf "$archive") || fail 'Cannot inspect archive layout'
 while IFS= read -r entry; do
  case "$kind:$entry" in
   source:local-ai-lab/|source:local-ai-lab/*) ;;
   node:node-v22.23.4-darwin-arm64/|node:node-v22.23.4-darwin-arm64/*) ;;
   ollama:ollama|ollama:llama-server|ollama:llama-quantize|ollama:lib*.dylib|ollama:lib*.so|ollama:*_LICENSE|ollama:*_NOTICE|ollama:mlx_metal_v3/|ollama:mlx_metal_v3/*|ollama:mlx_metal_v4/|ollama:mlx_metal_v4/*) ;;
   *) fail "Unexpected $kind archive root";;
  esac
 done <<< "$listing"
 tar -tvzf "$archive" | awk -v kind="$kind" '
  substr($0,1,1)=="-" || substr($0,1,1)=="d" {next}
  substr($0,1,1)=="l" {
   name=$(NF-2); target=$NF;
   if ($(NF-1)!="->") {bad=1;next}
   if (kind=="node") {
    if(name=="node-v22.23.4-darwin-arm64/bin/npm" && target=="../lib/node_modules/npm/bin/npm-cli.js") next;
    if(name=="node-v22.23.4-darwin-arm64/bin/npx" && target=="../lib/node_modules/npm/bin/npx-cli.js") next;
    if(name=="node-v22.23.4-darwin-arm64/bin/corepack" && target=="../lib/node_modules/corepack/dist/corepack.js") next;
   }
   if(kind=="ollama" && name ~ /^lib[A-Za-z0-9.-]+\.dylib$/ && target ~ /^lib[A-Za-z0-9.-]+\.dylib$/) next;
  }
  {bad=1}
  END {exit bad}
 ' || fail 'Unsafe archive entry or link target'
}
