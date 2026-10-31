# Changelog

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
