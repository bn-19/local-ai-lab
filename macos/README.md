# Standalone Mac app

This SwiftPM package builds the native Apple Silicon Local Lab host. Its SwiftUI setup window installs the exact packaged app source, locked npm dependencies, pinned Node runtime when needed, and the complete pinned Ollama runtime under `~/Library/Application Support/Local Lab/Runtime`. Installation never downloads model weights. The user separately approves model downloads in the embedded local interface.

The app asks before creating the user's Agent Relay workspace. It then starts the existing launcher without a Terminal window. That launcher remains the owner of the Terse Device queue, Ollama, and the local backend. The native process helper places bootstrap and launcher leaders in app-owned process groups; cancellation and shutdown are bounded and fail closed. Private logs and any diagnostic-only cleanup record are mode 0600 in `~/Library/Application Support/Local Lab/Host Logs`.

The WKWebView navigates only to `http://127.0.0.1:4173/app` and its subpaths. A document-start listener waits for the exact packaged frontend's ready event before submitting the private token to the existing pairing form. The token is never placed in a URL, clipboard, native log, or persistent web store. File uploads use a native open panel. There is no JavaScript-to-native command bridge.

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
