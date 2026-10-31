# Changelog

## [0.4.0.1] - 2026-10-31

### Fixed
- Bound photo model input to a whole-frame 1280-pixel / 1.5 MP copy, preserving originals and recording source/derived provenance.
- Provision and verify a lightweight pinned Pillow preprocessing runtime without requiring CLIP or training libraries.
- Report incomplete model responses without saving invalid estimates; allow up to 1600 output tokens within the existing 90-second limit.

## [0.4.0.0] - 2026-10-31

### Added
- Upload bounded JPEG/PNG photos locally and reopen saved photo results with task Activity.
- Inspect experimental local detector boxes, accepted counts and uncertain regions; retain model identity and data provenance.
- Add a separate pinned Qwen3-VL whole-photo estimation path with strict output validation and explicit failure states; estimates are not detector-confirmed counts.
- Keep photo inference, installation and training in the existing serialized Device queue.

### Fixed
- Permit local photo previews under the hosted image policy and render box geometry without weakening script/style security.
- Retain the Device reservation until VLM shutdown is confirmed after failure or cancellation.
- Fence delayed dashboard-filter and saved-photo responses against task changes and disconnect.

## [0.3.1.0] - 2026-10-31

### Fixed
- Preserve a user's Saved tasks navigation when the pairing count refresh finishes after reconnect.

## [0.3.0.0] - 2026-10-31

### Added
- Review compatible task-specific local models, approve downloads, reuse pinned model identities, and inspect saved model/adapter storage.
- Run no-file text/code requests and bounded document answers with source checks; preserve model identity for follow-ups.
- Add a validated optional shared model catalog with built-in fallback, plus experimental reporting adapters and a serialized Planner/Evaluator/Trainer improvement loop.
- Document measured short-PDF, model-selection, reporting and training acceptance, including long-document and unconfigured-cloud limitations.

### Changed
- Follow the selected task in a compact Activity panel beside its result, with expandable saved steps and run evidence.
- Keep device queue counts and Monitor metrics distinct from task activity, and reconstruct saved evidence after reconnecting and opening a task.

### Fixed
- Retain the Device reservation until a cancelled reporting subprocess exits, with bounded termination and a regression test.
- Preserve expanded activity rows during polling and clear private activity on disconnect.
- Distinguish sent messages from recipient receipts, show local handoff transport honestly, and omit unrecorded evaluation or tuning stages.
- Prevent delayed saved-task responses from replacing a newer selected task or sample.

## [0.2.0.0] - 2026-10-31

### Added
- Create local CSV dashboards with validated model plans, trusted calculations, two charts and filters.
- Pair the hosted workbench with a local Mac; save tasks, ask follow-ups and compare prompt configurations.
- Run local work through durable Terse jobs and correlated Agent Relay handoffs, with recovery and evaluation evidence.

### Changed
- Simplify the workbench layout and move supporting details into disclosures.
- Deploy the web frontend automatically from `main`; document contributor requirements and measured browser acceptance.

### Fixed
- Bind native browser fetch correctly when pairing with the local companion.
- Preserve evaluation evidence when reusing recipes.
- Finish queued evaluation cancellation and allow retry without overwriting completed jobs.
