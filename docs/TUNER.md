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

## In the app

One box for everything. The model picker (`POST /api/models/recommend`) routes by task wording: a request to train, tune, teach, recognize, classify or detect, with no CSV or document attached, resolves to kind `tune` and the candidates are tuning recipes instead of Ollama models, with the same readiness honesty (Python runtime missing, recipe data missing). Everything else keeps Boaz's analytics, document and text paths untouched.

Workspace flow: describe the task → Review setup shows the recipe, backbone and data → Run task starts six rounds → the setup form folds away and the tuner panel takes over: baseline → best held-out climb, a round table with Promoted badges, and the executor, judge and proposer as a conversation (the proposer bubbles are the Relay hand-offs). Cancel is on the panel. When a best round exists, the measured local-versus-GPT table appears under it.

**Save model / New model** sit in the workspace toolbar once work is open. Save model names the current task or tuning run and writes `saved:<id>` (a pointer, nothing copied). New model clears the workspace; unsaved work stays in task history and nothing on disk is deleted. The Saved page lists saved models first, then task history, and Open in workspace reattaches to a tuning run by id, including after a companion restart.

API additions: `POST /api/saved {kind: task|tuning, refId, name}`; `/api/state` now includes `tunings` and `saved`; `GET /api/tuning/recipes` includes the measured benchmark. Tuning jobs carry the tuning id as their task id so the live activity panel groups them.

## Reusing a trained head (hand-off)

`train.py` writes `head.pt` and `config.json` to `--out`. The checkpoint holds `labels` (class order), `config`, `state` (head weights), `mean` and `std` (training-split feature statistics when `normalize_features` is on, else null), `backbone` and `splits` (image file names per split). Metrics are the JSON line on stdout.

`predict.py` loads a head and classifies crops with the exact training preprocessing: crop the box, resize to `image_size` square, ImageNet normalisation, frozen ResNet-18 IMAGENET1K_V1 with the classifier removed (512-d), feature mean/std from the checkpoint, head, softmax.

```sh
# reproduce the best head deterministically (seed 7, committed data, about 40 s cold, 1 s with the feature cache)
python3 -I recipes/candy-vision/train.py --data recipes/candy-vision/candies-small \
  --config '{"epochs":30,"lr":0.002,"weight_decay":0.0001,"hidden":256,"normalize_features":true}' \
  --out .local-lab/tuning/best --cache .local-lab/tuning/cache/candy-vision
# classify crops from the held-out split, or one photo with boxes
python3 -I recipes/candy-vision/predict.py --head .local-lab/tuning/best/head.pt --data recipes/candy-vision/candies-small --split heldout --limit 5
python3 -I recipes/candy-vision/predict.py --head .local-lab/tuning/best/head.pt --image recipes/candy-vision/candies-small/images/IMG_1946.jpg --box 236,262,179,165
```

Verified 2026-10-31: that config scores 99.3% held-out, and `IMG_1946.jpg` box `236,262,179,165` predicts `Snickers` (p = 0.93), matching its label. Class order is alphabetical: 100_Grand, 3_Musketeers, Baby_Ruth, Butterfingers, Crunch, Midnight_Milky_Way, Milky_Way, Snickers, Twix.

There are no detector weights. The recipe classifies crops from boxes you already have; a photo with several bars needs a box source first (the committed `annotations.csv` for known photos, or a separate detector).

## Run it

Requirements beyond the main app: Python 3 with `torch`, `torchvision`, `pillow` on PATH as `python3` (or set `LOCAL_LAB_PYTHON`). The first run downloads ResNet-18 weights (about 45 MB) from PyTorch.

Data: the shrunk dataset is committed at `recipes/candy-vision/candies-small/` (529 photos at 1024 px, `annotations.csv`, about 127 MB), so nothing to download or copy. Source: [Candy Brands for Object Detection](https://www.kaggle.com/datasets/ruopengan/candy-brands-for-object-detection?resource=download) on Kaggle (2.9 GB raw, VIA boxes); `recipes/candy-vision/shrink.py` is what produced the committed version.

```sh
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
