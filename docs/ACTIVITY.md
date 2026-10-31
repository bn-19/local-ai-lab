# Activity panel

Workspace Activity follows the selected saved task or newly created task. The existing local polling subscription supplies its evidence; the separate Monitor retains device metrics and history. Activity sits beside the task/result on wide screens and below on narrow screens.

The current saved job state is prominent. Recorded steps and Run details use native disclosures. Updates preserve row/control identity and expansion. Activity never submits jobs, starts models, downloads weights, creates a catalog, or sends handoffs.

## Evidence and compatibility

The committed `/api/state` contract provides tasks, jobs and device state. Older companions expose the latest saved job snapshot and message IDs, not a complete stage history. The UI labels historical snapshots as recorded, shows no invented agent roles, and never treats a sent message as a recipient receipt. Missing optional fields yield a minimal panel.

Optional `task.selection`, `job.events` and `loops[].events` are consumed when supplied by the companion. Version 0.3.0.0 includes their frozen backend owner handoff. Older companions may omit them. Selection is System evidence. Actual role events may identify Planner/Evaluator/Trainer. Loop receipts require a matching handoff message ID, sender, recipient and transport. Local-durable is explicitly different from Relay. Built-in catalog remains the default; there is no inferred Supabase sync.

No raw prompts, scratchpad, document bodies or result payloads are selected for the feed. Short persisted action/decision summaries render as text; unknown backend error bodies are not copied into Activity. Actual results and existing error/cancel controls remain in the workspace. Model identity/digest/runtime and completed job runtime appear when recorded.

Disconnect clears rendered activity, cached state and the in-memory token. After refreshing or reconnecting, explicitly open the same saved task to reconstruct evidence from the companion. This does not enqueue a rerun or resume an optimizer. No task data or pairing token is stored by Activity in browser storage.

## Verification

`npm --prefix web ci --ignore-scripts`, `npm --prefix web test`, `npm --prefix web run build`, `npm run check`, `npm test` are browser-free. DOM tests use LinkeDOM, never Chrome. Fixtures are tests, not live demo records.

Tested: task isolation, saved snapshot reconstruction, missing optional evidence, send/receipt correlation, local fallback labels, repeated polling deduplication, disclosure/control identity, failed updates and recovery, safe text rendering, disconnect clearing and reconnect without submitting jobs.

Unmeasured without separate approval: rendered narrow viewport, keyboard/screen-reader behavior in a real browser, and end-to-end live model/Relay demo. No model job was launched for this UI work. PDF whole-document accuracy is not established by displaying completion.

## Integration handoff

Based on `bf15a61`. Reviewed frontend owner's activity-only handoff: the Monitor's optional recorded events, signature deduplication and disconnect cleanup are retained. Workspace event projection is replaced with the scoped projection. The expanded 0.3.0.0 release integrates only named, hash-verified backend, PDF, catalog and frontend owner handoffs in an isolated checkout. It preserves Activity task selection and stale-response guards. Private state, models and unrelated dirty files are excluded.
