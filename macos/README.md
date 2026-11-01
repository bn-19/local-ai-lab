# Standalone Mac app

This SwiftPM package builds the native Apple Silicon Local Lab host. Its SwiftUI setup window installs the exact packaged app source, locked npm dependencies, pinned Node runtime when needed, and the complete pinned Ollama runtime under `~/Library/Application Support/Local Lab/Runtime`. Installation never downloads model weights. The user separately approves model downloads in the embedded local interface.

The app starts its existing launcher in local-only mode without a Terminal window or cloud account. Relay is an optional command-line integration; existing credentials do not enable it. That launcher remains the owner of the Terse Device queue, Ollama, and the local backend. The native process helper places bootstrap and launcher leaders in app-owned process groups; cancellation and shutdown are bounded and fail closed. Private logs and any diagnostic-only cleanup record are mode 0600 in `~/Library/Application Support/Local Lab/Host Logs`.

The WKWebView navigates only to `http://127.0.0.1:4173/app` and its subpaths. A document-start listener waits for the exact packaged frontend's ready event before submitting the private token to the existing pairing form. The token is never placed in a URL, clipboard, native log, or persistent web store. File uploads use a native open panel. There is no JavaScript-to-native command bridge.

[Native CSV, model-download and restart acceptance evidence](../docs/MAC_APP_ACCEPTANCE.md).

## Install or update v0.7.0.0

[Download Local-Lab-Mac-App.zip](https://github.com/bn-19/local-ai-lab/releases/download/v0.7.0.0/Local-Lab-Mac-App.zip), extract it and move **Local Lab.app** to Applications. Requires Apple Silicon and macOS 14+. It is ad-hoc signed and **not notarized**; review its origin before using macOS's per-app approval flow. Do not disable Gatekeeper globally. The quarantined-download flow and a second physical Mac remain untested.

1. On first launch select **Install Runtime**. This downloads verified runtime components and locked dependencies, but no model weights. No cloud account is required.
2. For an existing runtime, select **Update Local Runtime**. The source-only updater preserves `.local-lab`, `.durable-actors` and installed dependencies, retains previous source/unknown root files, and rolls back on errors or cancellation. It refuses dependency/runtime changes and concurrent startup. Version-only metadata changes are supported.
3. The app starts and pairs automatically. Follow [the CSV walkthrough](../README.md#2-upload-any-supported-csv), approve the model's separate download and select **Run task**.
4. Reopen a result from **Saved tasks**, then use **Quit Local Lab**. No Terminal or hosted page is required.

[Local-first setup, optional Relay, measured results and recovery boundaries](../docs/LOCAL_FIRST.md). Source backups are not complete copies of private data; mutable directories remain in the active runtime. Do not delete retained folders after a force kill/power loss during an update. A stale transition lock is not proof its owner is dead: inspect the original app/session or restart the Mac, then recover manually. No updater steals a lock or kills a process by saved PID. Do not run another installation on the same local ports.

## Build and test

```sh
swift build --package-path macos --product LocalLabProcessHelper
swift build --package-path macos --product LocalLabHeadlessChecks
"$(swift build --package-path macos --show-bin-path)/LocalLabHeadlessChecks" "$(swift build --package-path macos --show-bin-path)/LocalLabProcessHelper"
npm run check
npm test
npm --prefix web test
```

Package a clean exact commit into a new `/private/tmp` output directory:

```sh
macos/package_app.sh "$(git rev-parse HEAD)" /private/tmp/local-lab-mac-candidate
```

The output includes `Local Lab.app`, a downloadable ZIP, a build manifest, and checksums. The current package is ad-hoc signed for local testing and is not Developer ID signed or notarized. Gatekeeper distribution requires a Developer ID identity, hardened-runtime signing, notarization, and stapling in a later release step.

`script/build_and_run.sh` is the project Run action. Its `--build-only` mode packages without launching a GUI, which is appropriate on a locked Mac. Do not use the existing browser demo services for final acceptance: verify the exact packaged app's own runtime after unlocking the Mac.
