#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
exec /bin/bash installer/macos/install.sh "$@"
