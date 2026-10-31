# Local Lab

Describe a task, choose a CSV, and get a local model-assisted dashboard with trusted calculations.

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

[Detailed setup and recovery](docs/IMPLEMENTATION.md) · [API contract](docs/LOCAL_API_CONTRACT.md) · [Frontend handoff](docs/FRONTEND_HANDOFF.md) · [Dataset sources](docs/DATASETS.md)

## What works

- Actual machine/runtime inspection, catalog recommendation and approved model download with durable status/cancellation.
- Streaming CSV upload, embedded analytics import, column types/missingness/date coverage and explicit measure choices.
- A local model returns validated operation/chart choices; trusted code computes KPI cards, two charts and an equality filter.
- Real Planner/Evaluator Relay messages trigger local work; Terse retains tasks, queue attempts, model/config identity and results.
- Four-case development/held-out configuration comparison; baseline retained unless held-out correctness improves.
- Saved local recipes and follow-ups, queued cancellation, alarm-triggered deferred work, stale-result fencing and between-job recovery.

The measured public Bike Sharing and 541,909-row Online Retail checks are documented in [implementation evidence](docs/IMPLEMENTATION.md). Local result files remain ignored. No benchmark from another Mac is used as evidence.

## Boundaries

Only narrow CSV operations are supported: count, sum, mean and sum of a product of two columns. No model-written SQL, Python or shell runs. Prompt/configuration optimization is not weight training. No LoRA is implemented. Candy recognition remains the second planned demo; audio/image generation are future recipes.

Raw inputs, weights, credentials, actor state and generated results stay in ignored local directories. A project directory is not an OS security sandbox. Hosted Relay receives IDs/settings/aggregate development findings only. Daily follow-ups can run without new hosted Relay requests.

The old root `index.html`, `app.js` and `styles.css` are preserved design artifacts; the working frontend lives in `web/`. The server serves it at `/app/` and redirects `/` there when built.

## Verification

```sh
npm run check
npm test
node scripts/acceptance.mjs
node scripts/actor-checks.mjs
node scripts/lifecycle-checks.mjs
node scripts/large-acceptance.mjs
```

Integration scripts require the running local services and the public fixtures described in the run guide. None launches a browser. Chrome automation always requires explicit approval for that specific session.

Private repository. Do not commit credentials, private datasets, weights or local evaluation artifacts.
