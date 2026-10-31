# Optional shared model catalog

The local companion can GET intentionally public model metadata from one existing Supabase project. The demo works without it. No project/account has been configured in this checkout: **Built-in catalog / not synced** is the actual current state. The SQL is prepared, not applied; live SELECT and client write denial remain unverified until project access is connected.

## Setup in an existing project

1. Run `supabase/catalog/001_catalog.sql` as the project database administrator. It creates only `public.local_lab_model_catalog`, its read policy and two reviewed seed rows in one transaction. It deliberately fails if the table already exists, protecting unrelated objects. Do not rerun it over an existing catalog.
2. Run `supabase/catalog/002_verify.sql` in the SQL editor or psql. This transaction rolls back and checks RLS, seed visibility and blocked client writes. It is a verification script, not a migration.
3. Set `LOCAL_LAB_SUPABASE_URL` and `LOCAL_LAB_SUPABASE_PUBLISHABLE_KEY` in the **local companion's environment**, then restart it. A legacy `LOCAL_LAB_SUPABASE_ANON_KEY` JWT is also supported. Do not put values in source, browser bundles or chat. The adapter rejects secret/service-role keys. No additional npm dependency is needed.
4. Run `node scripts/shared-catalog-check.mjs --verify-write-denial` with the same environment. Exit 2 means built-in fallback, not a successful connection. Success prints actual remote source/version, selected model under explicitly labeled fixture hardware, and write-denial HTTP statuses. It does not infer/train/download. Empty insert and impossible empty-id UPDATE/DELETE filters cannot mutate existing catalog rows; they must still return permission denial. The script also checks missing-key write rejection.
5. Exercise the existing paired `POST /api/models/recommend` to see `catalogSource.kind: "supabase"`, `status: "synced"` and the real release `version`. That endpoint already uses this adapter; no new route is required. `catalogVersion` remains the local reviewed trust baseline; `catalogSource.version` is the shared snapshot version.

Use a connected Supabase integration to apply these named objects when access is available. Do not create a paid project or change unrelated tables. All writes are trusted administrator SQL only. No admin key belongs in the runtime. Schema ownership and grants must be rechecked if project-wide defaults/policies change.

## Safety and semantics

The table contains exactly model id, pinned artifact digest, release version and enabled flag. Rich runtime/task/license/source metadata remains in the reviewed local catalog. Cloud metadata cannot introduce installers, shell commands, repositories or unreviewed digests. Disabled rows are also validated. Empty/all-disabled, duplicate IDs, mixed releases and unreviewed rows reject the entire snapshot and use the reviewed built-in catalog. This is optional discovery metadata, **not a remote emergency kill switch**.

For a new release, the administrator replaces the complete snapshot in one transaction with one version across all rows. The primary key prohibits duplicate model IDs; the client verifies release consistency. Any new artifact requires local code review before cloud publication. Old task model identities stay pinned.

RLS is enabled; `anon` and `authenticated` receive SELECT only and a scoped read policy for this deliberately public table. No client write grants/policies are added. No private inputs, task prompts, paths, hardware, machine IDs, weights, adapters, benchmarks, jobs, actor state or telemetry are uploaded. Requests reveal ordinary network metadata (such as source IP) to the configured service. Task classification and hardware ranking run locally. Terse continues to own job reservations; the catalog cannot start work.

GET has a 2.5-second total deadline, redirect rejection, 16 KiB streaming body cap and 20-row validation cap (requests 21 to detect overflow). Successful and failed attempts cache for 60 seconds, concurrent reads share a request, and connection changes invalidate the cache. Refresh failure immediately falls back rather than representing stale cached metadata as synced. Calls happen during recommendation, not inference or job polling. `checkedAt` is the successful fetch timestamp, not a new activity on every cache hit.

The compatible source contract is `{kind:'built-in'|'supabase',version,status,reason?,checkedAt?,scope?}`. Display **Shared catalog · [version]** only for `kind:'supabase', status:'synced'`; otherwise **Built-in catalog**, with `reason` in details. Do not fabricate sync events. Private files remain local.

## Verification evidence

`node --test test/shared-catalog.test.mjs` covers mocked successful reads and local ranking, missing/invalid config, correct public key headers, admin key rejection, failures/timeouts, malformed/oversized/unreviewed/mixed/duplicate rows, coalescing/cache/connection changes and seed digest agreement. These are **local mocked tests**, not cloud evidence. The SQL verification requires actual PostgreSQL/Supabase access and has not yet run. No Chrome session is needed.

Official references checked October 31, 2026: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [key migration and raw HTTP headers](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys), [RLS and explicit read grants](https://supabase.com/docs/guides/database/postgres/row-level-security). Publishable keys go in `apikey` only; legacy anon JWTs additionally use Bearer authorization.
