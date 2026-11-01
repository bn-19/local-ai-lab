# Standalone Mac app

This SwiftPM package builds the native Apple Silicon Local Lab host. Its SwiftUI setup window installs the exact packaged app source, locked npm dependencies, pinned Node runtime when needed, and the complete pinned Ollama runtime under `~/Library/Application Support/Local Lab/Runtime`. Installation never downloads model weights. The user separately approves model downloads in the embedded local interface.

The app asks before creating the user's Agent Relay workspace. It then starts the existing launcher without a Terminal window. That launcher remains the owner of the Terse Device queue, Ollama, and the local backend. The native process helper places bootstrap and launcher leaders in app-owned process groups; cancellation and shutdown are bounded and fail closed. Private logs and any diagnostic-only cleanup record are mode 0600 in `~/Library/Application Support/Local Lab/Host Logs`.

The WKWebView navigates only to `http://127.0.0.1:4173/app` and its subpaths. A document-start listener waits for the exact packaged frontend's ready event before submitting the private token to the existing pairing form. The token is never placed in a URL, clipboard, native log, or persistent web store. File uploads use a native open panel. There is no JavaScript-to-native command bridge.

[Native CSV, model-download and restart acceptance evidence](../docs/MAC_APP_ACCEPTANCE.md).

## Try the native preview

Use an Apple Silicon Mac running macOS 14 or later. Download the **Local-Lab-Mac-App.zip** supplied with the native preview/release, extract it, and move **Local Lab.app** to Applications. This is a separate artifact from the stable command-script installer. It is currently ad-hoc signed and **not notarized**; a downloaded copy may be blocked by Gatekeeper. Review its source and origin before using macOS's per-app Open/Open Anyway action. Do not disable Gatekeeper or remove quarantine globally. A second physical Mac and the downloaded/quarantined installation flow have not been tested.

1. Open **Local Lab.app** and select **Install Runtime**. Initial setup downloads verified runtime components and locked dependencies; it does not download a model.
2. Select **Create Workspace and Start** to consent to your own Relay workspace and agent identities. A temporary service error can be retried. The app opens and pairs its own local workspace automatically.
3. Follow [the CSV upload, prompt and field selections](../README.md#2-upload-the-real-csv-and-run-an-analysis). Approve the recommended model's separate download, wait for **Ready**, then select **Run task**.
4. Check the dashboard's **85 entries / 50.32%**, chocolate filter **37 / 60.92%**, and non-chocolate filter **48 / 42.14%**. These are preference scores, not sales.
5. Reopen the result from **Saved tasks**, then use **Quit Local Lab**. The app stops its own services and retains local files, tasks and models for the next launch. No Terminal window or hosted Vercel page is required.

The app reuses an existing runtime under `~/Library/Application Support/Local Lab/Runtime`; replacing the `.app` does not automatically update that runtime. The preview has no automatic runtime upgrade/migration. Preserve existing work and seek a reviewed migration before changing that folder. Do not run the command-script installation and native app simultaneously: they use the same local ports.

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
