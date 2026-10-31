# Build the first working Local Lab analytics workflow

This is an implementation request. Work in the **yc-hackathon-10-31** project at `/Users/boaznakhimovsky/Documents/ChatGPT/yc-hackathon-10-31`. Build the working app, rather than stopping at a plan or another simulated design.

## Product and immediate objective

Local Lab empowers nontechnical people to use and adapt open-source local models for their own everyday tasks. A person describes the result they want; the app checks the computer, proposes a compatible model and tool recipe, installs the approved model, measures a baseline, tunes the setup for the task and gives the person a usable local tool.

**This session's first complete workflow is a data analytics dashboard from a large CSV.** Example request: “Help me understand this sales dataset. Show the most important trends, the biggest product groups and useful filters.” The two planned hackathon demos are analytics and candy recognition, but finish the shared system and analytics path before starting candy. Audio and image generation are future recipes. Keep the architecture extensible without claiming arbitrary tasks already work.

The user's computer was previously inspected as an Apple M5 MacBook Pro with 32 GB unified RAM. Recheck current hardware, available memory/disk, installed runtimes and tool versions. Do not treat old observations or another Mac's benchmarks as current performance evidence.

## First: inspect and import the existing starter

The project checkout was empty with no remote when this session was requested. Inspect again before changing anything; preserve any work that arrived meanwhile.

The private starter repository is **https://github.com/bn-19/local-ai-lab**. A local copy exists at `/Users/boaznakhimovsky/Documents/Codex/local-ai-lab` and contains the design, README, AGENTS.md, START_HERE.md and docs. Import the starter into this project using a normal safe Git fetch/checkout if the checkout is still empty. Preserve this project's `.git`; do not nest another repository, overwrite existing work, force-push or reset the checkout. If fetching is blocked, the tracked local starter files are a fallback source, with the origin/sync state recorded accurately.

Read the destination's applicable AGENTS.md instructions, then README.md, PRODUCT.md, DESIGN.md, docs/ARCHITECTURE.md, docs/BUILD_PLAN.md and docs/DATASETS.md. This prompt narrows the first implementation milestone to analytics; it does not abandon candy as the second demo. The existing UI is a clearly labelled design preview. Replace preview paths with real behavior incrementally and preserve the accessible, simple design.

## Use bounded development subagents

The user explicitly authorizes subagents for this implementation. Use two focused, independent read-only investigations early, while the root prepares the integration:

1. **Hardware/runtime/model investigator:** inspect the actual Mac and existing tools; compare a small shortlist of currently available open-weight models suitable for structured analytics/tool requests. Return source links, artifact sizes/licensing, compatibility evidence and a concrete first candidate. Do not install or download independently.
2. **Sponsor integration investigator:** check current Terse/Durable Actors and Agent Relay APIs against the supported event releases. Return the smallest working registration/message/result and persisted-actor integration paths, required credentials and SDK pitfalls. Do not edit implementation files.

Honor the user's delegate model/effort preferences where available. Keep prompts bounded, with concise evidence and a stopping condition. The root owns scoping, file edits, integration and verification. Do not spawn a role tree. If a later coding delegate is useful, give it one independent module with clear ownership; do not allow competing writers in the shared checkout.

Development subagents are separate from the app's own runtime agents. Implement the runtime agent handoffs too; development collaboration alone does not demonstrate Agent Relay in the product.

## Build the full user journey

1. **Describe the task:** a free-text request, selected CSV and a small number of useful clarification questions. Resolve ambiguous measures, date columns and desired output rather than assuming the demo schema.
2. **Check the machine:** show actual hardware and required runtime readiness in plain language. Account for model weights, context/cache overhead and free disk. A missing dependency must produce an honest setup path.
3. **Recommend a setup:** select from a small documented catalog using task requirements and machine constraints. A small Qwen model through Ollama is a starting candidate, not a hard-coded universal answer. Compare a second candidate only when it adds useful evidence and fits time/resources. Explain the choice and download size.
4. **Install the model:** implement a real approved download and truthful status/progress/error/cancel behavior. The user authorizes appropriate runtime/dependency setup and the selected model downloads needed for this project. Keep installations/project caches owned and traceable. Do not install arbitrary repositories or execute model-generated installation scripts.
5. **Profile the CSV locally:** use streaming/chunked processing or an embedded analytical engine. Inspect types, missingness, row/date coverage and bounded samples. Keep the full dataset out of the LLM context. Handle a genuinely large CSV, targeting at least roughly 500,000 rows in the demonstration. If no user dataset is supplied, use an attributed public dataset such as UCI Online Retail with a documented conversion to CSV, and a small source such as Bike Sharing for quick checks. Do not fabricate a “large” dataset by duplicating rows without disclosure.
6. **Create the dashboard:** have the local model choose validated operations and chart specifications; trusted code calculates the values. Show useful KPI cards, at least two charts, a working filter, source/measure details and a way to ask a follow-up. Implement the narrow supported operation set well. Never execute arbitrary model-written Python, shell or unrestricted SQL.
7. **Evaluate and tune:** run real development checks against independently calculated answers. Categorize actual model failures, request one justified prompt/configuration improvement through Agent Relay, rerun and compare measurements. Save the tuned recipe or retain the baseline if it loses. Do not stop at a download and canned dashboard. Keep final-test answers out of optimization prompts.
8. **Deliver and reuse:** save the selected model/configuration, evaluation result, task definition and dashboard references. A fresh task should use the working local recipe without rerunning setup search. Provide clear progress, errors and cancellation throughout.

Prompt/config tuning, quantization and learned weight adaptation must have different labels. For this first analytics workflow, prioritize accurate tool selection and a measured configuration improvement. Add genuine LoRA only when recurring failures, suitable reviewed labels and a measured pilot justify it; do not falsely call a changed prompt “training.” If actual weight tuning is attempted, preserve the baseline, explicit split/version, checkpoint and rollback, and enforce a wall-time/memory cap. The app should still work when an attempted improvement does not help.

## Required roles for the hackathon infrastructure

**Agent Relay:** app-owned Planner and Evaluator/Optimizer workers exchange real task requests, test findings, configuration proposals and results. The workers make actual model-based decisions where judgment is needed; arithmetic, downloads and validation remain ordinary tools. Persist/reconnect agent identities, correlate request/trial/invocation IDs and handle asynchronous completion/failure. The current SDK acknowledges actions before their result arrives; confirm installed behavior. An app-owned local model worker needs an explicit bridge into Relay messaging/actions.

**Terse Durable Actors:** use a Project actor for approved task/recipe, model/config/data versions, job/trial states, measured results, selected setup and artifact references. Use a Device actor for the pending queue, active job/attempt, executor identity, cancellation and recovery. Short actor calls reserve/finish work; external workers own model processes and large files. Preserve local actor state across restarts. Verify current CLI/SDK generation with the sponsor; older repo examples and newer quickstart imports may differ.

Run one heavy local inference/training job at a time, including Planner/Optimizer model calls. Release reservations before another queued call or human approval. Reconcile an old worker before retrying an expired lease; fence late results and prevent duplicate execution. Demonstrate recovery between jobs and a short alarm-triggered deferred job with the actor runtime/worker still running. Actor persistence does not automatically resume a half-generated answer or a training optimizer state.

**Other event resources:** Supabase can support an optional shared model/recipe catalog or opt-in published aggregate results, while Terse remains authoritative for live jobs. OpenAI/event credits may help controller/setup development on public or sanitized metadata when appropriate. Use other sponsors only when they shorten the critical path. Do not add auth, cloud hosting, every sponsor SDK or a second job queue merely to use credits. Verify access and services rather than assuming credentials exist.

## Privacy and operational boundaries

Keep raw CSVs, selected private files, weights, adapters and generated artifacts local in ignored app-owned directories. Preserve originals. Hosted agents/channels receive only permitted metadata, IDs, settings and aggregate scores; never silently upload private CSV rows or outputs. Disclose any cloud controller/setup dependency. Daily local processing after setup should not require another hosted Relay conversation.

Expose only bounded tools over approved table/file IDs. Treat dataset cells and model output as untrusted data. Keep service credentials out of the browser and Git. A project folder or virtual environment is not a production OS sandbox. Keep the repository private; do not invite collaborators, publish a site or send external messages without specific authorization.

Chrome/Chromium automation requires explicit approval for the specifically described session, including headless launches and attaching to personal Chrome. Do not inherit a blanket approval from this handoff. Review test scripts for implicit launches, use non-browser checks while approval is pending, and clean up every approved task-owned session. Never use the personal Chrome profile for tests or interrupt unrelated browsing.

## Implementation order and completion evidence

Start with a brief plan and use the current Pacific time/event deadline to prioritize. Then implement; do not spend the session producing another long research document. Keep UI, local tools and real runtime integration moving together.

First integration gate: **user request → real Relay request → real local model job → persisted Terse result → another worker receives completion → UI shows the actual output**. Continue from that gate to the complete analytics journey; it is a milestone, not the final deliverable.

Finish with evidence for:

- Actual detected machine/runtime readiness and installed model identity/revision.
- A real model download or correctly identified existing cached model, with one working inference call.
- Actual CSV size/row count, import timing and resource observations on the user's Mac.
- A working dashboard with two charts and a filter whose numbers match trusted calculations.
- At least one real development evaluation and bounded tuning comparison, with baseline/tuned results and failed runs reported honestly.
- Relay handoffs that caused executed work and Terse state that reconstructs progress without duplicate heavy jobs.
- Fresh follow-up behavior using the saved local recipe, plus error/cancellation handling and original-file preservation.

Run proportionate checks, including meaningful calculation/model-boundary tests and HTTP checks; obtain session-specific approval before browser automation. Keep source changes and commits focused. Do not commit weights, user data, credentials or benchmark outputs containing private data. Do not automatically push implementation changes unless separately requested. Report what works, exact run instructions, real measurements, remaining limitations and the next highest-value step.
