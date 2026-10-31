# Task-aware model setup

The app recommends from a small reviewed catalog; it does not claim to find the best model on the internet. Cold-start selection uses task/input rules and measured hardware without running an LLM. Models are downloaded only by the explicit setup endpoint, using trusted Ollama pulls. Inference and installation share the Device queue.

## Reviewed catalog (2026-10-31)

| Artifact | Purpose | Download | Working-memory estimate at 8192 context | License |
| --- | --- | --- | --- | --- |
| qwen3:4b, Q4_K_M | General text, document and CSV planning | 2.5 GB | 6 GB plus OS headroom | Apache-2.0 |
| qwen2.5-coder:1.5b, Q4_K_M | Code explanation/generation; smaller text fallback | 0.986 GB | 3 GB plus OS headroom | Apache-2.0 |

Official sources: [Qwen3 artifact](https://ollama.com/library/qwen3:4b), [Coder artifact](https://ollama.com/library/qwen2.5-coder:1.5b), [Coder publisher model card](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct), [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md). The reviewed full manifest digests are in `lib/model-catalog.mjs`. Downloads verify the resulting manifest digest before readiness; tag drift fails rather than silently changing a task.

These are app resource estimates, not official minimum requirements or comparative quality benchmarks. Both artifacts are text-only. Code is returned as text, never executed. Images/audio/video, OCR and agent tool execution are unavailable. The supported local platform is currently Apple Silicon macOS. Runtime installation remains a separate prerequisite; missing runtime yields an actionable setup instruction, not a false successful install.

## Selection and saved identity

Inputs include actual attachment kind, request and speed/quality/download preferences. Available memory is estimated from macOS free + inactive + speculative pages; free memory is also reported separately. This is reclaimable capacity, not a guaranteed allocation. Disk budgets include staging/headroom. Model choice is deterministic: coding requests favor the coding specialist, general/document/CSV favor Qwen3, speed or tighter capacity may favor the smaller artifact. Constraints are checked again at installation. Missing or incompatible candidates return explicit reasons.

New task records pin artifact id, digest, runtime, quantization and 8192 context; older bindings retain their 4096 default. Every inference verifies the installed digest. Follow-ups retain their original model. New task selection does not mutate old tasks. Prompt evaluation runs the task's pinned model. QLoRA and saved candy/retail adapters remain restricted to the reviewed Qwen3 MLX base; no Coder fine-tuning recipe is claimed.

Installation progress, failures, cancellation and cache reuse are real Device jobs. Cancelled downloads may leave Ollama partial cache for a later retry; no model is declared ready until digest verification. Models remain on disk until explicitly removed. GPU/model loading is serialized, and Ollama requests use zero keep-alive to release the model after each call. This trades reload latency for avoiding resident model overlap.

## Activity and optional shared catalog

Job `events` are persisted stage/status changes, not timed animations. Selection events are System actions; Planner/Evaluator/Trainer labels apply only to actual role invocations. Catalog version, source, model digest, receipts and job IDs belong in technical evidence.

No Supabase configuration or connector was present in this workspace. The default is **Built-in catalog / not synced**. An optional read-only adapter can use an already configured `LOCAL_LAB_SUPABASE_URL` and `LOCAL_LAB_SUPABASE_PUBLISHABLE_KEY` (with legacy `LOCAL_LAB_SUPABASE_ANON_KEY` fallback). It reads `local_lab_model_catalog` rows with `id,digest,version,enabled`; only enabled artifacts matching locally reviewed digests can be selected. HTTPS `*.supabase.co` only, bounded response, short timeout and explicit built-in fallback on failure. No projects/tables were created and no cloud synchronization was verified. No task text, documents, CSVs, weights, adapters or benchmark results are uploaded. Publishing benchmarks is not implemented.

## Bounded document synthesis

All extracted parts produce bounded source notes with page ranges and character offsets. A final answer reconciles notes across every part, rather than showing independent excerpts as a whole-document summary. Prompt input has a conservative UTF-8 byte cap within the 8192 context; overflow fails explicitly. Planning-only outputs are rejected with one bounded retry. Cancellation is checked between calls and before saving. Source notes and per-part answers remain available for review. Text extraction cannot see figures or scanned pages, and passing API checks alone does not establish factual accuracy.

## Actual acceptance evidence

On the measured Apple M5 / 32 GB Mac, a code request recommended `qwen2.5-coder:1.5b` while a document request recommended `qwen3:4b`. Device install job `898cc3fd-2f98-4f77-96fe-259d0404a01a` downloaded the reviewed coding artifact in 88.142 seconds. Task `0971cf4b-ce1b-4fd4-9188-b82d8a8a6d21` used that artifact and correctly explained that `[1,2,3].map(x => x * 2)` produces `[2,4,6]`; inference took 1.948 seconds. Task and result retained the actual full digest. A second install reused the verified cache; attempting its QLoRA recipe was explicitly rejected. Existing candy task binding and selected saved Qwen3 adapter remained intact. This run used the then-pinned 4096 context; subsequent new tasks explicitly select 8192, while the saved evidence keeps its original setting.

Evidence: ignored `.local-lab/model-selection-acceptance.json`. This is one real execution smoke check, not evidence that the coding model is universally better. Unit scenarios for constrained memory/disk and incompatible modalities use declared simulated hardware and are not measurements of other machines. PDF quality evidence is maintained independently in `docs/PDF_SUMMARIZATION_ACCEPTANCE.md`; execution success must not be treated as factual certification.

### PDF acceptance boundary

The final bounded retest passed the short NASA Webb fact sheet's five independent fact groups using the complete source directly (task `76bd0d30-74ab-4d5c-a7f1-282974cca4c2`). The longer Landsat document remains **not ready**: job `e3933d9e-8267-4d16-85f6-177794ab826b` failed because a proposed evidence quote did not appear verbatim in its source. No long-document summary was saved as successful. Earlier hallucination/placeholder/length failures are preserved in the independent acceptance evidence. Source guards prevent known failures from being presented as success; they do not prove all possible summaries accurate. This limitation does not block task-aware model selection or the working candy demo.
