# Reusable local tools — development slice

This branch adds one genuine learning workflow: **whole-file sales reporting**. The public v0.7 download does not include it yet. Other tasks (email, image generation, general model training) remain outside this verified slice.

## Use it

1. Open the Mac app and choose a sales CSV under **Your data**.
2. Open **Teach a reusable local tool**. Describe the sales-reporting job and map order reference, product code, quantity and price columns.
3. Choose **Review learning setup**. The app checks the task, Apple Silicon, system/available memory, disk and the local training runtime. It selects one reviewed trainable Qwen3-4B MLX recipe, not a universal best model.
4. Approve **Download setup, learn, compare and save tool** (or cache reuse). Setup downloads use the internet; learning uses authored synthetic questions locally. Uploaded CSV rows are not automatically training examples.
5. The Device queue owns one reservation through setup, baseline, actual QLoRA training, candidate evaluation and artifact verification. No nested heavy job is queued while holding that reservation.
6. Inspect the held-out comparison. Promotion requires strict aggregate improvement, nonzero trained LoRA-B weights, every critical case passing, and no baseline-passing critical regression. Ties or failed gates retain the unchanged base model.
7. Ask the saved tool a new question, or attach another CSV with the same mapped columns. Review its interpretation and explicitly confirm the whole-file metric, refund handling and included rows before a separate queued calculation runs. Saved tasks reopen the same tool. Neither the latest adapter nor a cloud service is an execution fallback.

This recipe covers revenue, average order value, unique order count, product rankings and missing-cost clarification for profit/margin. It includes refunds unless the question explicitly excludes negative quantities. Merchandise scope excludes exactly POST/ADJUST. No dates, countries or arbitrary filters; recognized unsupported filter requests are rejected before calculation. The language checks are bounded and not a general intent verifier. Always inspect the returned plan.

## Identity and recovery

The tool binds the exact public base repository/revision and all nine load-relevant file hashes; adapter weights and adapter configuration; prompt, column mapping, calculation policy, recipe version and runtime versions. The base is checked against pinned upstream Hub SHA-256/Git-blob identities, not an unverified local revision label. Each invocation verifies the binding before and after inference and compares the inference worker's loaded adapter checksum. Missing or modified artifacts fail explicitly; they never silently run the baseline.

The reviewed base is `mlx-community/Qwen3-4B-4bit` revision `4dcb3d101c2a062e5c1d4bb173588c54ea6c4d25`, Apache-2.0. [Pinned model](https://huggingface.co/mlx-community/Qwen3-4B-4bit/tree/4dcb3d101c2a062e5c1d4bb173588c54ea6c4d25), [MLX-LM LoRA guide](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md).

The small synthetic held-out set is a development gate, not a real-world accuracy estimate. Training examples, final questions, input hashes, unchanged/adapted raw responses, timings and adapter SHA are retained locally per run. The first measured v1 candidate tied 7/10 and regressed one critical case, so the base was retained. V1/historical evaluated questions were then explicitly reclassified as development examples for v2 (146 train / 17 validation), with 12 new independently authored final checks frozen before training. V1 scores are not held-out evidence for v2. No checkpoint selection or hyperparameter sweep uses the final set.

Cancellation stops the task-owned process group before releasing the Device reservation. Unconfirmed training cleanup retains the active marker and reservation for manual recovery. Abrupt interruption is not automatically retried as a successful training run.

## Current setup limits

- Apple Silicon, at least 24 GB total memory, estimated 8 GB available and 8 GB free disk. MLX learning allocation is capped at 8 GiB for this recipe; this is not an OS-wide memory sandbox.
- Python 3.12 must already exist at one of the reviewed framework/Homebrew paths, or the pinned project `.venv` must be installed. The app can create a project venv/install pinned training packages and resume its own interrupted setup, but cannot yet bootstrap Python itself. An incompatible pre-existing environment is preserved. No technical training parameters are exposed to the user.
- Model and runtime downloads remain separate from weight adaptation. Reusing verified cached weights is reported as cache reuse, not as a newly measured download.
- The native app is still ad-hoc signed, not notarized, and not in the macOS App Sandbox. Offline execution tests are distinct from a shipped OS security boundary.

## Isolated Mac verification

`LOCAL_LAB_DEVELOPMENT_SUPPORT=/absolute/isolated/path` points the native app at a separate support directory. Invalid overrides fail closed instead of falling back to the installed runtime. `LOCAL_LAB_DEVELOPMENT_OFFLINE=1`, together with that explicit isolated directory, wraps the app-owned launcher and all processing descendants in an OS profile that denies external outbound networking while permitting localhost/Unix sockets. These are developer validation controls, not an ordinary install setting.

`node scripts/tool-acceptance.mjs start` uses the committed seven-row synthetic sales fixture. `... run` checks actual inference and independent expected arithmetic. Neither command launches a browser. The native UI, restart/new-input, artifact tamper and cleanup results must be recorded separately; API success alone does not prove the app UI works.

## Fresh Mac measurements — November 24, 2026

The isolated, packaged Mac app imported the committed seven-row synthetic sales CSV, selected/reused the upstream-verified MLX cache, and performed real training through the Device queue with external networking denied at the OS level. A separate external HTTPS probe using the same profile failed. Cached weights/runtime were copied into the isolated fixture; a fresh large download and a clean-machine Python installation were not measured.

| Check | Observed result |
| --- | --- |
| Machine | Apple M5, 32 GB memory |
| New v2 held-out exact plans | Unchanged base 7/12; adapted candidate 11/12 |
| Critical checks | 4/4; no critical regression |
| Training plus baseline/candidate evaluation | 153.673 seconds; excludes downloads |
| Changed LoRA-B parameters | 1,966,080 |
| Adapter size | 14,692,068 bytes |
| Adapter SHA-256 | `021221d19a80ff6e87820c232c4f458635ac28bcd07b613184daf6b787a421f8` |
| Verified base fingerprint | `6b63cf8e5b3fa4b57f273dbb88b2df118872bbb82a17891111bf65aaf38d180d` |
| Saved tool binding | `ea8dfbf2661b777288e40855ed41f3f5256ecbd000914be222edb552dadcc04d` |
| Additional real-model checks before restart | Revenue 50, average order value 50/3, 3 unique orders, missing-cost profit clarification |
| Artifact-corruption failure | Modified adapter rejected with no result/fallback; restored weights worked |
| Queued cancellation | Cancelled second inference did not run; Device returned idle |

The remaining final-set failure selected revenue instead of a product ranking for one negative-quantity exclusion question. No further training was selected using that final set. These 12 synthetic questions are not an independent population benchmark. The old 7/10 tie/failure remains recorded as a rejected v1 attempt.

The native UI displayed the actual 7/12 → 11/12 comparison, interpreted a new refund-inclusive revenue question, required whole-file confirmation, and showed the independently verified answer 50. Restart and source-update validation results are recorded with the final acceptance evidence.

Early targeted shell-level orphan-process fixtures were environment-limited: the host returned EPERM when probing the removed group. The fixture now has a self-expiry watchdog and marks unavailable group verification skipped only after independently confirming its bounded descendant is gone. Production still rejects unconfirmed cleanup and retains its marker/reservation. The final full run passed all **50 backend, 31 frontend and 25 installer tests**, including that fixture (no skips in that run); native lifecycle checks also passed. Actual native training exited and released its reservation successfully.
