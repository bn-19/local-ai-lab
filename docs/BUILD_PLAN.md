# Hackathon execution plan

Current demo: **candy recognition + data analytics**, powered by a shared local task/model/tuning system. Audio and diffusion are future recipes. This document supersedes earlier analytics/audio demo recommendations.

[Official event](https://events.ycombinator.com/haunted-hacks-2026): October 31, 2026, hacking 11 a.m.–4 p.m. Pacific. All application code must be created at the hackathon. Builderbase signup/submission details come from check-in. Confirm allowed cached assets and sponsor versions with organizers.

| Time, Pacific | Completion gate |
| --- | --- |
| 11–12 | Confirm setup, pin supported packages and get a real Relay → local worker → saved Terse result path. Use the design starter instead of rebuilding the shell. |
| 12–1 | Finish one baseline task, selected by actual data/runtime readiness. A usable result is more valuable than two unfinished pipelines. |
| 1–1:45 | Add the second baseline recipe using the same queue/result flow. |
| 1:45–2:15 | Optional bounded optimization or one training pilot, only if both baseline paths work. |
| 2:15–3 | Freeze recipes; final held-out checks, cancellation/recovery and file-boundary verification. |
| 3–3:40 | Rehearse the story, capture real results and record a backup. |
| 3:40–4 | Submit through Builderbase and verify required links. |

## Team split

- Boaz: task UX, Terse Project/Device actors, analytics measures/calculation panel and presentation.
- ML/software partner: model/runtime adapters, candy data/model baseline, Relay workers and evaluation.
- Together: request/result contract, data splits, pilot budget and the first shared integration.

For friends joining, assign a bounded component and separate branch. Do not have everyone independently rewrite the shell or orchestration. Coordinate ownership before parallel file edits.

## Data and training gates

Candy requires approved images with labels matching the actual target types. Boxes/counts require bounding boxes. Public datasets with only a generic candy class are not brand datasets. If matching labels are unavailable, use approved hand-labeled images or narrow the demo; do not invent brand coverage.

Run a short vision pilot and measure time per epoch before choosing a training duration. For a text adapter, earlier planning allowances were roughly 1.5–3 hours including data/setup/evaluation; no M5 benchmark establishes that duration. The app must work using a baseline if training does not fit or improve results.

## Cut decisions

If the shared path is not working by noon, pair on it. If the second recipe is blocked at 1:45, finish the first and label scope honestly. Cut extra model comparisons, weight training, accounts, Supabase and future modalities before removing a useful result or meaningful use of both repos.

## Demo story

1. A person describes a candy or analysis task and approves a proposed setup.
2. Show a real agent handoff, device reservation and saved task state.
3. Produce an actual prediction or computed chart on a new input.
4. Show a measured failure-driven change if one was performed; otherwise explain the baseline result.
5. Restart between jobs and recover progress; optionally wake deferred work with a short actor alarm.

Confirm held-out outputs, supported classes/units, original-file preservation, cancellation, no duplicate heavy jobs, exports and metadata. Label recorded/cached trials. The initial UI illustrations must never become fake benchmark evidence.
