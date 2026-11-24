# App-owned learning setup

The sales-reporting learning workflow downloads its own Python and verified dependency wheels. No system Python, Homebrew Python, administrator access or cloud account is required for that workflow. Ordinary Node/Ollama app installation is unchanged.

## What setup installs

- Astral Python Build Standalone CPython **3.12.16**, release **20261110**, `aarch64-apple-darwin-install_only_stripped`.
- Interpreter archive: **25,237,581 bytes**, SHA-256 `2f11b8aa3726bdbd87dd9eb76568412faddf4f47e26913fa45d6a2e424972acd`. The extracted executable is checked separately against SHA-256 `b268d9eee13e33cbc544f2d39c2c1c1909606415e668a32952ef067bc2dbcdfd`.
- **46 exact dependency wheels**, **130,846,758 bytes**, from official `files.pythonhosted.org` URLs. Every wheel is pinned by version, filename, size and SHA-256. Total first learning-runtime download is **156,084,339 bytes** (about 156 MB), separate from model weights.
- Reviewed top-level packages remain MLX 0.32.4, MLX-LM 0.32.2 and Transformers 5.22.1. [Dependency provenance](TRAINING_WHEELS_PROVENANCE.md) records resolution and independent byte/hash checks. The macOS 14 wheel tags preserve the intended platform floor; actual execution must still be measured on the target Mac.

The Python archive hash and size came from the [official release metadata](https://github.com/astral-sh/python-build-standalone/releases/tag/20261110). The project documents [portable install-only distributions](https://github.com/astral-sh/python-build-standalone/blob/main/docs/distributions.rst) and [their use](https://github.com/astral-sh/python-build-standalone/blob/main/docs/running.rst). Licenses and notices shipped in the archive/wheels are retained.

## Ownership and isolation

All setup is inside `.local-lab`: verified downloads under `downloads/training/<identity>`, Python and packages under `training-runtime/<identity>/python`. The identity binds both interpreter and complete wheel lock. Setup never looks up global Python. Existing legacy development tools may explicitly reuse a compatible `.venv`; new learned tools bind their managed runtime identity and cannot take that fallback.

Before any package install, the extracted Python must report the pinned version, Apple Silicon, the expected app-owned prefix/base prefix, isolated mode and import paths entirely inside that Python. Python is invoked with `-I`; Python/Conda/dynamic-library overrides are removed from child environments. All training phase children retain `-I`.

Pip installs only already-downloaded verified wheels, with `--no-index`, `--no-deps`, `--require-hashes`, an explicit app-owned prefix and no pip cache/version checks. `PIP_CONFIG_FILE=/dev/null` disables even global pip configuration, which `--isolated` alone would still read; this behavior was checked against the bundled pip source and [official pip configuration documentation](https://pip.pypa.io/en/stable/topics/configuration/).

The runtime is ready only after exact package-version checks, `pip check`, and a real MLX/Metal startup operation pass. Its receipt includes the actual executable, prefix, import paths, versions, verified download bytes and cache reuse. New saved tools bind this runtime identity in addition to their base/adapter/task harness.

Model training and saved-tool inference run with external outbound networking denied using macOS `sandbox-exec`, while setup/model downloads can use the internet. This is a network rule for the Python processing descendants, not an OS App Sandbox or general file-access sandbox. No cloud-model fallback is implemented.

## Cancellation, failure and retry

The existing Device actor owns setup/training as one serial job. A cancelled download removes only its unique partial file; completed hash-verified downloads survive for retry. A partial Python/package installation is never marked ready. Retry recreates only a directory bearing the exact app-owned identity marker. Unmarked, symlinked, corrupt completed or unknown directories/files are preserved and rejected rather than overwritten or executed.

Task-owned setup/training subprocesses have bounded timeouts and process groups. Cancellation releases the Device only after cleanup is confirmed; otherwise the marker/reservation stays blocked. Source updates already preserve `.local-lab`, including the managed runtime and download cache. No global install or existing user environment is modified.

## Validation status

Current focused checks cover cold selection without legacy/global Python, verified download cancellation/retry/cache reuse/corruption, rejected symlink/path/archive links and isolated environment settings. Fresh native app setup, actual MLX startup, cancellation/retry and offline model acceptance are recorded separately after the cold-run milestone completes. A warm verified model cache must not be described as a fresh model download.
