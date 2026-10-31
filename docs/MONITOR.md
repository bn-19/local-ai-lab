# Monitor

The Monitor consumes the existing authenticated `/api/state` observer: one-second refresh during work, four seconds while idle, no requests before pairing, and cleanup on disconnect. The public Halloween demo shortcut is removed; the visual Halloween switch remains.

Steps derive from job status and persisted handoff receipts. Upcoming steps have empty circles, completed steps filled circles, and active steps a rotating ring. Reduced motion disables rotation. Failed/cancelled steps stop; lost connections stop animation until fresh state returns. These are job-level steps, not an invented Planner/Evaluator/Trainer decision trace.

Elapsed time uses persisted start/finish timestamps. ETA is a remaining-time range from up to ten completed jobs of the same kind and profile, requiring at least three timed runs. Queue time is not guessed. Task sizes may differ; the range is an estimate. Old untimed runs do not seed ETA.

Ollama calls made through the standard job executor persist input/output token usage after each completed call. Multi-call jobs accumulate usage. Monitor estimates avoided cloud API fees for measured jobs of the current task, with explicit coverage and no fabricated usage for older/MLX/training calls. Local tokenization is a proxy, not identical cloud billing. Electricity, hardware, caching, tool charges, model-quality differences and training costs are excluded; this is not net savings.

Default comparison: GPT-5 mini, $0.25 input / $2 output per million tokens, verified 2026-10-31 at https://developers.openai.com/api/docs/models/gpt-5-mini . This legacy model is a price comparison, not a recommendation. Users can enter custom input/output rates. Missing usage or invalid rates show no monetary estimate.
