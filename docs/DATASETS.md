# Data sources and tuning targets

These are source leads and proposed checks, not downloaded or validated training fixtures. Keep licenses/notices, revisions, transformations and split provenance. Split original photos/scenes or source tables before augmentation/paraphrasing.

## Candy recognition

First decide the output: one candy label, types present in a scene, or individual boxes/counts. Those use different labels and evaluation. Start with a small known class set and visible wrappers; occlusion and unfamiliar packaging are separate challenges.

- [New Candy](https://universe.roboflow.com/shrinand-aggarwal/new-candy): public listing says CC BY 4.0, with a single generic candy class. It does not establish brand recognition.
- [Candy Products](https://universe.roboflow.com/audit-nsgdv/candy-products): public listing says CC BY 4.0 and nine classes including Caramello, Jelfy and Kofitopi. It lists 699 images overall, while particular versions have different counts. Inspect the exact version, images, labels and export access. It is not evidence for recognizing Snickers/Twix/Skittles.
- Team photos taken with consent during the event may be more relevant. Use different angles, backgrounds and arrangements. Keep separate new scenes for testing; do not split augmented versions of the same photo across training/test.

Planning allowances previously discussed were roughly 5–20 minutes for a small classifier or 20–60+ minutes for a small detector's training, plus substantial collection/labeling/setup time. These are not measured M5 timings and can be exceeded. Measure a short pretrained-model pilot, including held-out quality, before promising a finish time.

## Data analytics

- [UCI Bike Sharing](https://archive.ics.uci.edu/dataset/275/bike+sharing+dataset): historical demand/weather/calendar fields, hourly CSV about 1.1 MB, CC BY 4.0. Good small initial input. Total `cnt` already includes casual and registered users; daily/hourly files overlap. Working days exclude holidays, so use calendar dates for weekend questions. Compare means/totals with explicit denominators.
- [UCI Online Retail](https://archive.ics.uci.edu/dataset/352/online+retail): 541,909 transactions, 22.6 MB Excel, CC BY 4.0. Convert a documented subset if needed. Define cancellation/negative-quantity handling. Costs are absent, so do not claim profit.
- [Salesforce WikiSQL](https://github.com/salesforce/WikiSQL): questions, schemas and structured SQL supervision. Repo lists BSD-3-Clause terms and is archived. Translate only supported operations into the app's bounded tool schema; it does not supply chart/layout labels.

Raw CSV rows are task inputs. To tune the planner, create reviewed question/schema → correct operation/chart examples with independent calculation checks. Prefer prompt/schema refinement first. Keep final answers out of optimizer context.

## Later recipe research

- [QMSum](https://github.com/Yale-LILY/QMSum): 1,808 human-annotated meeting query/summary pairs; repo MIT with underlying corpus terms. Product/AMI discussions are useful for a later notes-model LoRA. They do not automatically label action owners/deadlines.
- [LibriSpeech](https://www.openslr.org/12) / [AMI](https://groups.inf.ed.ac.uk/ami/corpus/): paired speech/transcript evaluation. Reference-based transcription checks are separate from summary quality.
- [PartiPrompts](https://github.com/google-research/parti): 1,600+ evaluation prompts, Apache 2.0 repository; contains no image-training targets.

## Tune and evaluate honestly

Distinguish prompt/settings changes, quantization and actual learned weights. Record model/runtime/data/config revisions and a baseline. Only promote a change after held-out checks improve. For real LoRA, verify the exact base/adapter/runtime compatibility and include preparation, validation and export time. The executor writes actual checkpoints; Terse retains job state and references.

Current [MLX-LM training loop](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/tuner/trainer.py) counts microbatch iterations separately from optimizer updates when accumulating gradients. With accumulation four, 50 optimizer updates require 200 iterations. Recheck installed behavior rather than treating a CLI iteration as a universal training step.
