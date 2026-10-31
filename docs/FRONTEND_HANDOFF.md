# Frontend handoff

Owner: frontend chat. Source exclusively `web/**`; self-contained dependency-free static package. Backend owns root server/config and `docs/LOCAL_API_CONTRACT.md`.

## Target and deployment

Primary target: HTTPS Vercel page → explicitly paired 127.0.0.1:4173 companion → actual CSV → local model → trusted dashboard/filter. Local `/app/` is the fallback, not primary acceptance. Stable production origin pending initial deployment; Vercel team `bn-19s-projects` / `team_WaM4lJ6JTqrc4MHhK74G77Me`, project `local-lab`.

## Integration

- All routes follow v1 LOCAL_API_CONTRACT.md; bearer token in Authorization, held only in memory. No hosted loopback probe before pairing button. No cloud proxy.
- Fixed `http://127.0.0.1:4173` endpoint, `targetAddressSpace: 'loopback'`, omit credentials, reject redirects, no-store. Token cleared on disconnect/reload. CSV POST uses raw File body, text/csv and encoded X-Filename.
- Backend must validate exact origin, Host, bearer token on reads/writes and scoped OPTIONS. Local same-origin path may operate without pairing if backend allows. Serve `web/dist/` under `/app/` with trailing slash; relative assets work there and Vercel root.
- CSP explicitly permits connect-src self and ONLY http://127.0.0.1:4173. No scripts/fonts/CDN dependencies.
- User chooses operation, measure columns, date, grouping, filter and negative policy. Job status is polled; real output, cancellation/errors and saved tasks displayed. Sample dashboard is fictional and explicitly labeled; never substituted for model output.
- Activity uses actual jobs plus optional state.activity; evaluation shows actual returned measurements. Missing Relay/Terse remains visible.
- Local build: `npm --prefix web run build`; frontend-only preview: `npm --prefix web run dev` (4174, no backend). Real app: backend `npm run dev`, `/app/`.

## Browser connection evidence

Chrome 156.0.8078.79 installed (version-only command, no browser session). Current Chrome docs require secure hosted context, user-gesture LNA permission and ordinary CORS; unsupported browser permissions must surface actionable connection errors. No security-disabling flags or personal profile.

Sources: https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access and https://developer.mozilla.org/en-US/docs/Web/API/Request/targetAddressSpace .

Build/syntax and nonbrowser adapter tests precede deploy. Hosted-to-local browser acceptance is pending specifically approved isolated browser session and ready backend. Do not claim browser integration from curl alone.
