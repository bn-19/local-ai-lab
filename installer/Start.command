#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
node_path=$(cat .local-lab/installer/node-path) || { echo 'Installer metadata missing. Use the complete release installer.'; exit 1; }
[ -x "$node_path" ] || { echo 'Installed Node runtime is unavailable. See INSTALL.md.'; exit 1; }
export PATH="$(dirname "$node_path"):$PATH"
exec "$node_path" installer/launcher.mjs start "$@"
