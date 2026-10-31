# Starter prompt for Codex

Copy the following into a new Codex chat opened in this repository:

---

Build **Local Lab**, a local AI task setup and tuning app for nontechnical people. The person describes the everyday work they want help with; the app selects a compatible open-source model recipe, obtains approval for downloads/training, evaluates a baseline, attempts a justified improvement and delivers a working local tool.

Read `AGENTS.md`, `README.md`, `PRODUCT.md`, `DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/BUILD_PLAN.md` and `docs/DATASETS.md` first. Inspect the existing preview. Preserve the clear, approachable design while replacing preview behavior with real integrations.

## Current demo scope

Implement two recipes under one shared task/model/job system:

1. **Candy recognition:** approved labeled photos → a small pretrained image classifier or detector → usable predictions on new photos. Ask whether the desired output is brands present or individual boxes/counts. Use only the implemented capability. Restrict initial coverage to a small known class set; evaluate on separately photographed scenes. A generic “candy” label does not establish brand recognition.
2. **Data analytics:** approved CSV → local text model chooses supported operations → trusted code computes results → charts and an explanation with source/measure details. Support bounded filtering, aggregation and chart choices. Do not execute arbitrary model-generated Python, shell or SQL.

The broader platform should accept future recipes. Audio and diffusion are later work, not required for this demo. Do not claim arbitrary task support from two recipes.

## First milestone: make one real job flow work

Before feature expansion, implement and verify:

**user request → real Relay message/action → local worker/model job → result persisted in Terse → completion received by another worker → UI reflects the real result.**

Use the simplest available supported local engine for this milestone. Inspect installed runtimes and sponsor docs before choosing versions. Prefer the existing Node backend and a minimal typed runtime boundary; introduce TypeScript/React only where it helps the team, not as a prerequisite rewrite. Do not perform a broad framework migration before the first job works.

The design preview currently has no model/backend integration. Keep an explicit preview state until a path is real. Never simulate successful benchmark/training results.

## Required sponsor roles

**Agent Relay:** connect app-owned Planner and Evaluator/Optimizer workers. Have them exchange real requests, failure findings, configuration proposals and results. Keep identities stable. Confirm the installed SDK contract; action acknowledgement is not completion. Persist invocation/trial correlation and handle failure/timeouts. The local worker's decision loop must use an actual model where judgment is required; deterministic tools should remain ordinary code.

**Terse Durable Actors:** use a Project actor for approved task, recipe/config versions, trial states, measured results and model/output references. Use a Device actor for a persisted queue, active job/attempt, cancellation and recovery. Keep actor calls short. The local executor owns heavyweight processes and files. An actor does not automatically resume external inference or training after a crash.

Queue all local model calls, including Planner/Optimizer inference. Run one heavy inference or training job at a time. Release the device reservation between pipeline stages and before waiting for human approval or another queued model call. Reconcile an old worker before retrying an expired reservation; fence stale results by attempt ID. Keep `.durable-actors/` intact across restart tests. Use an alarm for a short deferred job with the required runtime/worker still running.

## Architecture and privacy

Use pluggable recipe/runtime adapters with capabilities such as inspect model, install model, run task, evaluate and optionally tune. A recipe records input/output schema, model identity/revision, runtime, allowed tools, configuration, evaluation method and resource/time budget. Implement only the adapters needed for these two demos; do not create a universal plugin framework first.

Keep original files unchanged. Accept only selected inputs through bounded tools. Store private data, weights and adapters locally in ignored app-owned directories. Hosted Relay/controller traffic should carry IDs/settings/scores, not private files or raw outputs. Disclose any cloud setup dependency. A directory or virtual environment is not an OS sandbox.

**Supabase is optional:** useful later for a shared public model/recipe catalog or published results. Terse owns active job state. Do not add authentication or a duplicate cloud job queue to the critical path. Never put service-role keys in browser code.

## Evaluation and tuning

Establish the baseline first. Use a separate data split and known-answer checks. Distinguish prompt/config optimization, quantization and actual weight fine-tuning. Run a measured pilot before assigning any training duration; the earlier timing ranges are planning allowances, not M5 benchmarks.

For candy, split original scenes before augmentation; include new backgrounds/arrangements. Evaluate the requested recognition task, not just training loss. Counts require a verified detection pipeline. For analytics, independently check calculations and plotted values; unknown measures must prompt clarification. Keep final-test answers out of optimizer prompts.

Attempt at most one bounded improvement after the shared path and usable baseline work. Stop at a measured time/memory cap. Retain the baseline if held-out quality does not improve. Track exact base/adapter/data/config versions and actual checkpoint locations. No fake accuracy, energy savings or “best model” claims.

## Work style and finish condition

Start by stating the smallest implementation plan and first verification command, then act. Ask only for genuinely missing credentials or critical product choices while continuing independent work. User approval is required before a specifically described Chrome/Chromium automation session. Do not launch a browser or use a browser test script implicitly. Use syntax, unit and HTTP checks while browser permission is pending.

Do not spawn agents unless the user authorizes delegation. Keep commits focused, protect other people's work and never commit secrets, datasets or weights. Verify current branch and scope before publishing. Keep the repository private.

Report what actually works, how it was checked, which steps are still previews and the next highest-value milestone. Stop after the first real shared job is working and reviewable if the remaining event time makes further features unsafe; otherwise complete the two baseline recipes before tuning.
