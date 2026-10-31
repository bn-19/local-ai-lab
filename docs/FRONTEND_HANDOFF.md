# Frontend handoff

## Edit and deploy

- Private repository: https://github.com/bn-19/local-ai-lab
- Working / Vercel production branch: `codex/analytics-workflow`.
- Live site: https://local-lab-bn-19s-projects.vercel.app
- Vercel project: `local-lab`, team `bn-19s-projects`.
- GitHub is connected to the existing Vercel project. Pushes to this branch automatically deploy production; other branches get previews. Do not assume `main` updates the demo.
- Vercel builds only `web/`: `npm ci`, `npm run build`, output `dist`, Node 22. No backend dependencies or private data enter the frontend bundle.
- Frontend source: `web/index.html`, `web/src/app.js`, `web/src/api.js`, `web/src/dashboard.js`, `web/src/styles.css`. No framework/dependencies.
- Checks: `npm --prefix web test` and `npm --prefix web run build`. Frontend-only local preview: `npm --prefix web run dev` (4174). Real companion: root `npm run dev`, UI at `/app/`.

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

One isolated Chrome session is explicitly approved for the final deployed-origin Bike workflow, responsive checks, evaluation display and disconnect. Cleanup must close only its temporary browser/profile and verify no task-owned process remains. Browser results will be appended after the run.
