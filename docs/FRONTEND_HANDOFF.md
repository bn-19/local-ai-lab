# Frontend handoff

## Edit and deploy

- Private repository: https://github.com/bn-19/local-ai-lab
- Production branch: `main`. Create a separate feature branch for UI work.
- Live site: https://local-lab-bn-19s-projects.vercel.app
- Vercel project: `local-lab`, team `bn-19s-projects`.
- GitHub is connected to the existing Vercel project. Pushes and merges to `main` automatically deploy production; other branches get previews, subject to Vercel contributor permissions.
- Vercel builds only `web/`: `npm ci`, `npm run build`, output `dist`, Node 22. No backend dependencies or private data enter the frontend bundle.
- Frontend source: `web/index.html`, `web/src/app.js`, `web/src/api.js`, `web/src/dashboard.js`, `web/src/styles.css`, `web/src/activity.js`, `web/src/activity-state.js`. No browser runtime dependencies; LinkeDOM is a development dependency for browser-free DOM tests.
- Checks: install test dependencies with `npm --prefix web ci --ignore-scripts`, then `npm --prefix web test` and `npm --prefix web run build`. Frontend-only local preview: `npm --prefix web run dev` (4174). Real companion: root `npm run dev`, UI at `/app/`.

## Design

Impeccable product register, light paper/pine palette. Removed taglines, explainer sidebar, future-recipe promotion, helper paragraphs, repeated chart labels and footer copy. The workspace is task → CSV → column controls → dashboard. Necessary form labels remain. Model details, source/measure provenance and data-access facts use disclosure controls. Sample outputs remain explicitly labeled. Second measure input appears only for multiplication.

## Backend boundary

Follow `docs/LOCAL_API_CONTRACT.md`. API endpoint is fixed to `http://127.0.0.1:4173`; no cloud proxy. Both local and hosted pages require explicit bearer pairing. Token is generated at `.local-lab/pairing-token` (0600), held only in tab memory, and cleared on disconnect/navigation. No token in URL, storage or bundle.

Backend allowlist must match the exact live origin above. Browser requests use `targetAddressSpace:'loopback'`, no-store, omit cookies and reject redirects. Hosted pages never probe loopback before pairing. CSP allows only self and that fixed loopback endpoint. Browser permission/CORS/auth failures are surfaced; no security-disabling flags.

CSV uploads are raw `File` bodies with text/csv and encoded X-Filename. New tasks use `reuseRecipe:false` to exercise Relay; follow-ups use the saved local recipe. Jobs expose actual status, errors/cancellation. Evaluation polls the task's evaluation actor until the entire multi-job pipeline completes. Activity displays persisted Relay request/received/completion IDs and Device state. Never replace real results with sample data.

## Verification

Build and adapter tests pass. Actual authenticated health/state and exact-origin OPTIONS verified: 204, precise allow-origin/headers, Vary Origin, no-store; tokenless401 and unknown-origin403. GitHub visibility remains PRIVATE.

Backend independently verified UCI Bike Sharing day.csv (CC BY4): sum cnt, date dteday, group season, filter workingday. 731 rows / 3,292,679 rides; workingday=1:500 rows /2,292,410. Real Qwen3:4b plan and correlated Relay request/completion persisted. Baseline and tuned configuration each passed4/4 checks, held-out2/2; baseline retained.

Backend also verified UCI Retail541909 rows/47.8MB, revenue9,747,747.934, saved-recipe follow-up, cancellation/alarm/recovery. These are backend measurements, not browser timing claims.

Browser acceptance completed on the deployed origin with explicit session approval; see results below. All test-owned browser resources were closed.

Git deployment requires GitHub to recognize the commit author and Vercel to authorize that contributor. The initial machine-default email was unrecognized; this checkout now uses the authenticated owner's GitHub noreply address. Friends should use their own verified GitHub identity and their authorized Vercel account, never borrow another author's identity. No collaborators were invited and no paid plan was enabled.

First approved browser session ended before any loopback request. Native Window.fetch was invoked with the adapter as its receiver; the adapter now binds it to globalThis, with a targeted regression test. Browser/profile cleanup verified zero owned processes. Subsequent verification is complete below.

Vercel team is on Hobby. Private-repository commits from another contributor require Pro and authorized team membership for Git auto-deployment. The owner-authored Git push was verified READY; this does not mean arbitrary contributor commits are permitted. No subscription upgrade or collaborator invite was made.

## Completed hosted-browser acceptance (2026-10-31)

Tested deployed frontend `aae80fb69da3988f2bb7c49e13db4e50f1b5fe36` on the actual HTTPS production origin in isolated Chrome156. No CORS/LNA disabling; only origin-scoped loopback permission. A prior replacement run confirmed pairing/import but stopped on a Playwright inspector-cache read; the final separately approved run verified rendered UI instead.

- No loopback requests before pairing; denied permission leaves disconnected; bad token rejected; valid token connects.
- Browser-selected UCI Bike CSV imported731rows in26ms. Actual Qwen3:4b model plan3142ms, including1539ms load; model digest359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7.
- UI displayed two real charts and3,292,679 rides/731rows. Working-day filter displayed2,292,410 rides/500rows, matching independent calculations.
- Task08d7f493-73b6-4ad8-b0af-d6e1be0ac47b; job801efa44-0d51-4471-92c7-f9b1c9841c98. Relay request and receipt242367939327848448; completion and receipt242367992004112384.
- Saved task visible; actual baseline/candidate held-out2/2 comparison displayed with baseline retained; Relay details visible. Saved recipe evaluation remained complete after new task.
- Responsive390px layout: no horizontal overflow. No uncaught page errors. Disconnect cleared token and rendered private results.
- Browser closed, temporary profile removed, process check found zero test-owned processes. Backend remains running with idle Device queue for the demo.

Local evidence: `/tmp/local-lab-browser-final/evidence.json`, `dashboard-desktop.png`, `dashboard-mobile.png`. These contain public-fixture results only and are intentionally not bundled or committed.

## Design and live activity update

Consistent outline navigation icons, a 4px spacing rhythm, a dominant trend chart and quieter comparison chart refine the existing paper/pine design. Copy stays minimal; receipts are available under Run details and recorded-step disclosures.

`web/src/activity.js` renders task-scoped persisted job evidence from `activity-state.js`; Planner/Evaluator/Trainer labels appear only when optional role events are supplied by the companion. See [Activity compatibility and verification](ACTIVITY.md). The API observer starts only after explicit pairing, refreshes every second during queued/running work and every four seconds while idle, and stops on disconnect or when no subscribers remain. Late responses after disconnect are discarded. Errors show an explicit retry state; no simulated agent progress is introduced. `app.js` publishes selection changes to the existing observer so Activity follows the opened or newly created task; the separate Monitor remains device-wide.

Design guidance: Impeccable and [Unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky (heydamir), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), adapted to the existing product palette and layout. This revision was checked with Node tests and the static build; the browser acceptance above applies to its stated earlier revision.

## Monitor and Halloween design release

Workspace-only Halloween switch uses a generated pumpkin icon, sliding toggle and reduced-motion-aware artwork transitions. Monitor replaces Activity with persisted job steps, elapsed time, history-based ETA and an explicitly partial cloud API-fee estimate. Removed the public Halloween demo shortcut. Setup collapses behind Edit setup after results; optional controls and workflows use disclosures. Document input UI needs the updated local companion; existing CSV endpoints remain unchanged.

This frontend release intentionally excludes the in-progress model-inventory and agent-loop modules/hooks. They remain in the shared working copy with all uncommitted backend work. Do not reset that checkout to the release. Monitor timing/token estimates appear only when the companion supplies the corresponding telemetry; historical missing usage is not fabricated.

Release verification: 14 frontend tests and static build on the isolated release snapshot. No new browser session. Artwork source notes are in web/assets/halloween/ATTRIBUTION.md; generated-icon provenance is in GENERATED.md.
