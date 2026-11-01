# Local-first operation

**v0.7.0.0** starts and runs without a cloud account. [Download the Mac app](https://github.com/bn-19/local-ai-lab/releases/download/v0.7.0.0/Local-Lab-Mac-App.zip).

## Native Mac setup

Open `Local Lab.app`. First installation still needs internet access for verified runtimes/dependencies and separately approved model downloads. After those components are installed, CSV analysis and supported local model tasks require no cloud account or internet connection.

- A fresh installation offers **Install Runtime**, then starts and pairs automatically.
- An older installation offers **Update Local Runtime**. This verifies the bundled source and preserves `.local-lab` (including weights and private files), `.durable-actors` (saved tasks/queue), and installed dependencies. It retains previous source and unknown root files in a sibling `Runtime.source-backup-*` folder. That folder is not a complete duplicate of the private data.
- Updates run only with the runtime stopped and matching dependency graphs/runtime pins. Startup and updates share an exclusive local lock. Dependency changes require a separate installer. Build/hash/dependency failures leave the existing installation untouched; cancellation or errors during transfer roll back. A force kill or power loss during an update may require manual recovery from retained folders—do not delete them.
- Choose **Quit Local Lab** to stop owned services. Saved tasks and models remain local.

Build a preview from a committed checkout on Apple Silicon with Xcode/Swift installed:

```sh
./script/build_and_run.sh --build-only
```

The command prints the app's output directory and does not launch a browser or app. Model weights and credentials are not included. The app is ad-hoc signed, not notarized or OS sandboxed.

## Local development and optional Relay

With project dependencies and the complete project-owned Ollama runtime installed, start the existing launcher:

```sh
node installer/launcher.mjs start --no-open
```

It starts local Terse, Ollama and the companion without reading Relay credentials, provisioning identities or connecting to Relay. The native app explicitly selects this local mode. A normal task goes directly to the durable Device queue; all model work is still serialized there.

Relay is an explicit optional integration for developer/command-script use:

```sh
node installer/launcher.mjs start --no-open --relay
```

With no workspace, an interactive launcher asks before setup. `--relay-consent` explicitly approves creating/completing that workspace without a Terminal prompt. Direct service developers can opt in with `LOCAL_LAB_RELAY_ENABLED=1`; saved credentials alone never enable it. Optional send failures fall back to the same durable local job ID. Pending historical Relay jobs recover locally when Relay is disabled. Late deliveries cannot replace cancelled jobs. The local worker does not fabricate cloud receipts.

Supabase remains an optional read-only shared catalog when explicitly configured. An unconfigured installation uses the reviewed built-in catalog without a cloud request. Files, weights and saved tasks stay local.

## General CSV workflow

Upload a CSV, describe the question, confirm its measure/group/date/filter columns, review a compatible model and run the task. No special column names or candy dataset are required. Every normal CSV gets the same dashboard and follow-up controls. Chart statistics use calculated values and do not infer percentage units from a column name.

The old candy/retail adapter experiments remain available only with `?experimental=reporting`; they are specific reviewed recipes, not generic training for an arbitrary CSV. Normal dashboards do not automatically enable them. A generic CSV cannot be silently treated as retail training data.

## Verification

Real API acceptance ran on an M5/32 GB Mac with **no Relay credentials** in a fresh local workspace. Its runtime and all child services ran in a test-only OS network sandbox allowing loopback TCP/Unix sockets and denying external connections. A separate HTTPS probe confirmed the denial. Installed model weights were reused; this does not claim offline first installation.

Using the public [UCI Bike Sharing](https://archive.ics.uci.edu/dataset/275/bike+sharing+dataset) daily CSV (CC BY 4.0):

| Check | Observed result |
| --- | --- |
| Local-model dashboard | 731 rows, total rentals **3,292,679** |
| Working-day filter | 500 rows, total **2,292,410** |
| Model | Pinned Qwen3 4B; one run reported 3,555 ms model time, 55 output tokens |
| Cloud coordination | Disabled; job transport `local-durable`, no Relay request ID |
| Full service restart | Prior saved dashboard reopened with the same total |
| Historical Relay-waiting job | Recovered and completed locally after restart, preserving its durable ID |
| Device actor | Duplicate delivery, exclusive reservation, stale completion fencing, cancellation-before-delivery and alarms passed |
| Native source updater | Preservation, hash/dependency failures, cancellation and post-transfer rollback passed |

The native update preserved all three existing saved tasks and all nine model files with unchanged sizes/inodes; it paired without a cloud setup prompt and completed the same non-candy CSV workflow through the local queue. The updater CLI resource-path regression and rollback checks passed. Historical hackathon acceptance reports describe older versions and remain unchanged.
