# Training wheel lock provenance

`installer/training-wheels.lock.json` is the wheel-only dependency closure for the optional Local Lab training runtime. It is intentionally separate from the normal application runtime and does not include a Python interpreter.

## Target and inputs

- Resolved on 2026-11-24 with CPython 3.12.6 and pip 24.2.
- Target: CPython 3.12, Apple Silicon, macOS 14 or newer (`macosx_14_0_arm64`).
- Direct requirements:
  - `mlx==0.32.4`
  - `mlx-lm[train]==0.32.2`
  - `transformers==5.22.1`
- Resolver flags force a cold dependency decision: `--ignore-installed --only-binary=:all:`.
- The explicit macOS 14 target prevents a newer development Mac from selecting the larger `macosx_26_0_arm64` MLX wheels. The macOS 14 wheels remain compatible with newer macOS versions.

No required package was unavailable for this target. The resolved closure is 46 wheels totaling **130,846,758 bytes** (about 124.79 MiB). It includes `datasets`, which is required by the `train` extra, but no unrelated vision stack such as PyTorch, Pillow, or OpenCV.

## Resolution commands

The existing development virtual environment was used only as a pip front end. Neither command installed or changed a package:

```sh
PIP_CACHE_DIR=/private/tmp/local-lab-wheel-lock-5f756f31/cache \
PIP_DISABLE_PIP_VERSION_CHECK=1 \
./.venv/bin/python \
  -m pip install \
  --dry-run \
  --ignore-installed \
  --only-binary=:all: \
  --platform macosx_14_0_arm64 \
  --python-version 3.12 \
  --implementation cp \
  --abi cp312 \
  --report /private/tmp/local-lab-wheel-lock-5f756f31/pip-report-macos14.json \
  'mlx==0.32.4' \
  'mlx-lm[train]==0.32.2' \
  'transformers==5.22.1'
```

```sh
PIP_CACHE_DIR=/private/tmp/local-lab-wheel-lock-5f756f31/cache \
PIP_DISABLE_PIP_VERSION_CHECK=1 \
./.venv/bin/python \
  -m pip download \
  --only-binary=:all: \
  --platform macosx_14_0_arm64 \
  --python-version 3.12 \
  --implementation cp \
  --abi cp312 \
  --dest /private/tmp/local-lab-wheel-lock-5f756f31/wheels-macos14 \
  'mlx==0.32.4' \
  'mlx-lm[train]==0.32.2' \
  'transformers==5.22.1'
```

## Metadata and byte verification

For every entry in pip's report:

1. The exact release record was fetched from `https://pypi.org/pypi/{project}/{version}/json`.
2. The report filename was matched to exactly one `urls` entry whose `packagetype` is `bdist_wheel`.
3. The JSON URL was required to equal pip's URL and start with `https://files.pythonhosted.org/`.
4. The release-record SHA-256, pip-report SHA-256, and SHA-256 of the downloaded bytes were required to be identical.
5. The release-record size was required to equal the downloaded file size.
6. The filenames in the pip report and download directory were required to be identical sets.

The lock then passed these structural checks:

```sh
jq '{
  schemaVersion,
  python,
  platform,
  requirements,
  packageCount: (.packages | length),
  totalBytes: ([.packages[].sizeBytes] | add),
  uniqueNames: ([.packages[].name] | unique | length),
  allPythonHosted: ([.packages[].url | startswith("https://files.pythonhosted.org/")] | all),
  allWheels: ([.packages[].filename | endswith(".whl")] | all)
}' installer/training-wheels.lock.json
```

Expected summary: schema 1, Python 3.12, `darwin-arm64`, 46 packages, 46 unique names, 130,846,758 bytes, all official Python-hosted URLs, and all wheel filenames.

Finally, a temporary requirements file was generated with one exact `name==version --hash=sha256:...` line per lock entry (retaining the `train` extra on `mlx-lm`). The complete closure passed an offline, hash-enforcing pip resolution:

```sh
PIP_DISABLE_PIP_VERSION_CHECK=1 \
./.venv/bin/python \
  -m pip install \
  --dry-run \
  --ignore-installed \
  --no-index \
  --find-links /private/tmp/local-lab-wheel-lock-5f756f31/wheels-macos14 \
  --only-binary=:all: \
  --require-hashes \
  -r /private/tmp/local-lab-wheel-lock-5f756f31/requirements-hashed.txt
```

This check reported the same 46-package `Would install` set and did not access an index or install anything.

## Scope

This lock proves that the pinned dependency closure is available as wheels for the stated target and that the recorded artifacts matched PyPI on the resolution date. It does not bundle Python, install the runtime, exercise MLX, download a model, or prove a training run. The bootstrap must still reject the wrong OS, architecture, or Python version and must verify every SHA-256 before installation.
