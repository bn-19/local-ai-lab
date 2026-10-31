# Autonomous model tuner (branch `tuner/vision-recipe`)

Describe a model and how you want it tuned; three roles run the loop on your machine until the rounds are used up.

- **Executor** runs the recipe script with a config and gets metrics back.
- **Judge** is the held-out split inside the recipe: a round is promoted only if held-out accuracy strictly improves. Tie keeps the previous best.
- **Proposer** is the local Qwen3 model. It sees development accuracy, confusions and per-class results, never held-out, and returns exactly one knob change within the recipe's bounds. Out-of-range values are clamped; non-numeric ones fail the round.

Each round is a Terse `Device` queue job (`tune-round`, `tune-propose`). State lives in the `Project` actor under `tuning:<id>`. The proposer request goes Planner → Evaluator over Relay with IDs and aggregate development scores only. Kill the backend between rounds and restart it: the queued job is re-enqueued and the run continues from the next round. A kill mid-training leaves an active attempt, which needs the documented recovery step like any other job.

## Recipe contract

A recipe is a directory under `recipes/<name>/` with a `train.py` that honours:

```
python3 -I train.py --data <dir> --config '<json>' --out <dir> [--cache <dir>]
stdout: one JSON object with development_accuracy, heldout_accuracy, development_confusions, config, checkpoint
```

The loop reads only that JSON. It does not know whether the recipe is a vision head, a tabular model or anything else, which is the model-agnostic claim. Register the recipe and its knob bounds in `lib/tuner.mjs`.

## candy-vision recipe

Labelled crops of nine fun-size bars (Snickers, Twix, Milky Way, Midnight Milky Way, 3 Musketeers, Baby Ruth, Butterfinger, Crunch, 100 Grand) from 529 photos, 2,113 boxes. Photos are split by file name, seed 7: 1,468 train / 353 development / 292 held-out crops. A frozen ImageNet ResNet-18 produces embeddings once (cached); each round trains a new head. The baseline is deliberately weak (one epoch, small learning rate, linear head) so improvement is visible.

Knobs: epochs 1–40, lr 1e-4–2e-2, weight_decay 0–1e-2, hidden 0–512, normalize_features, class_balance.

## Run it

Requirements beyond the main app: Python 3 with `torch`, `torchvision`, `pillow` on PATH as `python3` (or set `LOCAL_LAB_PYTHON`). The first run downloads ResNet-18 weights (about 45 MB) from PyTorch.

Data: [Candy Brands for Object Detection](https://www.kaggle.com/datasets/ruopengan/candy-brands-for-object-detection?resource=download) on Kaggle (529 phone photos, VIA box annotations, about 2.9 GB raw). `recipes/candy-vision/shrink.py` resizes it to 1024 px wide and merges the boxes into one `annotations.csv` (about 127 MB). Or copy the already-shrunk `candies-small/` folder from Lamitr.

```sh
# from the raw Kaggle download:
python3 -I recipes/candy-vision/shrink.py <kaggle-unzipped-dir> .local-lab/sources/candy-vision
# or from the pre-shrunk folder:
mkdir -p .local-lab/sources/candy-vision
cp -R <candies-small>/images <candies-small>/annotations.csv .local-lab/sources/candy-vision/
# with runtime:actors, runtime:ollama and dev running, Relay identities set up:
node scripts/tune.mjs candy-vision 6
node scripts/tune.mjs --watch <tuningId>     # reattach after a restart
```

API: `GET /api/tuning/recipes`, `POST /api/tuning {recipe, rounds}`, `GET /api/tuning/:id`, `POST /api/tuning/:id/cancel`.

## What was verified (Intel MacBook, 2026-10-31)

- Recipe standalone: baseline 70.9% held-out in 37 s including feature extraction. Fixed configs reached 98.3% (10 epochs), 99.0% (20 epochs, normalized), 99.7% (30 epochs, normalized, hidden 256). Rounds after the first take 0.3–2 s.
- Through the app: round 0 ran as a durable Terse job, metrics and checkpoint were persisted under `tuning:<id>`, and the run failed cleanly at the proposer step with the Relay setup error, because this machine has no Relay identities and no Ollama.
- `npm run check` and `npm test` pass.

Not yet verified anywhere: the proposer step through Relay and Qwen3, the full multi-round climb through the app, and restart-between-rounds. Those need the M5 with all three runtimes. The proposal schema is validated and clamped before use, so a bad proposal fails the run rather than running an unbounded config.

Live-photo detection (boxing bars in a fresh photo) is not part of this branch. The recipe classifies crops from existing boxes.

## Local vs GPT on the same 292 held-out crops (measured 2026-10-31, Intel MacBook)

`scripts/compare-gpt.py` scores the tuned head and a GPT vision model on identical crops. GPT is zero-shot with the nine names in the prompt, image detail "low", no examples. A few-shot or high-detail GPT setup would likely score higher; this is the cheapest honest baseline, not the best possible one.

| | local tuned head | gpt-5.4-mini | gpt-5.4 |
|---|---|---|---|
| accuracy | 99.7% | 74.0% | 83.2% |
| all 292 crops | 0.01 s | 31 s | 42 s |
| per crop | 0.02 ms | 831 ms | 1,126 ms |
| cost, this run | $0.00 | $0.049 | $0.157 |
| cost per 1,000 crops | $0.00 | $0.17 | $0.54 |
| photo leaves laptop | no | yes | yes |

Costs use OpenAI's published standard-tier prices on 2026-10-31: gpt-5.4 $2.50 in / $15 out per million tokens, gpt-5.4-mini $0.75 / $4.50. Tokens billed: 52,974 in and 1,995 out (mini), 52,974 in and 1,638 out (5.4). Images were sent at "low" detail, so a high-detail run would cost several times more.

GPT's main miss is Midnight Milky Way vs Milky Way (20 and 7 cases), then Snickers and Baby Ruth. The local head's single miss is one Milky Way read as Twix. The local score is on photos that match the training setup (same blanket, lighting and phone); on a fresh scene it would drop and GPT would hold steadier. The fair claim is "better on your own data, free and private", not "better than GPT in general". Requires `.local-lab/openai-key`; crops are sent to OpenAI only for this explicit run.
