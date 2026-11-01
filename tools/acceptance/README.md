# Standalone Mac CSV acceptance

Dependency-free Node **22+** CLI. Run against the exact packaged application's already running local companion after native setup. It does not launch apps, runtimes or browsers, install models, tune models, delete saved state, or inspect unrelated tasks. It imports one public dataset and creates one real analytics task through the existing API and its Terse Device queue. These remain saved for inspection. Creating a task also updates the application's normal latest recipe pointer; run during an agreed acceptance window.

```sh
node tools/acceptance/run.mjs \
  --base http://127.0.0.1:4173 \
  --token-file '/absolute/path/to/installed/.local-lab/pairing-token' \
  --report '/absolute/path/outside/git/mac-acceptance.json'
```

Use the actual candidate's token file; do not paste the token into arguments. All API calls send Authorization headers, never URL credentials. The report file must not exist (exclusive creation, mode 0600). Keep generated reports outside Git. Output to the terminal is a status summary, never a token. Response errors are not echoed. Literal token occurrences are redacted from the report as a final defense.

The runner downloads only the pinned public CSV over HTTPS. For offline use, download it in advance and add `--csv /absolute/path/candy-data.csv`; the same SHA256 verification is mandatory. No model downloads occur. Use `--model ID` to choose an already installed compatible candidate; otherwise the first installed compatible ranked candidate is selected. `--timeout-seconds 600` defaults to ten minutes (1–3600 allowed) for job polling. Individual API requests allow 15 seconds, or 60 seconds for task creation because it awaits the real Relay send. Task creation is never automatically retried. Explicit numeric loopback HTTP origins only; no redirects. Node's normal TLS trust applies to the public download.

Exit codes: **0** API acceptance passed, **1** failed after task creation, **2** incomplete before task creation (including missing model/runtime/auth/fixture). Invalid CLI arguments or inability to create a report exit nonzero without a report. Failed, interrupted or cancelled jobs cannot pass. On timeout, error or SIGINT/SIGTERM, only a returned test job with matching job/task IDs is eligible for cancellation, after an active-state check. A lost task-creation response cannot safely identify a job to cancel; inspect the companion locally. No global stop, queue reset or deletion endpoints are used.

## Fixture and independent oracle

[FiveThirtyEight candy-power-ranking CSV](https://raw.githubusercontent.com/fivethirtyeight/data/4b9d687691091f8e44addfb051a651aebc1a4862/candy-power-ranking/candy-data.csv), revision `4b9d687691091f8e44addfb051a651aebc1a4862`, CC BY 4.0, attribution: FiveThirtyEight. [License](https://github.com/fivethirtyeight/data/blob/master/LICENSE).

SHA256: `46c17cdb8c0212bc3e0cee2a9617a75d1ce642cd1559c332b1d9a2c4ed19b8cb`.

Historical matchup preference scores, **not sales**. Includes original comparison entries. Original bytes are verified and uploaded unchanged. An independent JavaScript CSV parser and arithmetic implementation (no application/DuckDB imports) calculates expected values, group rankings and category means. The runner compares both charts, KPI values, counts, measure metadata and filter choices with absolute tolerance `1e-6`. The top-12 chart permits tied groups in arbitrary order. All/chocolate/non-chocolate reference counts and means are respectively 85 / 50.3167638117647, 37 / 60.9215294, 48 / 42.142257; these displayed reference means are not used as output charts or substituted for calculations.

`core.mjs` exposes calculation/verification helpers for supported count, sum, mean and product_sum measures. The CLI intentionally remains the pinned candy recipe with no dates, mean winpercent by competitorname, chocolate filter, negatives included. Broader CSV recipes should supply their own pinned identity and explicit schema; this is not an arbitrary analytics harness.

## Requirement / evidence checklist

| Requirement | Evidence and limits |
| --- | --- |
| Real machine and recommendations | Protected health machine/platform/architecture/runtimes, task-aware ranked recommendation with downloads disabled. Missing setup is incomplete. |
| Selected model/digest | Actual installed inventory matches compatible candidate; saved task and dashboard bindings must match. No inference substitute. |
| Actual model job output | Terminal `ready`, saved validated plan, positive output-token count and elapsed time, own job usage/events/result. Raw model text is **not exposed** by this API and is not claimed. |
| Source identity | Pinned public URL/revision/license in dataset evidence. **Packaged app source/build identity unavailable** in current health contract; no operator label establishes it. |
| Dataset/hash | Hash verified over the exact bytes submitted; imported bytes/rows checked. Server does not expose stored file hash/source URL, so server-side byte identity is not independently verified. |
| Counts/means/filter results | Independently computed all/1/0 cases, actual dashboard responses, top-12 group values and category chart values, tolerance. |
| Persistence | Separate saved task reads compare model/plan/measure/dashboard/measurement. This does not prove restart durability or UI reopen behavior. |
| Transport/fallback | Own job's viaRelay/requestMessageId/relayError/events when present; absence does not prove a transport. Not a direct Device actor reservation audit or independent Relay receipt verification. |
| Native UI/file picker/readiness/ownership | **Not checked. Master Mac responsibility**, including exact bundle/source, private owned-launcher readiness nonce, readiness event, process ownership and lifecycle. |
| Optional tuning | Not requested or performed; saved configuration is recorded as returned, with no tuning claim. |

A `passed` report means this API-level acceptance passed; native checks deliberately remain `not_checked`. Health readiness is never treated as native frontend readiness or packaged source proof. Reports contain only shared public machine/model metadata plus this run's public fixture/task/job; `/api/state` and unrelated saved tasks are never read. Real model output is untrusted evidence, never executed.

## Portable checks (no browsers)

Inspect these scripts before execution, as with other repository checks:

```sh
node --check tools/acceptance/core.mjs
node --check tools/acceptance/run.mjs
node --test tools/acceptance/core.test.mjs
npm run check
```

Tests are explicitly **unit tests** using synthetic CSV rows and fetch/job doubles. They cover hash failure, CSV quoting/errors, independent arithmetic, incorrect dashboards/filter results, URL/auth restrictions, HTTP failure, terminal job failure, timeout and owned-job cancellation. They never write an acceptance evidence report or claim real local-model success. The real Mac invocation above remains required.
