# Pile detector checkpoint — 2026-10-31

**Acceptance failed. Do not ship this as reliable multi-candy counting.**

The Device queue installed official Apache-2.0 `IDEA-Research/grounding-dino-tiny`, pinned revision `a2bb814dd30d776dcf7e30523b00659f4f141c71`, verified safetensors SHA256 `1a2412ef99bd74bcd3c2a246fa1e48581f8889a1300c9051974741314fc042f3`. Actual installed directory: 690,306,189 bytes. Queue install job `a07822e7-30c5-41f3-ac3f-2720718b1a9f` took approximately 34 seconds on this machine. Existing official CLIP base supplies crop labels; the unrelated five-class MIMEX trained head is not used.

A real original crowded bowl photograph, [Halloween candies by Joli Rumi](https://commons.wikimedia.org/wiki/File:Halloween_candies.jpg), CC BY-SA 4.0, was manually annotated **before inference**. Image SHA256 `235e4b4c6dd1e8fac964dc444e8cac74e8606475d76fa81d80f43b200e7b93fd`. Annotations cover 29 discernible instances, only a partial reference because many overlapping wrappers are ambiguous. Readable anchors: two M&Ms packets, one Twix, one Haribo packet. Foundation pretraining membership is unknown; no task-specific training or prompt calibration used this image.

Actual Device job `af4be3cc-4b82-448f-bd89-51362a5cde75`, saved task `d3231b93-feaa-400d-b87a-d4b194bd3884`, ran local CPU inference in 3,804 ms inside approximately 6.3 seconds job wall time. Eight regions were returned; six match manually marked instances at IoU >= 0.5. One erroneous region covers almost the whole pile. Only Twix was accepted (count 1); seven regions remained unknown. Many visible candies were missed. The partial reference cannot establish total recall. This is useful failure evidence, not a correct counting checkpoint.

Local evidence in the original workspace `.local-lab/pile-research/`:
- `halloween-candies-manual-reference.json`: frozen pre-inference manual reference.
- `baseline-job.json`: input photo/task/job identity.
- `baseline-evaluation.json`: matching results and failed acceptance.
- Original `Halloween candies.jpg`, preserved unmodified.

Raw model output: `.local-lab/vision/pile-af4be3cc-4b82-448f-bd89-51362a5cde75.json`.

API: `POST /api/vision {action:"install-detector"}` and `{action:"detect",photoId}` run through the existing Device queue. No cloud image inference, synthetic boxes, annotation-fed inference, forced counts, or browser automation. Saved results carry raw candidates and accepted/uncertain status. No pile-specific frontend has been shipped. Model inventory now includes detector size/path and retains its explicit no-automatic-deletion policy.

Further progress requires representative pile images and detector evaluation/training, separate from the friend's nine-brand crop classifier. That branch's supplied ground-truth crops do not provide an inference-time detector. A fresh manually annotated pile with repeated supported brands remains the preferred checkpoint. The current baseline gives no evidence that a reliable full counting demo can be completed by 4pm; do not promise it or substitute single-photo classification.

## Subsequent bounded improvements

Tiled v3 improved matches on the now-development Joli Rumi photo from 6 to 11 of 29 partial manual boxes, with 18 proposals and one accepted Twix. It still misses many candies. A separate CC0 Petey21 fruit-wrapper bucket test returned three proposals with only one of 14 partial manual boxes matched, and no accepted brands. Thus general pile localization still fails.

The locally regenerated friend head was tested on actual detected pile crops in job `e8f0f36d-cd70-432c-9dc6-d0c9e7dd9937`, saved task `ddab3a4a-17ac-4a80-a909-ccc4dc00414b`: 18 detected regions, all 18 uncertain, no accepted counts, 14.046 seconds CPU. It misclassified the visible Twix candidate as Snickers; the independent guard rejected that label. The candidate remains unpromoted.

Four separated bars from source image IMG_1930 were a component regression only. Job `bdb6b344-4664-4f0b-9e3d-728b4cf44202` correctly localized all four; raw learned-head candidates named all four, but the conservative unknown guard accepted only Baby Ruth and 100 Grand. One nested duplicate 100 Grand region was excluded and retained in `suppressedInstances`. Runtime 11.253 seconds. This image belongs to the recipe dataset and is NOT an unseen pile test.

The UI exposes real experimental overlays, accepted counts, unknowns and saved results, with explicit limitations. No correct repeated-brand real-pile checkpoint has been achieved; no reliable completion ETA is claimed.

## Whole-photo VLM setup checkpoint

The approved local `qwen3-vl:2b` download completed in 127.768 seconds and passed full manifest-digest and vision-capability verification. Its first Device inference job `cdd8f869-d9a8-4467-bba1-2b6c2676b195` failed immediately with an Ollama HTTP 400. No estimated candy result was produced by that run. A bounded diagnostic retry is in progress; do not advertise a successful VLM demo until a recorded actual result is available.

The diagnostic run `12d12fe0-87fb-4d97-844c-d19cc10da919` identified the exact setup error: the original photo request required 9,077 tokens, exceeding the configured 4,096-token context. The bounded context was raised to 12,288 tokens for this reviewed local vision recipe; no model or weights changed. A subsequent actual inference result is required before claiming success.
