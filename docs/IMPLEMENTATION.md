# Working analytics implementation

The static starter is now backed by a loopback Node API, DuckDB, Ollama, Agent Relay 15.0.1, and Terse 0.14.9. Bun 1.4.4 is pinned locally. Published package APIs were checked against installed code; event-organizer endorsement of these versions has not been independently confirmed.

## Start on this Mac

From the repository, run these in three terminals:

```sh
npm run runtime:actors
npm run runtime:ollama
npm run dev
```

Open the deployed UI at https://local-lab-bn-19s-projects.vercel.app or local fallback http://127.0.0.1:4173/app/. Read `.local-lab/pairing-token` locally and paste it into the UI pairing field. The token is not included in source, a URL, or cloud requests. The hosted origin is configured in `.local-lab/allowed-origin`, or `LOCAL_LAB_ORIGIN`. The frontend retains the token only in memory.

For a fresh checkout: `npm ci`, build `npm --prefix web run build`, install official Ollama into `.local-lab/runtime/`, then start services. The official runtime used here is https://github.com/ollama/ollama/releases/download/v0.40.13/ollama-darwin.tgz . Model weights download through the UI approval action, not through a model-generated script. The installation is currently macOS-specific; missing binaries produce a setup error, not an automatic universal installer.

Relay identity setup is an explicit external-resource action: after approval, `npm run setup:relay`. It creates a dedicated workspace or uses `RELAY_WORKSPACE_KEY`, and securely saves the workspace key and two agent tokens in `.local-lab/relay.json`. Do not rerun it with missing credentials from an existing workspace without checking ownership. Daily follow-up execution uses the saved recipe locally and does not require a new Relay request.

## Demonstrate

Use UCI Bike Sharing `day.csv` from `.local-lab/sources/bike/day.csv`:

- Ask for total bike rentals by season and monthly trend.
- Measure **sum**, column **cnt**, date **dteday**, grouping **season**, filter **workingday**, include negative values.
- Total: 3,292,679 across 731 daily records. Filter workingday=1: 2,292,410 across 500 records.
- No weekends inference from the workingday flag: it also excludes holidays.

Large source: `.local-lab/sources/retail/Online Retail.csv`, 541,909 rows / 47,758,972 bytes. Choose **product_sum**, Quantity × UnitPrice, date InvoiceDate, grouping Description or Country, filter Country. Include negative quantities for net revenue, or explicitly exclude negative measure values. Costs are absent; this is revenue, not profit. Source originals remain unchanged.

## Architecture and privacy

The hosted frontend sends CSVs directly to 127.0.0.1, never to a Vercel API. Backend enforces exact Host, approved Origin and bearer token for all API reads/writes; no wildcard CORS. Local Terse uses a separate secret. Ollama has cloud features disabled, one parallel request, a 4096-token context and a 120-second inference timeout.

Raw CSVs are copied to ignored app-owned paths and parsed by DuckDB with a 2 GB memory limit and four threads. Tables are identified by generated UUID, identifiers/literals are quoted, and operations are allowlisted. The model receives schema/confirmed task metadata locally, not the full dataset. It returns a validated operation/column/chart plan; trusted SQL templates calculate values. Model-written SQL, Python and shell are never executed. This is not a production OS sandbox.

The app-owned Planner sends a real Relay DM request. The Evaluator listener validates protocol, sender identity and known job ID, then enqueues local work. Completion is persisted before a real DM returns to Planner. Only IDs, status and development aggregate failure categories cross Relay. Task text, dataset columns, rows and dashboard outputs remain local. Message IDs prove receipt separately from send acknowledgement. Message-based routing is implemented; typed Relay action completion is not advertised.

Terse Project persists tasks, recipes, jobs, results, evaluations and artifact IDs. Device owns the one queue and active attempt. Calls are short; inference runs outside actors. Whole-state reassignment commits transitions. Reservations and completions are idempotent; attempt tokens fence stale results. No lease timeout steals work. A startup detects a surviving executor and refuses a competing one. Interrupted external generation requires stopping/reconciling the owned runtime; actors do not resume a half-generated answer.

## Recovery and cancellation

Cancel marks a queued job cancelled or aborts the running HTTP model request; model download partials can be reused by a later approved install. Each job retains real status and error. On a process restart between jobs, existing actor state and DuckDB are reused, Relay identities reconnect, and pending requests are recovered with the same job IDs. An active previous attempt blocks automatic restart: verify the old backend and project Ollama are stopped before explicitly reconciling its executor. Never delete `.durable-actors/` to hide an interrupted attempt.

Development hot reload can temporarily make actor RPCs unavailable. The client retries transient failures, and actor reserve/finish methods safely accept repeated attempts. An actual initial install interrupted by hot reload remains marked interrupted in history; the resumed install completed from cached bytes.

## Evaluation and limits

Evaluation uses four reviewed schema/task cases: two development and two held-out. The Optimizer receives development results only and proposes one bounded prompt/config change through Relay. Final answers and final-case results do not enter the optimization prompt. Both configurations are tested; a strict held-out correctness improvement is required for promotion. A tie retains baseline. This is a narrow smoke evaluation, not evidence of broad analytical accuracy. Prompt changes are not learned weight training; no LoRA or weight adaptation is implemented.

Supported calculations: row count, sum, mean, sum of two numeric columns multiplied. Charts: top categorical groups and monthly date trend, or row-count grouping when no date exists. Filters: one equality filter with up to 100 displayed values. Up to 500 MB CSV, 100 columns, 12 plotted categorical groups and 240 monthly buckets. Numeric measure selection and date semantics require user confirmation. Follow-ups can alter supported operation/group/date using the same measure columns; arbitrary analysis and new derived measures are unsupported.

Candy remains the second planned recipe; no candy inference is implemented here. Supabase and cloud VMs are not required for this path. Credits are separate account setup, not proof of runtime integration.

## Checks

`npm run check` and `npm test` do not launch a browser. `node scripts/acceptance.mjs` runs the public Bike fixture end-to-end, including actual model/Relay work, independent sums and CORS denials. `node scripts/actor-checks.mjs` verifies isolated actor exclusion, duplicate handling, stale fencing, cancellation and alarms. `node scripts/lifecycle-checks.mjs` checks API authorization, actual queued cancellation, deferred worker execution and saved state.

Browser verification requires explicit session-specific approval. Passing HTTP tests alone does not prove deployed HTTPS-to-loopback permission behavior.

Dependency audit: pinned Terse tooling currently brings moderate minimatch/glob advisories through its schema generator. Do not run `npm audit fix --force`: its suggested downgrade would mix SDK generations. The app does not expose user-controlled glob patterns or schema compilation through its API.

## Measurements on this M5 (October 31, 2026)

- MacBook Pro, Apple M5, 32 GB unified memory. Approximately 269 GB free disk after model download; instantaneous free RAM is not equivalent to reclaimable memory.
- Ollama 0.40.13, Qwen3 4B, 2,497,293,931 bytes. Digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`.
- Initial download interrupted by a Terse development hot reload; recorded as interrupted. Resumed install completed from cached bytes in 6.35 seconds. This is not the full download duration.
- UCI Bike Sharing: 731 rows, 24 ms profile/import; first model call 2,857 ms including 1,037 ms load, 55 output tokens. All 56 plotted values across unfiltered/working-day monthly and category charts match independent CSV aggregation.
- UCI Online Retail: all 541,909 rows, 47,758,972-byte CSV, conversion 9.55 seconds, latest import/profile 251 ms. Process RSS after import 276 MB (DuckDB memory cap 2 GB; not a measured peak GPU-memory claim). Net revenue 9,747,747.933998246 agrees with independent Decimal total 9,747,747.934 within floating-point tolerance. Local model call 2,305 ms. Fresh saved-recipe follow-up selected row count and returned 541,909 in 3,968 ms, without a Relay request.
- Configuration evaluation: baseline 4/4, candidate 4/4; held-out 2/2 each. Baseline per-case latencies 1654, 2209, 1710, 1901 ms; candidate 2119, 2054, 1814, 1932 ms. Baseline retained. No model correctness failure observed on this tiny test set; the Optimizer proposed stricter constraints as a hypothesis, not an observed accuracy gain.
- Real Relay request/receipt `242362988069867520`, completion/receipt `242363036509700096` for the first dashboard. Optimizer request/receipt `242363251099111424` triggered a real local configuration proposal.
- Isolated actor tests passed duplicate enqueue prevention, exclusive reservation, stale-result fencing, cancellation and a real alarm. App lifecycle test executed a deferred job, cancelled another queued job, and recovered saved tasks after backend restart. Bad Origin, bad Host, missing/invalid token and malicious column were rejected.

These are measured public-fixture results on this Mac, not general model accuracy or universal performance guarantees. Full local artifacts remain in `.local-lab/` and are not committed. Hosted-browser acceptance is recorded by the frontend owner in `docs/FRONTEND_HANDOFF.md`.
