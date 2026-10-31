# Changelog

## [0.3.0.0] - 2026-10-31

### Changed
- Follow the selected task in a compact Activity panel beside its result, with expandable saved steps and run evidence.
- Keep device queue counts and Monitor metrics distinct from task activity, and reconstruct saved evidence after reconnecting and opening a task.

### Fixed
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
