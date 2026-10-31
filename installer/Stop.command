#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
node_path=$(cat .local-lab/installer/node-path) || exit 1
exec "$node_path" installer/launcher.mjs stop
