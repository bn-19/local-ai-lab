# Local Lab

Describe a task, review a compatible local model, and run a text/code request, bounded document answer, or CSV dashboard with trusted calculations.

The working analytics path uses **Ollama/Qwen3**, **DuckDB**, **Agent Relay** handoffs and **Terse Durable Actors**. The public Vercel frontend connects directly to an explicitly paired loopback service on your Mac. It does not upload your CSV to Vercel or Relay.

## Run

Node 22+; pinned Bun is installed as a project dependency. This Mac has the app-owned Ollama runtime and Qwen3 4B model installed in ignored `.local-lab/` storage.

```sh
npm ci
npm --prefix web run build
```

Run each service in its own terminal:

```sh
npm run runtime:actors
npm run runtime:ollama
npm run dev
```

Open [the hosted frontend](https://local-lab-bn-19s-projects.vercel.app) or [local fallback](http://127.0.0.1:4173/app/). Read `.local-lab/pairing-token` locally and enter it in Connect your Mac. Never put this token in a URL, source file or chat. Browser loopback permission may be required; unsupported browsers receive a connection error.

[Detailed setup and recovery](docs/IMPLEMENTATION.md) · [API contract](docs/LOCAL_API_CONTRACT.md) · [Frontend handoff](docs/FRONTEND_HANDOFF.md) · [Dataset sources](docs/DATASETS.md) · [Task activity and evidence](docs/ACTIVITY.md)

## What works

- Actual machine/runtime inspection, task-specific catalog recommendation and approved model download with durable status/cancellation. The optional shared catalog falls back to the reviewed built-in catalog.
- No-file text/code answers, document extraction and bounded answers, with model identity preserved across follow-ups.
- Actual disk inventory, experimental local reporting adapters and a serialized Planner/Evaluator/Trainer improvement loop with recorded transport evidence.
- Streaming CSV upload, embedded analytics import, column types/missingness/date coverage and explicit measure choices.
- A local model returns validated operation/chart choices; trusted code computes KPI cards, two charts and an equality filter.
- Real Planner/Evaluator Relay messages trigger local work; Terse retains tasks, queue attempts, model/config identity and results.
- Retail reporting prompt comparison with four development and six final questions; baseline retained unless held-out correctness improves.
- Saved local recipes and follow-ups, queued cancellation, alarm-triggered deferred work, stale-result fencing and between-job recovery.
- Task-scoped Activity with expandable saved evidence; a separate Monitor retains device-wide queue and timing information.

The measured public Bike Sharing and 541,909-row Online Retail checks are documented in [implementation evidence](docs/IMPLEMENTATION.md). Local result files remain ignored. No benchmark from another Mac is used as evidence.

## Boundaries

Only narrow CSV operations are supported: count, sum, mean and sum of a product of two columns. No model-written SQL, Python or shell runs. Prompt/configuration optimization is distinct from the experimental MLX QLoRA reporting path. Candy reporting uses a public tabular preference dataset; it is distinct from [experimental local photo vision](docs/CANDY_VISION.md). The photo workflow exposes detector boxes/unknowns and a separate whole-photo estimate path. Reliable pile counting and equivalence to hosted assistants are not established. Audio/image generation are future recipes.

Short NASA Webb PDF summary/follow-up passed the documented checks. General long-PDF synthesis is not ready: the Landsat acceptance fails closed at the source-quote guard. Supabase is unconfigured in the measured environment; no live SQL/RLS acceptance is claimed. See [PDF acceptance](docs/PDF_SUMMARIZATION_ACCEPTANCE.md), [model selection](docs/MODEL_SELECTION.md), [shared catalog](docs/SHARED_MODEL_CATALOG.md), and [agent-loop/storage evidence](docs/AGENT_LOOP_AND_STORAGE.md).

Raw inputs, weights, credentials, actor state and generated results stay in ignored local directories. A project directory is not an OS security sandbox. Hosted Relay receives IDs/settings/aggregate development findings only. Daily follow-ups can run without new hosted Relay requests.

The old root `index.html`, `app.js` and `styles.css` are preserved design artifacts; the working frontend lives in `web/`. The server serves it at `/app/` and redirects `/` there when built.

## Verification

```sh
npm run check
npm test
npm --prefix web ci --ignore-scripts
npm --prefix web test
npm --prefix web run build
node scripts/acceptance.mjs
node scripts/actor-checks.mjs
node scripts/lifecycle-checks.mjs
node scripts/large-acceptance.mjs
```

Integration scripts require the running local services and the public fixtures described in the run guide. None launches a browser. Chrome automation always requires explicit approval for that specific session.

Private repository. Do not commit credentials, private datasets, weights or local evaluation artifacts.
