# Actual reporting weight fine-tuning

The local app now offers **Run weight fine-tuning** on a saved dashboard. This is a fixed QLoRA pilot: train low-rank adapter parameters on top of a frozen 4-bit Qwen3 4B base. It produces `adapters.safetensors`, not a longer prompt. The adapter remains an experimental reporting artifact and does not replace the CSV dashboard planner.

## Setup and run

The project Python environment needs Apple Silicon MLX:

```sh
.venv/bin/python -m pip install -r requirements-training.txt
.venv/bin/python scripts/download-training-model.py
node scripts/finetune-experiment.mjs
```

The download script pins `mlx-community/Qwen3-4B-4bit` to revision `4dcb3d101c2a062e5c1d4bb173588c54ea6c4d25` (Apache-2.0 model card). It downloads an additional MLX-format model into `.local-lab/models/qwen3-4b-mlx`; existing Ollama weights are not modified. Weights, credentials, training data and results remain ignored local artifacts. No private CSV, model output or training telemetry is uploaded.

The frontend button calls `POST /api/tasks/:id/finetune` and displays/cancels the resulting ordinary durable job. Missing dependencies or model files produce a failed job with its error. The job reserves the same Terse Device used by inference for the entire serial baseline → training → adapted evaluation sequence. It does not enqueue nested jobs while holding that reservation.

## Experiment design

- Synthetic, explicitly authored retail policy from the reporting experiment. This is not validated customer business data.
- 102 training examples, 17 validation examples, 34 fresh final questions. Base question families are split before generating return/scope variants. Existing prompt-pilot test questions are not reused.
- Identical system prompt, schema, tokenizer, model revision, greedy decoding and MLX runtime for both evaluations. No few-shot examples are added to the adapted prompt. JSON is parsed strictly; invalid JSON and wrong policy fields fail.
- One fixed candidate: rank 8, eight final transformer layers, 120 steps, batch size 2, learning rate 0.0001, seed 7, prompt-masked loss, gradient checkpointing. Validation reports loss; it does not select checkpoints. Final test targets are stored outside the training data directory.
- Training runs offline after the model download. Remote model code is disabled. MLX allocation limit is 16 GiB, cache limit 512 MiB; these are not an OS-wide memory sandbox. Whole experiment stops after 16 minutes. A Python stage timeout also caps the sequence at 15 minutes.
- Each run directory includes input hashes, exact config/prompt/model identity, training log, base/adapted raw answers, timing, peak MLX memory, adapter SHA-256 and size. Nonzero LoRA B parameters verify that zero-initialized adapter weights changed.
- Select adapter only if final exact-plan accuracy strictly exceeds baseline; otherwise retain baseline. The base model is never overwritten. Test plans can still be wrong even after selection. Trusted code continues to own calculations.

The final test is a small synthetic pilot with related policy variants, not a population estimate or proof of production readiness. Once results have been inspected, use a new final set for future hyperparameter tuning.

## Cancellation and recovery

Cancel the job in Activity or `POST /api/jobs/:id/cancel`. The worker terminates the task-owned Python process group (including its current training/evaluation subprocess), escalating after two seconds. It releases the Device reservation only when the process exits. A cancelled run may leave partial adapter files; they are never selected as a successful result.

The process group ID is recorded in `.local-lab/finetune-active.json`. After an abrupt backend termination, the persisted active Device reservation blocks automatic restart. Verify and stop that recorded task-owned group before following the existing actor recovery procedure. Do not stop unrelated Python processes or free the reservation while training is still running. Ordinary cancellation removes the process marker.

## Sources

[MLX LM LoRA/QLoRA guide](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md) documents adapter training and prompt masking. [Pinned model](https://huggingface.co/mlx-community/Qwen3-4B-4bit/tree/4dcb3d101c2a062e5c1d4bb173588c54ea6c4d25) supplies the MLX quantized weights. Installed versions and source were inspected before implementing the runner.

## Measured run — October 31, 2026

Run `7a54b8c9-300a-483f-9427-b4b12d2d1591` completed on this Mac:

| Measurement | Result |
| --- | --- |
| Untuned exact plans | 19/34 |
| Adapted exact plans | 34/34 |
| Baseline + training + adapted evaluation | 157.857 seconds |
| Trainable adapter parameters | 3.670 million (0.091% of base parameter count) |
| Nonzero trained LoRA B parameters | 1,966,080 |
| Adapter size | 14,692,068 bytes |
| Peak baseline / adapted inference MLX allocation | 2.565 / 2.802 GiB |

The adapter was selected for this pilot. The checks span ten independently authored test-question stems with policy variants, so 34/34 does not establish general retail accuracy. This is also a different runtime and test set from the earlier 4/6 → 5/6 prompt experiment; those scores should not be compared directly.

One corrected case asked for turnover including shipping/adjustment codes while excluding negative quantities. The base model incorrectly restricted the scope to merchandise; the adapter selected all codes and excluded returns as requested. All 15 baseline failures were corrected in this fixed run.

Weights: `.local-lab/finetune/7a54b8c9-300a-483f-9427-b4b12d2d1591/adapter/adapters.safetensors`.
SHA-256: `0ab1aed20cde91e9f81f3d32708a9524d56a650e811a7876e52b31e4047f8e37`.
Full evidence: `.local-lab/finetune/latest.json`; training log/config/manifests are in the run directory.

The dashboard recipe remained unchanged. After completion, the Device queue was idle, the active-process marker was removed, and a process check found no remaining fine-tuning workers. An immediately cancelled retry was also verified. No browser session was launched. The adapter is saved and evaluated, but is not wired into production CSV dashboard inference.

## Live integration added

The trained adapter now powers the separate whole-file CSV reporting workflow. See [live reporting](LIVE_REPORTING.md) for column mapping, the audited retail exclusion policy, API and independent real-data verification. The earlier statements about no live integration describe the initial training milestone.
