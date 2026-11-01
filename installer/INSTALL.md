# Local Lab for Apple Silicon Macs

This is an unsigned command-script helper, not a signed or notarized macOS app.

For the native **Local Lab.app** ZIP and its source-only update flow, follow the [native Mac installation guide](../macos/README.md#install-or-update-v0700). The native app is ad-hoc signed and not notarized. The instructions below apply to the separate command-script installer.

Requires macOS 14 or later, an internet connection, and an Apple Silicon Mac running natively (not Rosetta). Git, Homebrew and administrator privileges are not required. The ZIP includes application source, not model weights or credentials.

1. Download the Mac installer ZIP from the GitHub release that provides it. Extract the entire ZIP together; do not move individual command files.
2. Double-click **Install.command**. It installs into `~/Applications/Local Lab`. If macOS asks whether to open a downloaded script, review its origin and use the normal Finder Open action; do not disable Gatekeeper globally.
3. Double-click **Start.command** in the installed folder. Keep its Terminal window open. Default startup runs locally without a cloud account or Agent Relay workspace; saved Relay credentials do not enable the integration.
4. Open the local UI address printed in Terminal, or explicitly accept its browser-opening prompt. Use your private `.local-lab/pairing-token` to connect this Mac. Model setup is a separate explicit action in the app.
5. Press Control-C in that Terminal or double-click **Stop.command**. Only the process groups created by this launcher are stopped; saved work and models remain.

The installer verifies pinned SHA-256 hashes for the bundled source, Node (if needed), and the complete official Ollama runtime. It installs locked npm dependencies and builds the web app. Network speed and dependency installation determine first-install time; model download and tuning time are additional and depend on your selection and Mac. No model is downloaded by the installer, and it does not automatically delete models.

For a different destination, run `/bin/bash /path/to/Install.command --dest "/absolute/new/folder" --no-launch`. Existing destinations, including empty folders and symlinks, are refused. Installation never starts services automatically. To update, choose a new destination; automatic migration and uninstallation are not provided.

Private service logs are in `.local-lab/launcher`, mode 0600. They may contain API credentials: do not publish them. Credentials, model files and user work stay in the installation's private local directories. For optional Relay coordination, run `/bin/bash ./Start.command --relay` from the installed folder, or set `LOCAL_LAB_RELAY_ENABLED=1`. Only this explicit opt-in enables cloud coordination; missing workspace/identity setup then asks for consent. Model inference runs locally. This helper does not install a background login service, modify your Dock, or require sudo.

If ports 4173, 7100 or 11435 are occupied, stop the conflicting app yourself or use its existing session. The launcher never kills a process to reclaim a port. If a launcher crashed and left a session record, inspect its original Terminal and processes before moving `.local-lab/launcher/session.json` aside; Stop does not trust stale PIDs. Do not delete a model folder while it is in use.

## Release operator

After merging and reviewing the final source commit, run `node installer/package.mjs FULL_COMMIT_SHA /absolute/new/output`. Publish the generated ZIP, release-manifest.json and SHA256SUMS together. The source archive comes only from tracked files in that exact commit, excluding local credentials and downloaded weights. Test a clean installation before attaching release assets. The packaging machine needs Git; end users do not.
