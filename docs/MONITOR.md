# Monitor

The Monitor consumes the existing authenticated `/api/state` observer: one-second refresh during work, four seconds while idle, no requests before pairing, and cleanup on disconnect. The public Halloween demo shortcut is removed; the visual Halloween switch remains.

Steps derive from job status and persisted handoff receipts. Upcoming steps have empty circles, completed steps filled circles, and active steps a rotating ring. Reduced motion disables rotation. Failed/cancelled steps stop; lost connections stop animation until fresh state returns. These are job-level steps, not an invented Planner/Evaluator/Trainer decision trace.

Elapsed time uses persisted start/finish timestamps. ETA is a remaining-time range from up to ten completed jobs of the same kind and profile, requiring at least three timed runs. Queue time is not guessed. Task sizes may differ; the range is an estimate. Old untimed runs do not seed ETA.

Ollama calls made through the standard job executor persist input/output token usage after each completed call. Multi-call jobs accumulate usage. Monitor estimates avoided cloud API fees for measured jobs of the current task, with explicit coverage and no fabricated usage for older/MLX/training calls. Local tokenization is a proxy, not identical cloud billing. Electricity, hardware, caching, tool charges, model-quality differences and training costs are excluded; this is not net savings.

## Agent Relay feed and durable actors

Two sections sit between the step list and the metrics, both derived from `/api/state` on the same poll.

**Agent Relay** lists every message that crossed Relay, oldest first, as a conversation: the Planner's request to the Evaluator for each Relay job (with the job id, work kind and, for proposer jobs, the aggregate development scores that actually travel), the Evaluator's completion back to the Planner, and agent-loop hand-offs. Delivery is shown only from recorded receipt ids: `received` when the recipient's receipt was saved, `awaiting receipt` when a message id exists without one, `not sent` with the companion's error when sending failed. The status line reports the live Relay connection and the agent identities from `state.relay`.

**Durable actors** shows the Device actor (`local-mac`: the active reservation with its attempt id and running time, the queue, the last finished attempts, alarms fired) and the Project actor (`analytics`: how many records of each kind it holds from `state.projectKeys`, and the latest writes ordered by their saved timestamps). Nothing is inferred beyond those timestamps; an older record without one is not listed.

Default comparison: GPT-5 mini, $0.25 input / $2 output per million tokens, verified 2026-10-31 at https://developers.openai.com/api/docs/models/gpt-5-mini . This legacy model is a price comparison, not a recommendation. Users can enter custom input/output rates. Missing usage or invalid rates show no monetary estimate.
