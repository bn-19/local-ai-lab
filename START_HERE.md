# Start here

Local Lab helps a person choose a compatible local model and use it for a concrete task. The current focus is **general CSV analysis and local model tasks on a Mac without a cloud account**. Start with the [local-first guide](docs/LOCAL_FIRST.md) and v0.7.0.0 download.

## Reviewing the project

1. Read the [README](README.md) for the product, actual production screenshots and demo results.
2. Follow [Try the CSV demo on your Mac](README.md#try-the-csv-demo-on-your-mac) to download the native Mac app, complete its setup and reproduce the candy dashboard. The app starts and pairs its own local companion; the hosted site is optional and is not a cloud inference service.
3. Inspect [the local API](docs/LOCAL_API_CONTRACT.md), [Activity evidence](docs/ACTIVITY.md) and [the agent loop](docs/AGENT_LOOP_AND_STORAGE.md) for how work is performed and saved.
4. Use [the run guide](docs/IMPLEMENTATION.md) and [dataset sources](docs/DATASETS.md) to reproduce an analysis.

The main candy demo uses 85 historical preference entries. Rankings and comparisons are calculated from that CSV. Reporting-adapter evaluation scores are a separate measurement of instruction interpretation, not dashboard values.

## Contributing

Read [AGENTS.md](AGENTS.md), then follow the README's setup and validation commands. The production frontend lives in `web/`; preserved root design files are historical artifacts.

Keep one authoritative heavy-job queue in the Terse Device actor. Preserve originals and keep files, weights, credentials and generated results in ignored local storage. Validate model outputs before executing bounded tools. Obtain session-specific approval before any Chrome automation.

Model selection, text/code tasks, bounded document answers and CSV analysis share the task infrastructure. Vision code and other research paths do not establish universal task support. Refer to the linked acceptance reports before expanding a capability claim.
