# Local Lab

### Local AI for everyday business questions.

Describe what you need, review a model that fits your Mac, and turn a CSV into a useful dashboard. Local Lab brings model setup, analysis and task-specific adaptation into one workflow, while keeping your files and model weights on your computer.

Built for **Haunted Hacks 2026**.

[Download for Mac](https://github.com/bn-19/local-ai-lab/releases/download/v0.5.0.1/Local-Lab-Mac-Installer.zip) · [Try the CSV demo](#try-the-csv-demo-on-your-mac) · [Open the hosted app](https://local-lab-bn-19s-projects.vercel.app) · [Architecture](#architecture)

## Try the CSV demo on your Mac

**Judges: start here.** You need an **Apple Silicon Mac (M1 or later), macOS 14+, and an internet connection**. The demonstrated machine is an M5 MacBook Pro with 32 GB memory; the app checks model compatibility and shows download and memory requirements before you run it. Git, Homebrew and administrator privileges are not required.

**[Download the Mac installer ZIP · v0.5.0.1](https://github.com/bn-19/local-ai-lab/releases/download/v0.5.0.1/Local-Lab-Mac-Installer.zip)** · [Release notes and checksums](https://github.com/bn-19/local-ai-lab/releases/tag/v0.5.0.1)

### 1. Install, start and connect

1. Extract the **entire ZIP**, then double-click **Install.command**. It installs Local Lab into `~/Applications/Local Lab`. This is an **unsigned command-script helper**, not a signed or notarized Mac app. If macOS blocks it, follow the [Mac installation guide](installer/INSTALL.md); do not disable system security settings.
2. In the installed folder, double-click **Start.command**. On first start, it asks permission to create your own Agent Relay workspace for coordination. Keep this Terminal window open while using the app.
3. Open **[the local workspace](http://127.0.0.1:4173/app/)** once startup finishes. Click **Connect your Mac**, then paste your pairing token and click **Connect to my Mac**. To display the token, open a second Terminal window and run:

   ```sh
   cat "$HOME/Applications/Local Lab/.local-lab/pairing-token"
   ```

   Keep this token private. If you chose a different installation folder, use that path instead.

The installer includes the local web interface and companion. The [hosted interface](https://local-lab-bn-19s-projects.vercel.app) can also connect to your running companion; the hosted site alone does not run models. Model weights are a separate, explicitly approved download. First setup takes longer than subsequent runs and depends on your connection and selected model.

### 2. Upload the real CSV and run an analysis

1. **[Download the original candy-data.csv](https://raw.githubusercontent.com/fivethirtyeight/data/4b9d687691091f8e44addfb051a651aebc1a4862/candy-power-ranking/candy-data.csv)** from FiveThirtyEight. If it opens as text, save it as `candy-data.csv`, not an HTML page. This pinned file has **85 entries** and is licensed CC BY 4.0.
2. In **Workspace**, choose that file under **Your data**. In **What do you need?**, enter:

   > Compare candy popularity using matchup win rates. Rank the candies and let me filter chocolate versus non-chocolate entries.

3. Confirm these fields after the CSV imports:

   | Field | Select |
   | --- | --- |
   | Measure | **Average of a column** |
   | Value | `winpercent` |
   | Compare groups by | `competitorname` |
   | Options → Filter dashboard by | `chocolate` |
   | Options → Date column | **No date column** |

4. Click **Review setup**. Review the recommended model and its requirements. If it is missing, click **Download** and wait until it is **Ready**, then click **Run task**. For reference, the reviewed Qwen3 4B download is about 2.5 GB; your actual recommendation is shown in the app.
5. Inspect the generated charts, statistics and **Activity** panel. With all groups included, expect **85 entries** and an **average matchup win rate of 50.32%**. Set the `chocolate` filter to `1`: expect **37 entries** and **60.92%**. Set it to `0`: expect **48 entries** and **42.14%**. These are historical preference scores, not sales figures.
6. Open **Saved tasks** and reopen the result to check persistence. You can also toggle **Halloween mode**. When finished, press **Control-C** in the launcher Terminal or open the installed **Stop.command**; saved work and models remain on your Mac.

This walkthrough runs a real local model and calculates results from the uploaded CSV. **Open sample** is a separate fictional preview and does not run a model. Fine-tuning is optional, requires the separate [MLX setup](docs/WEIGHT_FINETUNING.md), and is not needed for this dashboard.

**Troubleshooting:** Keep the launcher Terminal open. If connecting fails, confirm startup completed, use the local workspace URL above, and check the token from your own installation. If a required port is occupied, the launcher reports it instead of stopping another app. [Full installation and recovery guide →](installer/INSTALL.md)

![Local Lab analyzing the candy dataset in the production Halloween interface](docs/assets/analytics-dashboard.png)

*Actual production capture. The hosted interface connects to a paired local companion; running an analysis requires that companion on your Mac.*

## The experience

1. **Describe your question.** Attach a CSV and explain the analysis you want.
2. **Review the setup.** Check the recommended model, runtime, download size and memory requirements.
3. **Build a dashboard locally.** A local model proposes a bounded analysis plan. DuckDB calculates the values behind the charts, summaries and filters.
4. **Ask a follow-up.** Use the local reporting model for supported rankings, comparisons and aggregations. Confirm ambiguous selections in the interface.
5. **Keep your work.** Saved tasks retain the selected setup, results and recorded Activity. Reopen an analysis without starting over.

Model selection uses explicit compatibility rules over a reviewed catalog. It is not a claim to have benchmarked every available model or found a universal “best” model.

## The demo

> “Which chocolate candies are most popular?”

The main demonstration analyzes FiveThirtyEight's public candy-preference CSV. Rankings, category comparisons and summary statistics come from the actual data. Filters change the underlying calculation. The Halloween switch changes the theme while preserving the same analysis tools.

| A result you can check | Value |
| --- | ---: |
| Dataset entries | 85 |
| Average matchup win rate, all entries | 50.32% |
| Average matchup win rate, chocolate entries | 60.92% |
| Average matchup win rate, non-chocolate entries | 42.14% |

These are historical head-to-head preference scores, not sales, current demand or nutrition measurements. The original dataset includes coin comparison entries. Category differences are descriptive, not causal.

![A real question and response from the local candy-reporting model](docs/assets/local-question-answer.png)

*The model interprets the question; trusted operations calculate the answer. The confirmed Chocolate/Fruity/All selection stays visible.*

### Adaptation with evidence

Local Lab can evaluate a reviewed reporting recipe and attempt bounded MLX QLoRA training when development checks justify it. A candidate is selected only when it improves the measured comparison; ties retain the current setup.

One measured candy-adapter experiment improved **26/33 → 29/33** on authored, held-out instruction-mapping checks. Training and evaluation took **115.767 seconds** on an Apple M5 MacBook Pro with 32 GB memory. The baseline was an existing adapter, not the untuned foundation model. These small synthetic checks do not establish general analytics accuracy.

**The reporting adapter and dashboard planner are separate.** Fine-tuning supports the reporting workflow; it is not presented as the source of the dashboard's arithmetic. [Experiment and transport evidence →](docs/AGENT_LOOP_AND_STORAGE.md)

## Why the infrastructure matters

| Component | Its job in Local Lab |
| --- | --- |
| **Terse Durable Actors** | Persist tasks, job attempts, selected configurations and results. A Device actor owns the queue so heavy local jobs run one at a time. |
| **Agent Relay** | Coordinate Planner, Evaluator and Trainer work using correlated requests and receipts. Recorded status distinguishes Relay delivery from an explicit local durable fallback. |
| **Supabase** | Share a read-only catalog of reviewed model identities and versions. Private files, task contents and weights are not stored in that catalog. |
| **Ollama / MLX** | Run supported models locally; MLX provides the separate Apple Silicon reporting-adapter training path. |
| **DuckDB** | Import the CSV and execute validated calculation templates. The app does not execute model-written SQL, Python or shell. |
| **Vercel** | Serve the interface. CSV uploads go directly to the paired local companion, not through a Vercel API. |

Activity exposes recorded work and supporting evidence. A completed pipeline step is not automatically treated as a successful model evaluation.

## Architecture

```mermaid
flowchart TB
    Vercel["Vercel · frontend assets"] --> Browser
    subgraph Mac["On your Mac"]
        Browser["Browser interface"] -->|"Paired localhost API"| Companion["Local companion"]
        Companion --> Models["Ollama / MLX · local models"]
        Companion --> Data["DuckDB · selected CSV files"]
        Companion --> State["Terse · Project and Device actors"]
    end
    Companion <-->|"Coordination IDs and aggregate findings"| Relay["Agent Relay"]
    Companion -->|"Reviewed public metadata only"| Catalog["Supabase model catalog"]
```

Raw inputs, outputs, adapters and credentials stay in ignored local storage. Relay receives coordination metadata rather than CSV rows or raw answers. The optional shared catalog falls back to reviewed built-in metadata when unavailable. A project directory or virtual environment is not an operating-system sandbox.

## Quick start

**For developers installing from source.** Judges can use the [Mac installer walkthrough above](#try-the-csv-demo-on-your-mac) instead of these commands.

The supported runtime is **Apple Silicon macOS** with **Node.js 22+** and enough memory and disk for the selected model. The demonstrated machine is an M5 MacBook Pro with 32 GB unified memory. Model downloads and initial runtime setup require a network connection.

### 1. Install the project

```sh
git clone https://github.com/bn-19/local-ai-lab.git
cd local-ai-lab
npm ci
npm --prefix web ci --ignore-scripts
npm --prefix web run build
```

### 2. Prepare the local services

The runner expects the official Ollama executable at `.local-lab/runtime/ollama`. If the Ollama CLI is installed and available on your `PATH`, a fresh checkout can reference it with:

```sh
mkdir -p .local-lab/runtime
ln -s "$(command -v ollama)" .local-lab/runtime/ollama
```

For the coordinated initial workflow, configure Agent Relay with `npm run setup:relay`. This creates or reuses a dedicated workspace and saves credentials in ignored local storage. [Installation, identity setup and recovery →](docs/IMPLEMENTATION.md)

Start each service in a separate terminal:

```sh
npm run runtime:actors
```

```sh
npm run runtime:ollama
```

```sh
npm run dev
```

### 3. Connect and analyze

Open the [hosted app](https://local-lab-bn-19s-projects.vercel.app) or [local interface](http://127.0.0.1:4173/app/). Read `.local-lab/pairing-token` locally and enter it in **Connect your Mac**. The token is held in the browser tab's memory; do not put it in a URL or commit it. Your browser may request permission to access the local service.

Attach a CSV, describe the question, review the model recommendation and approve any required download. Adapter training is optional and needs the separate [MLX setup and reviewed recipe](docs/WEIGHT_FINETUNING.md). A clean checkout does not include weights, private inputs or precomputed results.

## Validation and current scope

- The production walkthrough exercised pairing, the real candy dashboard, filters, a local-model reporting request, saved Activity and reconnect behavior.
- Candy results were checked against independent calculations from the original CSV. A separate public Online Retail check processed **541,909 rows**; that is not the 85-entry candy fixture.
- Short whole-document PDF summarization and a follow-up passed the documented checks. Longer-document synthesis remains limited and fails closed when source evidence does not validate.
- Task support comes from reviewed models and tool recipes. Arbitrary model installation, arbitrary code execution, universal fine-tuning, audio generation and diffusion are not advertised as completed features.
- Experimental vision research is outside the verified analytics demo. A separate classifier-training preview is not evidence of reliable candy-pile detection or counting.

[Analytics measurements](docs/IMPLEMENTATION.md) · [PDF acceptance](docs/PDF_SUMMARIZATION_ACCEPTANCE.md) · [Model selection](docs/MODEL_SELECTION.md)

## Development

```sh
npm run check
npm test
npm --prefix web test
npm --prefix web run build
```

The working frontend is in `web/`; the local API is `server.mjs`. Actor, model, data and coordination modules live in `lib/`. Integration scripts under `scripts/` require running services and their documented public fixtures. Legacy root HTML/CSS/JS files are preserved design artifacts, not the deployed frontend.

## Documentation

| Guide | What it covers |
| --- | --- |
| [Start here](START_HERE.md) | A short route through the project for reviewers and contributors |
| [Implementation](docs/IMPLEMENTATION.md) | Setup, recovery, security boundaries and measured runs |
| [Local API](docs/LOCAL_API_CONTRACT.md) | Browser-to-companion contract |
| [Activity](docs/ACTIVITY.md) | Task-scoped status, recorded steps and evidence |
| [Agent loop and storage](docs/AGENT_LOOP_AND_STORAGE.md) | Role decisions, promotion gates, transport receipts and inventory |
| [Shared model catalog](docs/SHARED_MODEL_CATALOG.md) | Supabase schema, read-only policies and fallback behavior |
| [Dataset sources](docs/DATASETS.md) | Attribution, licenses and fixture provenance |

### Credits

Built with Terse, Agent Relay, Supabase, Ollama, MLX, DuckDB and Vercel. The candy dataset is [FiveThirtyEight's candy-power-ranking](https://github.com/fivethirtyeight/data/tree/master/candy-power-ranking), used under **CC BY 4.0**. Screenshots show the working production interface, not generated mockups.
