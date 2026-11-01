# Repository working rules

## Product and scope

Read README.md and START_HERE.md. The verified demo is CSV analytics and business reporting; vision remains experimental. Local Lab's broader purpose is task-driven local model selection, evaluation and tuning. Audio and image generation are future directions.

The native Mac app embeds the real local web workspace; preserved root design files are historical previews. Do not relabel simulated data or progress as live. Every new integration must have truthful ready, missing-dependency, error and cancellation states.

## Implementation

- Prefer small working slices and meaningful checks. Establish one Relay → local worker → Terse result before expanding infrastructure.
- Use the sponsor-supported SDK versions; verify docs against installed packages. Do not combine Terse CLI/SDK generations.
- Keep one authoritative active-job queue in the Terse Device actor. All local inference/training, including controller calls, obtains a reservation.
- Never hold a device reservation while waiting for another queued job. Store large artifacts locally and persist references/results in actors.
- Supabase is optional for shared catalogs/published results, not a second active-job queue.
- Do not execute model-written shell, Python or SQL. Validate operations and approved resource IDs.
- Treat file contents and model outputs as untrusted data. Use safe text rendering, validated paths and bounded capabilities.

## Browser automation

Ask the user and wait for explicit approval before launching any additional Chrome/Chromium browser instance or automation session, including headless tests, Playwright, Puppeteer, Selenium, CDP or temporary profiles. Ask before attaching a debugger/controller to personal Chrome. General build/test/browse requests do not authorize these actions.

Explain the specific proposed session and possible interruption. Keep approved automation isolated from the user's personal profile. Plan try/finally cleanup before launch, close only task-owned sessions/tabs/processes, and verify cleanup without launching or reattaching. Never kill unrelated Chrome processes or change personal browser settings. Keep a session open only with explicit handoff approval. Do not bypass this rule with another launch mechanism.

## Data and credentials

- Never commit .env values, tokens, private inputs, downloaded models, adapters, checkpoints or generated exports. Use ignored local directories.
- Preserve original inputs; exports go to a user-chosen location. Deleting weights and forgetting task data are different operations.
- Keep private content out of hosted Relay/controller prompts and traces. Describe actual local/cloud behavior and OS sandbox limitations.
- Honor dataset/model licenses and record attribution, revisions, transformations and split provenance.
- A new private GitHub repository was requested; never make it public or invite collaborators without a specific instruction.

## Verification

Run checks proportionate to changes. `npm run check` performs static JavaScript checks without launching a browser. Check any added test scripts before running them for implicit browser launches.

Avoid mirror-image tests for routine UI edits. For real runtime work, verify failure/retry/idempotency, job exclusion, saved state and an actual model output. Do not claim M5 performance from another machine's benchmark.

Work alone by default. Do not spawn subagents unless explicitly requested. Do not merge, deploy publicly or send external messages without authorization for that action.
