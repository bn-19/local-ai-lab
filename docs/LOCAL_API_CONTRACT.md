# Local API contract

Backend binds 127.0.0.1:4173; same-origin local UI is primary. Public Vercel UI must show disconnected until explicitly connected. No cloud proxying of CSVs. All JSON errors `{error:string}`. No endpoint executes model code.

Implemented v1 routes (selected response fields shown; verify health before claiming live):
- GET /api/health → `{status:'ready'|'setup_required', machine:{chip,memoryGB,freeDiskGB}, runtimes:{ollama:{ready,version?},terse:{ready},relay:{enabled,ready,mode:'local'|'relay',error?}}, models:[], recommendation:null|object, catalog}`. Ready depends on local Ollama and Terse, not Relay; Relay is disabled by default.
- GET /api/state → `{datasets:[],tasks:[],jobs:[],loops:[],recipe:null|object,device:object}` (durable state flattened for UI).
- POST /api/datasets, raw CSV body, Content-Type text/csv, X-Filename encoded filename → `{id,name,bytes,rows,columns:[{name,type,missing}],importMs}`. Streams into ignored app storage; never sends data to Relay.
- POST /api/models/install JSON `{model:'qwen3:4b'}` → `{jobId}`. Approval button initiates download.
- POST /api/tasks JSON `{request,datasetId,measure:{operation:'sum'|'mean'|'count'|'product_sum',column?:string,column2?:string},dateColumn:string|null,groupColumn:string,filterColumn:string|null,negativePolicy:'include'|'exclude',reuseRecipe?:boolean}` → `{taskId,jobId}`. Explicit column choices clarify ambiguous schema. Count counts rows; product_sum multiplies two numeric columns per row. Negative policy applies to selected numeric measures.
- GET /api/jobs/:id → `{id,status:'queued'|'running'|'ready'|'failed'|'cancelled'|'interrupted',stage,progress?:{completed,total},error?,taskId?,result?}`. Poll every 1s; no SSE required initially.
- POST /api/jobs/:id/cancel → `{ok:true}`.
- GET /api/tasks/:id → `{id,request,datasetId,status,plan?,dashboard?,evaluation?,error?}`.
- POST /api/tasks/:id/dashboard JSON `{filter:null|{column,value}}` → dashboard below; no inference required for filters.
- POST /api/tasks/:id/followup JSON `{request}` → `{taskId,jobId}`; reuse saved measure/column definitions and selected local recipe, no Relay setup required.
- POST /api/tasks/:id/evaluate JSON `{}` → `{jobId}`; synthetic retail reporting benchmark (four development and six final questions), then one bounded prompt-adaptation comparison. Keep baseline unless held-out score improves. Results are independent of the uploaded CSV and save a separate reporting recipe; no weight training. See REPORTING_EXPERIMENT.md.

Dashboard: `{kpis:[{label,value}],charts:[{title,kind:'bar'|'line',points:[{label,value}]}],filters:[{column,values:string[]}],source:{name,rows,filteredRows,measure,negativePolicy,dateColumn,groupColumn},model:{id,digest},configuration:string}`. Render labels with textContent, SVG nodes or safe framework escaping. At least group bar + date trend when date exists; absent dates need second useful grouping/chart, never fabricate a timeline.

The pairing and authenticated origin checks below apply to these routes, including health; private endpoints do not allow wildcard CORS. The native app embeds the local interface and pairs automatically. The optional hosted UI requires explicit pairing.

## Pairing contract (v1)
All `/api/*` reads and writes require `Authorization: Bearer <token>`. Backend creates `.local-lab/pairing-token` mode 0600; operator reads locally and enters into hosted UI (memory only). Never put token in URL or bundle. Set `LOCAL_LAB_ORIGIN` to one exact stable HTTPS deployment origin. Backend permits that Origin and its own `http://127.0.0.1:4173`; unknown Origin/Host rejected. OPTIONS permits Authorization, Content-Type, X-Filename and GET/POST only. Vary: Origin, no-store. Direct CLI requests without Origin still need token. Health is protected too. User gesture starts fetch with targetAddressSpace:'loopback'; browser support/permission failures must show actionable disconnected state. Same-origin /app/ uses same pairing token input. No cloud proxy.

- POST /api/tasks/:id/finetune JSON `{}` → `{jobId}`; fixed offline QLoRA experiment after MLX setup. Same Device queue/cancel endpoint. Successful results appear as `task.fineTune` and `job.result`, including raw comparisons, adapter path/hash, model revision and selection. See WEIGHT_FINETUNING.md.

- POST /api/tasks/:id/report → `{jobId}`; trained-adapter whole-file report. Body: `request`, optional validated `mapping`, `excludedProductCodes`, `adapterJobId`. Result persists in `job.result` and `task.liveReport`. See LIVE_REPORTING.md; no date/country filters.

- POST /api/tasks/:id/agentloop → `{jobId}`; conditional candy improvement team with persistent decisions and local durable handoffs by default. Verified Relay handoffs are optional when Relay is explicitly enabled and ready; transport failures fall back locally. GET /api/state includes `loops`. Historical reporting controls require the UI opt-in `?experimental=reporting`; these reviewed recipes do not establish arbitrary-CSV training support.
- GET /api/models/inventory → actual model/adapter sizes, dependencies, selection, last use, retention policy, and labeled first-download estimates. Read-only; no automatic deletion.

Jobs use the same durable Device queue regardless of transport. New local jobs expose `transport:'local-durable'`; optional Relay jobs use `transport:'relay'` and fall back to the local queue under the same job ID when delivery is unavailable. Queued historical Relay jobs recover locally when Relay is disabled. Saved credentials alone never enable Relay. See [local-first operation](LOCAL_FIRST.md) for explicit developer opt-in and recovery details.

### Task-aware setup (additive)

`POST /api/models/recommend` accepts `{request,inputKind?,preferences?:{priority:'balanced'|'speed'|'quality',allowDownload?:boolean,maxDownloadGB?:number}}`. It returns measured `machine`, `runtime`, `requirements`, `selected` (nullable), ranked `candidates`, `catalogVersion`, `catalogSource`, `selectionBasis`, `id`, and persisted `events`. Candidates include compatibility reasons, actual installed state, digest, downloadRequiredGB, memory/disk budgets, tuning limitations and source URL. This endpoint does not install anything. Hardware fixtures are test-only, never accepted from the API.

`POST /api/models/install {model:id}` queues a catalog-allowlisted setup job. It verifies the pinned digest and returns actual `cacheReused` in the result. Existing job cancellation/status APIs apply. `POST /api/tasks` accepts optional `modelId` and preferences; without a dataset/document it creates a bounded text/code task whose `textResult` contains answer and actual model binding. Setup must be completed first. Task model identity remains pinned; follow-ups retain the original identity. Tuning another base returns unavailable instead of applying Qwen weights.

Each job now exposes `events:[{at,actor,phase,status,summary}]`, persisted only on real stage/status changes. Role loops retain their separate actual role decision/handoff evidence. Document result adds `answer` and `synthesis` while preserving `parts` with source spans. See `docs/MODEL_SELECTION.md` for supported artifacts, context limits, hardware estimate definitions and honest built-in catalog fallback.
