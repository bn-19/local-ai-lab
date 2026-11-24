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

Focused checks cover cold selection without legacy/global Python, verified download cancellation/retry/cache reuse/corruption, rejected symlink/path/archive links and isolated environment settings.

On November 24, 2026, the actual packaged Mac app started from a fixture with no `.venv`, managed Python or training download cache. Its first setup downloaded the pinned 25,237,581-byte interpreter archive and was deliberately cancelled during the first wheel download. Partial bytes were removed, the runtime was not ready, and the Device returned idle. Retry reused that verified archive and downloaded the remaining 130,846,758 bytes of dependency wheels. Package installation and actual MLX/Metal startup passed; real training began and was cancelled successfully. The completed runtime remained reusable, both active-process markers were cleared and no tool was promoted from the cancelled run.

The executable, prefix/base prefix and every import path reported the app-owned standalone Python 3.12.16. No `.venv` existed. Injected Python-path code and a redirected pip target were not used. A separate control confirmed that isolated pip alone would read the injected configuration, while the `/dev/null` guard disabled it. The exact app-owned Python processing wrapper also failed an external HTTPS probe as expected.

Node/Ollama and the separately verified MLX base model were reused public runtime/cache fixtures, not freshly downloaded in this test. This is a cold **Python/dependency setup** test on the development M5/32 GB Mac, not a second physical Mac, a clean OS installation, or a cold multi-GB model download. Full offline regression/restart results are recorded with the final milestone evidence.

After setup, the app was quit and reopened with external networking denied. A full training/evaluation regression completed offline using the installed managed runtime and zero new setup downloads: baseline 7/12, candidate 11/12, all four critical checks passed, adapter selected. The sequence took **319.967 seconds** on this Mac with the portable macOS 14-compatible wheels. This is a repeat check of the existing synthetic final set, not new independent accuracy evidence, and is separate from the earlier faster development-environment timing.

The app was quit/reopened again. Four actual-model reports then passed against independent synthetic arithmetic: revenue 50, mean invoice value 50/3, 3 distinct merchandise invoices and missing-cost profit clarification. Original tool, adapter and managed-runtime identities were unchanged. The standalone interpreter links only standard macOS libraries/frameworks, not a global Python framework. No `.venv`, user-Python poison marker or redirected pip target existed.

A separate installer-helper test copied only the already verified dependency cache into a second empty runtime. It cancelled an actual pip subprocess, confirmed the incomplete runtime was not ready and its process marker cleared, then rebuilt successfully offline with zero downloads and passed MLX startup. This warm-cache retry test is distinct from the first cold download test. Independent review's cancellation and pip-isolation findings were fixed before the native validation.
