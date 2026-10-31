# Candy improvement team and local model inventory

The candy demo now has a **Run agent improvement loop** control. Planner, Evaluator and Trainer are separately prompted local Qwen3 role contexts with separate responsibilities and app-owned Relay identities. They share one machine/model queue; they are not three independent base models or parallel GPU workers.

## Decisions and evidence

1. Planner chooses a development audit focus from the known issue and available checks.
2. Evaluator measures the current candy adapter on eight reviewed development questions, without the UI's confirmed-filter override. It receives actual failures and chooses train or keep.
3. Code checks whether a reviewed recipe covers the measured failures. If it does, Trainer chooses a 60-step short pilot or 120-step standard pilot for inline-filter reinforcement plus rehearsal. Without matching coverage, training is skipped. No arbitrary model-authored code or hyperparameters execute.
4. The runner resumes the current adapter and trains one candidate. It compares current and candidate on a fresh 33-question final set. Final answers never enter Planner/Evaluator/Trainer decision prompts before training, and never enter training data.
5. Evaluator recommends promote or keep from measured scores. An independent strict-improvement gate controls actual selection; ties and regressions retain the current adapter. Planner receives the selection.

Role decisions, brief reasons, measurements, training progress and correlated message/receipt IDs persist in Terse. Relay messages carry phase IDs and aggregate scores, not CSV rows or question text. A handoff is confirmed from the recipient's received event or actual durable inbox, including acknowledgement. Send acknowledgement alone does not count as receipt. The first test run stopped when a websocket receipt was missing; the recipient-inbox path was added rather than marking the handoff successful.

The whole loop holds one Device reservation; no nested jobs are queued or awaited inside it. All role inference, checks and training run serially. Training retains its existing timeout and cancellation behavior. Cancellation marks the loop cancelled and prevents subsequent stages. In-flight Relay HTTP calls may finish before cancellation takes effect. Persisted active reservations block blind restart after an abrupt crash.

The live UI filter remains explicit even after a candidate improves. A small pilot test is not enough to promise robust unrestricted natural-language filtering.

### Measured candy run

Run `c01c3319-cc3d-4361-8e1d-c25398cedacc` reproduced 6/8 correct development plans. Trainer chose 60 steps; actual resumed QLoRA changed the adapter checksum. Held-out exact-plan accuracy improved from **26/33 to 29/33**, triggering selection. Training plus evaluation took **115.767 seconds**; the complete loop took **146.012 seconds**. All four handoffs in this run used the explicitly labeled local durable fallback during Relay's cooldown.

The candidate still missed four held-out cases: two sugar-ranking phrasings, one fruity-count phrasing, and a group comparison. Aggregate improvement does not guarantee no regressions; comparison interpretation regressed. Live calculations continue to validate bounded plans and honor the user's confirmed filter before validating the effective subset, while preserving the raw model plan. These are small synthetic interpretation tests, not a broad model-quality benchmark. Repeating the loop reuses this versioned held-out set; it is not a newly sampled test on each click.

The selected candidate passed nine real-CSV report checks with explicit confirmed subsets, against independent calculations from the original CSV. The count case returned an incorrect unused `measure` field; its operation, filter and actual answer (38 fruity entries) were correct. This mismatch remains recorded and is not counted as an exact-plan success. The raw model comparison subset also required the confirmed All filter. Evidence lives in `.local-lab/candy-acceptance.json`.

## Saved models on this Mac

Open **Saved models on this Mac** under the runtime panel. The authenticated inventory endpoint reads actual disk sizes and persisted model results. It lists:

- Ollama Qwen3 base for ordinary requests and role decisions.
- MLX Qwen3 base for fine-tuning and adapter inference.
- Each adapter's profile, file size, total run storage, on-disk status, selected status, evaluation scores, last live use, path, and checksum.

All adapters share the MLX base; there is not another 4B-model copy per task. This prototype does keep separate Ollama and MLX formats. Base-model storage measured on this machine is 4,776,268,214 bytes (2,497,294,790 Ollama and 2,278,973,424 MLX). An adapter is 14,692,068 bytes. Run directories can be roughly twice the adapter size because a numbered checkpoint and final adapter are both saved, plus logs and evaluation data.

**There is no automatic deletion or expiry.** Inventory is read-only; it does not silently remove old, selected, or shared model files. Model removal is not yet an app action. If a user requests cleanup, protect dependencies and explicitly choose what to remove. Manual removal of the shared base breaks dependent adapters; the inventory reports missing files rather than pretending they remain usable.

## First-run time

These are bandwidth calculations, not a measured clean-machine onboarding benchmark:

| Sustained bandwidth | Ordinary model download | Both formats for training |
| --- | --- | --- |
| 100 Mbps | about 3.3 minutes | about 6.4 minutes |
| 50 Mbps | about 6.7 minutes | about 12.8 minutes |
| 10 Mbps | about 33 minutes | about 64 minutes |

Installation, dependency setup, loading, server rate limits and retries add time. The current training path requires a supported Apple Silicon Mac. Initial runtime/Relay/MLX setup is still manual; this is not yet a one-click installer for an arbitrary new machine. Earlier local training plus evaluation took 158–186 seconds on this Mac. Full agent-loop time additionally includes role reasoning and real Relay deliveries; the inventory shows measured completed loop durations rather than inventing an ETA. Warm candy report inference/load was around 1–1.3 seconds in prior runs; full request latency also includes queueing and UI polling.

## API and tests

- `POST /api/tasks/:id/agentloop` → `{jobId}`; candy task and an existing selected candy adapter are required.
- `GET /api/state` adds `loops` with persisted role evidence.
- `GET /api/models/inventory` provides actual files, dependencies, selection and clearly labeled estimates.
- Existing job status/cancel endpoints apply.

`node scripts/agent-loop-acceptance.mjs` runs real role decisions, handoffs and the bounded conditional experiment. Evidence is saved to ignored `.local-lab/agent-loop-latest.json`. Unit checks cover a fresh non-leaking final set, strict promotion, bandwidth arithmetic, and filesystem inventory without following external symlinks.

Two early complete decision runs measured 6/8 raw development plans and skipped training after the Trainer invented constraints about recipe coverage or prior use. Those records are preserved. Recipe coverage is now checked in code, the Evaluator decides whether training is warranted, and the Trainer chooses a bounded compute budget. This changes the agent's decision contract; it does not change the untouched final set or bypass the promotion gate.

## Transport fallback

A later live run received Relay's database-overload error. The loop now degrades explicitly to local durable handoffs for the rest of that run when sending or verifying a Relay receipt fails. Each local message is written to Terse and read back before the recipient phase runs. These events are labeled `local-durable`, never presented as remote receipts, and the original Relay error is retained in the UI and evidence. Successful Relay sends/receipts remain separately recorded. This keeps local model work usable during a cloud transport outage without claiming the cloud exchange succeeded.
