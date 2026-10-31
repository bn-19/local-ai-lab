# Experimental local candy vision

**Reliable candy-pile counting has not passed acceptance.** The separate candy CSV analytics demo remains supported. Do not claim that crop-classification accuracy measures detector/count accuracy.

The photo panel runs pinned Apache-2.0 Grounding DINO Tiny on a full frame and four overlapping tiles, then classifies actual detected crops locally. CLIP is the baseline. A separately tested, unpromoted nine-brand ResNet18 head was regenerated from Lamitr's reviewed recipe. Unknown brands, low agreement and uncertain detections remain unknown. Counts derive only from accepted detections; contained same-brand duplicates are excluded with saved evidence. Hidden or missed candies are not counted.

The UI draws actual model boxes, accepted counts, uncertain candidates and runtime. Saved task reopening fetches its original local photo through the paired authenticated API. Activity shows actual Device job events. There is no browser/cloud image inference, fabricated boxes, manually entered prediction counts, or annotation-fed inference. No browser automation was used to verify this feature; DOM tests, API checks and actual local inference were used.

## Models and storage

- Official CLIP ViT-B/32: pinned revision and SHA in `lib/vision-policy.mjs`; approximately 609 MB installed.
- Grounding DINO Tiny: revision `a2bb814dd30d776dcf7e30523b00659f4f141c71`, approximately 690 MB installed.
- ResNet18 IMAGENET1K_V1: official checksum `f37072fd47e89c5e827621c5baffa7500819f7896bbacec160b1a16c560e07ec`, approximately 47 MB.
- Nine-brand learned head and its train-split normalization are retained separately. Weights are loaded with `weights_only=True`, bound by SHA, expected architecture and label order.

Inventory displays actual file sizes and paths. No automatic deletion or expiry exists. Dependencies, datasets and run artifacts also occupy space. Full fresh-user setup timing is not measured; measured warm/local steps must not be advertised as a cold-start promise.

## Friend recipe reproduction

Credit Lamitr for the reviewed crop-classifier recipe. Pinned source revision `0533adce3877dbeabf4118c66803508f43fdd405`; only its reviewed training recipe/data are reused, not its UI/job orchestration. `recipes/candy-friend/train.py` adds bounded CPU threads and restricted cache loading. The Device wrapper saves source hashes, image hashes/order, original splits, config, normalization, backbone/head hashes and results. The source Git object must be available locally: an authorized maintainer can fetch `tuner/vision-recipe` before using the training action. No source/data files are executed as model-generated code.

Data: Ruopeng An, [Candy Brands for Object Detection](https://www.kaggle.com/datasets/ruopengan/candy-brands-for-object-detection), CDLA-Sharing-1.0. 528 annotated photos, 2,113 crops; extra unannotated duplicate image is excluded. The original filename split is reproduced, so related views/lighting may cross splits. It is not scene-held-out validation. Supported head labels: 100 Grand, 3 Musketeers, Baby Ruth, Butterfinger, Crunch, Midnight Milky Way, Milky Way, Snickers and Twix. Kit Kat is unsupported by this head.

Actual regeneration: fixed 30 epochs, learning rate .002, decay .0001, hidden 256, normalized features, 96px, seed7. Local MPS run: 1,468 training, 353 development, 292 held-out crops; 100%, 99.72%, 98.97% accuracy respectively. Total worker 10.317 seconds including extraction; recipe 5.227 seconds. This is a locally regenerated model, not the friend's attached checkpoint or reported benchmark.

## APIs and evidence

All actions use the single Terse Device queue: `install`, `install-detector`, `train-pile-head`, `detect` (CLIP baseline), `detect-friend` (explicit unpromoted candidate). Upload JPEG/PNG up to 8 MB via `POST /api/photos`; saved previews use authenticated `GET /api/photos/:id`. Worker image validation caps 20 MP and one frame. Cancellation uses the existing process-group handling and checks before actor commits. No automatic candidate promotion occurs.

See `PILE_BASELINE_CHECKPOINT.md` for actual pile failures and job identifiers. Earlier five-class MIMEX single-product experiments are retained as component research only and are not the current deliverable.

## Whole-photo estimated counts

The primary photo-understanding option now uses a separately downloaded local Qwen3-VL 2B model. This reviewed recipe is recommended for the candy-photo/counting task, not claimed to be the best model or a universal computer-vision selector. It returns approximate visible-package brands/counts, evidence, uncertain entries and unidentified packages. These estimates are separate from detector-confirmed regions and do not use the fine-tuned crop head. No boxes are invented for VLM estimates; no ChatGPT/Claude parity benchmark has been established.

Official Ollama `qwen3-vl:2b`, Apache-2.0, manifest SHA256 `0635d9d857d497aeadba3d7d27485746c50554446f9f6ec01ef39788221adbe8`. Local installation verified the full digest and `vision` capability. Actual Device download took 127.768 seconds on this Mac; that is not a universal setup-time promise. The approximately 1.9 GB model persists in the existing Ollama model inventory until explicitly removed. There is no cloud inference.

Actions `install-vlm` and `detect-vlm` use the single Device queue. Pull cap 180 seconds, inference request cap 90 seconds, input up to 8 MB/20 MP JPEG or single-frame PNG, fixed bounded output schema. Unknown object keys and duplicate/unbounded counts are rejected; only reconstructed validated fields enter saved results. User cancellation discards output but waits for original request completion; error/timeout cleanup retains the Device reservation until successful Ollama unload acknowledgement and absence from `/api/ps`. Reporting failures cannot release that reservation. If shutdown cannot be confirmed, the job remains reserved with an explicit recovery status.

Vision jobs show actual local tool/model progress, not fictitious Agent Relay handoffs. The separate analytics workflow demonstrates the actual Relay-backed agent loop.

The whole-photo request now uses a deterministic local JPEG copy, EXIF-transposed, limited to 1,280 pixels on the long edge and 1.5 MP. It preserves the original and records original/derived SHA256, encoded/oriented/input dimensions and preprocessing policy in private artifacts. It never crops or uses annotations. The UI discloses the model input resolution and possible loss of small wrapper text. Preprocessing uses the already prepared local Pillow vision environment and runs inside the same Device reservation, with a 15-second process cap; model inference retains its separate 90-second cap. This resource-budget change is not evidence of counting quality until an actual resized-photo result is inspected.

Fresh whole-photo setup now provisions a separate lightweight `vlm-venv` with pinned Pillow 11.2.1 if no usable prepared photo environment exists. It does not download CLIP, Torch or training libraries. Readiness requires both the exact Ollama model digest and a working pinned Pillow interpreter. Existing compatible photo environments are reused. Incomplete model responses are saved only as private diagnostic artifacts and never displayed as validated count results.
