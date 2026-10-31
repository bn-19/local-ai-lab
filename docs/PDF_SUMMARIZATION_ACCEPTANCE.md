# PDF summarization acceptance

Status on 2026-10-31: **short whole-document summary and useful follow-up pass; multi-excerpt summarization is not ready**. Final v4 supplies the complete short source directly and passes all five independent fact groups. Its follow-up correctly answers a source-supported question and acknowledges missing cost information. The longer document still fails its evidence check and publishes no summary. Earlier failures are preserved below. No browser session has been started. This acceptance covers a science-club briefing and a planning-meeting briefing, outside CSV analytics and candy recognition.

## Public sources and provenance

Original PDFs, extracted text, page renders and API evidence stay in ignored `.local-lab/pdf-acceptance/`. No private inputs are used. Originals are preserved byte-for-byte. Source content is data, not executable instructions.

| Fixture | Publisher/title/version | Original download | Bytes / pages / extracted characters / UTF-8 bytes |
| --- | --- | --- | --- |
| `webb.pdf` | NASA, *Webb Space Telescope Fact Sheet*. No printed issue date; PDF metadata created/modified November 10, 2021. Prelaunch wording; the August 2024 URL path is not its publication date. | https://science.nasa.gov/wp-content/uploads/2024/08/webbfactsheet.pdf | 2,719,771 / 2 / 3,382 / 3,408 |
| `landsat9.pdf` | USGS, *Landsat 9*, Fact Sheet 2019-3008, version 1.3, August 2022; DOI 10.3133/fs20193008. | https://pubs.usgs.gov/fs/2019/3008/fs20193008.pdf | 2,276,470 / 2 / 7,154 / 7,236 |

SHA-256:

```text
webb.pdf      84933f93b67aacaf2871ced720d76cd18d1637fde65ae9c561282ddfc692c71e
landsat9.pdf  d4ac4b2d7c2439ef2df79dcb03f01092d2b0bbd722f0e1c169ec8755b9e027d5
```

Reuse basis: US federal agency informational publications. [USGS policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) identifies USGS-produced information as public domain, with third-party exceptions. [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) permit informational/educational use subject to credit and third-party/identity restrictions. This test reads the credited publications locally and does not reuse their logos as branding or imply endorsement. Landsat's figure credits NASA; preserve the original attribution. No PDFs are bundled into the app or repository.

Extraction: installed Python `pypdf` 6.10.2, through the fixed trusted `scripts/extract-document.py`, adding `Page N` markers. All four pages were also rendered with Poppler and visually reviewed, including Landsat Table 1 and its footnote. Original page order is retained; multicolumn extraction order differs from visual reading order. The current 4,000-byte splitter yields one Webb excerpt and two Landsat excerpts. Landsat page 2 and its qualifications cross the boundary.

## Independent rubric, fixed before inference

Assess the actual generated answer against these source anchors, not another model's rating. Wording may vary. Passing requires a coherent requested briefing with the purpose and key facts below, no material invented claims or altered numbers, and a useful source-supported follow-up. Record omissions separately from false statements. A list of unrelated excerpt answers fails whole-document summarization even if each excerpt contains correct facts.

### Webb short briefing

| Check | Reference and page anchor |
| --- | --- |
| Purpose | Page 1 introduction and first-galaxies section: infrared observations investigate cosmic history, including early stars/galaxies over 13.5 billion years ago. Expansion redshifts their light into infrared. |
| Method/qualification | Page 1 distant-worlds section: transmission spectroscopy examines starlight filtered through planetary atmospheres to infer chemistry; possible habitability signatures do not establish life. |
| Hardware | Page 2 Quick Facts: primary mirror 6.5 m / 21.3 ft, 18 gold-plated hexagonal segments; five-layer sunshield. |
| Location | Page 2 Quick Facts/Observatory: Sun orbit around L2, about 1 million miles / 1.5 million km from Earth. |
| Partnership and tense | Page 2 Partners: NASA, ESA, Canadian Space Agency. This prelaunch sheet describes planned observations and six months of commissioning, not completed discoveries. |

Unanswerable from this sheet: total mission construction cost. Do not insert a dollar value from model memory.

### Landsat whole-document briefing

| Check | Reference and page anchor |
| --- | --- |
| Purpose | Page 1 introduction: USGS/NASA partnership continues repeated global land observations for natural-resource monitoring; program dates to 1972. |
| Responsibilities | Page 1 spacecraft/launch section: NASA handles space segment, integration, launch and checkout; USGS handles ground system, flight operations, processing and distribution after checkout. |
| Revisit qualification | Page 1 last text column: Landsat 9 alone every 16 days, offset 8 days from Landsat 8; combined coverage every 8 days. Approximately/up to 750 scenes daily from Landsat 9; nearly 1,500 combined. Do not attribute combined cadence/output to Landsat 9 alone. |
| Instruments/resolution | Page 2 Instruments and Table 1: OLI quantization improves from Landsat 8's 12 bits to 14 bits; TIRS has two thermal bands. Thermal bands acquired at 100 m, resampled to 30 m. Resampling does not create native 30 m thermal detail. |
| Access | Page 2 Data Products: Landsat 9 products downloadable through USGS EROS at no charge. |

Follow-up asks for native/resampled thermal resolution and total mission construction cost. Correct: 100 m acquired, 30 m resampled, page 2 Table 1 footnote; cost not supplied anywhere in this document. No cost estimate is acceptable. This tests positive and missing evidence across excerpts.

## Reproduction

With the existing companion, Terse and installed model running, coordinate a model-job window with the backend owner. Do not call Ollama directly, install models, restart services or start training. Read the pairing token locally in the script; never print it. Requests use bearer authentication and the exact live origin `https://local-lab-bn-19s-projects.vercel.app` against `http://127.0.0.1:4173`.

Download the two source URLs above into the stated ignored fixture paths. The acceptance script verifies their pinned hashes before submission. For the negative fixture, use `pypdf.PdfWriter`, add each original Webb page, encrypt with a nonsecret test password and write `encrypted-webb.pdf`; do not overwrite the original. The derivative was reopened, encryption confirmed and both pages checked after decryption. This is an intentionally unsupported encrypted file, not a scanned/OCR test.

```sh
node --check scripts/pdf-summary-acceptance.mjs
node scripts/pdf-summary-acceptance.mjs unsupported negative
node scripts/pdf-summary-acceptance.mjs webb baseline
node scripts/pdf-summary-acceptance.mjs landsat9 baseline
```

To repeat the standalone short-PDF follow-up against the saved successful task:

```sh
node scripts/pdf-summary-acceptance.mjs webb followup-rerun 76bd0d30-74ab-4d5c-a7f1-282974cca4c2
```

Each label must be unique; prior evidence is never overwritten. The script uploads original bytes to `/api/files`, compares extraction profile and stored-byte hash, submits a plain-language `{documentId, request}` to `/api/tasks`, polls real execution, compares `/api/tasks/:id` and `/api/state`, checks Device history/attempt and persisted result, and submits the Landsat follow-up through `/api/tasks/:id/followup`. No analytics columns, measures or dataset IDs are provided. Each call has a timeout; a timed-out script requests cancellation of only its own job. API assertions do not constitute a factual-quality pass; inspect the saved generated output against the rubric.

## Measurements and scope

Baseline ran after the backend explicitly released its training window. All requests used exact-origin authenticated HTTP. Original byte hashes, extraction sizes, task/job result equality, saved `/api/state` results and completed Device attempts passed. The unsupported encrypted PDF returned HTTP 400, `Password-protected PDFs are unsupported`, with no uploaded document ID or model task. Evidence: `unsupported-negative.json`, `webb-baseline.json`, `landsat9-baseline.json` in the ignored evidence directory.

| Case | Task ID | Job ID | Result |
| --- | --- | --- | --- |
| Webb summary | `f0658cd7-76d0-42af-b691-8579bac65532` | `b3fd6770-eee8-45d2-bcc7-90d676574f1d` | Real answer; all five reference groups covered with correct numbers. Page citation quality is weak: generic Page 1/Page 2 mention, not claim-specific anchors. |
| Landsat summary | `7b5c0750-1c9b-4d47-a1cc-17c3fba0ab6b` | `cd8d9668-c661-49e7-a3da-06e29c5ffdbd` | Fail. Two separate answers merely restate the requested task as planning narration. None supplies the five substantive reference fact groups. No coherent summary. |
| Landsat follow-up | `056aded3-bdd6-4fb9-b4e7-3af230d45cf0` | `0903e0ad-dc44-4415-ae92-f10226dbe788` | Fail. Planning narration; neither 100 m acquisition / 30 m resampling nor an explicit absent-cost answer. No invented dollar amount, but silence is not a successful uncertainty answer. |

The Webb output correctly explains redshift/infrared, spectroscopy, mirror/sunshield, L2/distance and NASA/ESA/CSA; it explicitly says the source describes planned activities rather than achieved discoveries. No material unsupported factual claim was found in that answer. The Landsat failure is stronger than the known lack of synthesis: the independent answers themselves are unusable. Backend received exact prompts, source fixture hashes and job IDs to fix generation and synthesis without retraining.

Actual model: `qwen3:4b`, digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`, installed bytes 2,497,293,931. Webb used 1 call (989 input / 300 output tokens); Landsat summary used 2 calls (2,652 / 239); follow-up used 2 calls (2,622 / 202). These are job-reported local inference usage, not cloud API usage or an accuracy metric.

Measured Device execution durations (`finishedAt - startedAt`): Webb 9,611 ms, Landsat summary 9,109 ms, follow-up 8,566 ms on this Apple M5 / 32 GB machine. These exclude upload/extraction and do not establish general performance. Each job was observed as the single Device active job and returned the Device to idle. Review results are separately recorded in `baseline-independent-review.json`; the rubric/code hashes captured before inference are in `pre-inference-code-hashes.json`.

All three jobs recorded `viaRelay:false`, with actual Terse Device attempts. This document route is local-only, not a Relay fallback: no cloud request/receipt was required or observed. It uses the fixed installed model; there is no task-specific model competition, Planner/Evaluator exchange or document training. Do not report a Relay receipt or automatic general model selection from this path. Saved-state checks reread the live actor-backed API; no service restart or crash recovery was performed for this acceptance.

Baseline gap: `lib/jobs.mjs` generated independent excerpt answers and the UI disclosed that limitation. Backend now owns bounded synthesis and frontend owns its rendering; the retests below assess the actual output rather than the new status field. PDF extraction has a 10 MB / 24,000-character / 100-page ceiling and no OCR. Tables and images are not visually understood by the text model.

### First synthesis retest: failed

The backend added bounded evidence notes and a final synthesis call. The unchanged Webb prompt on task `de5e3fdc-cd72-4164-839c-d4fbf2c7324f`, job `61a9cb45-48a1-460d-8056-b85db08e84d0`, returned three notes containing only `facts` and final `completed answer`. Four real local model calls used 1,545 input / 39 output tokens. `synthesis.status:complete` indicates pipeline completion, not factual correctness; this result fails every fact group. Evidence: `webb-synthesis-v1.json`.

The prompts in `lib/document-answer.mjs` contained those exact JSON example values, and the model echoed them. This observation does not establish a mocked runtime. Remaining v1 tests were stopped, and the backend owner was asked to remove literal placeholder examples and reject their echoes. The acceptance script now also rejects this observed placeholder/planning regression; independent fact review remains required.

### Second synthesis retest: failed factual accuracy

The backend removed literal JSON example values. The original requests and source hashes were unchanged. All three jobs completed through Device, persisted results, and used the same pinned Qwen3 digest, with no Relay delivery.

| Case | Task / job | Independent review |
| --- | --- | --- |
| Webb v2 | `d0a70e14-a885-4287-9e97-9f96bdbba2c6` / `4c007b61-f06e-49f4-9f95-81bb03ddcaa9` | **Fail.** First source note falsely finds no relevant facts on page 1. Final summary changes source wavelength 0.6–28.5 micrometres to 0.6–2.85 and calls the original a likely typo; it invents current commissioning status, omits 6.5 m diameter and spectroscopy, and loses the prelaunch qualification. |
| Landsat v2 | `9c7d850f-2ba1-4251-a5f4-1ed137134792` / `875c9c7a-1a42-4bf9-97f9-c9ac530c82e7` | **Fail.** All five notes incorrectly say no relevant facts. Final answer claims the document contains none of the requested information, although all five fact groups are present. |
| Follow-up v2 | `0c386c9c-732e-4dc8-b85b-9610eb1fbb22` / `71516c57-0e66-41f6-a751-32d54b565816` | **Partial facts, fail clean answer.** Final says `1:100 meters` native resolution, 30 m resampled, cost unspecified, page 2. The native-resolution notation is malformed. One retained page-1 note invents 100 m resampling; the actual page-2 note is correct. |

Evidence: `webb-synthesis-v2.json` (4 calls, 1,718 input / 444 output tokens), `landsat9-synthesis-v2.json` (summary 6 calls, 3,504 / 178; follow-up 6 calls, 3,482 / 202). Incorrect intermediate notes matter because they can poison the final answer and are shown as provenance; having source offsets alone does not validate their content.

The backend received these defects and a request for grounded evidence notes, exact number/qualification preservation, and no invented source corrections. These fixtures now guide workflow fixes and are not an untouched held-out quality benchmark. A later pass would demonstrate these concrete cases, not arbitrary PDF accuracy.

### Third synthesis retest: explicit failure, no summary published

New tasks pin an 8,192-token context; the final prompt has a 6,000-byte cap including instructions, request and evidence. The backend now verifies extracted quotes against each source piece and rejects new numeric tokens/ratios in the final answer. This is validation of selected properties, not proof of semantic accuracy.

Both unchanged summary requests failed at quote extraction because model output exceeded the 900-byte per-note budget, including the retry:

- Webb task `32696f9c-0c47-43ea-b5a7-f518e364b101`, job `9b722de7-8e90-4a2d-9b4d-a80cd4bd6f24`: 28,375 ms, 2 calls, 1,130 input / 814 output tokens.
- Landsat task `d54c3cda-d8f5-44fd-9551-9e60b7e13734`, job `691bd993-bb91-417c-a7ce-f2e2cdcf78ec`: 33,580 ms, 2 calls, 1,392 input / 890 output tokens.

Both returned `failed` with `Evidence quotes exceed the bounded note budget`; no fabricated successful summary was substituted. The Device returned idle. Follow-up was not submitted after the failed summary. Evidence: `webb-synthesis-v3.json`, `landsat9-synthesis-v3.json`. The backend is preparing one final bounded retry with constrained quote lengths and actual validation feedback; if it fails, report synthesis not ready rather than weakening the rubric.

### Final bounded v4: short document passes, longer document fails safely

The backend supplies the complete extracted source directly when the serialized request fits its 6,000-byte prompt budget. Larger sources use exact-source quote checks, bounded quote schema and validation feedback on retry. All new tasks in this run pinned the same Qwen3 digest with 8,192-token context.

| Case | Task / job | Result and measurement |
| --- | --- | --- |
| Webb v4 | `76bd0d30-74ab-4d5c-a7f1-282974cca4c2` / `000bcee9-4bc6-451e-8114-2cba6f9a6185` | **Pass factual summary.** All five rubric groups supported, including spectroscopy, 6.5 m/18 segments, L2/distance, partners and planned commissioning. Page-topic citations match the source. No invented present status or altered numbers. 11,766 ms; 1 call, 982 input / 331 output tokens. |
| Landsat v4 | `231e6157-df60-46d2-a4fe-6ffa88f0f286` / `e3933d9e-8267-4d16-85f6-177794ab826b` | **Fail usable summary, pass explicit error behavior.** `Evidence quote was not present verbatim in its source` after retry. No summary published, no follow-up submitted. 8,689 ms; 2 calls, 1,450 input / 196 output tokens. |
| Webb follow-up v4 | `3d6a7133-1189-4ede-ad64-eb53164b1832` / `d51b3b6c-096d-45b7-b544-484ec4132947` | **Pass.** Correct 6.5 m diameter, 18 segments, page 2; explicitly says total mission construction cost is not provided. Saved original document reused. 6,176 ms; 1 call, 972 input / 47 output tokens. |

Evidence: `webb-synthesis-v4.json`, `landsat9-synthesis-v4.json`, `webb-followup-v4.json`, and `final-independent-review.json`. The final failure is meaningful: the app rejects unverified model evidence instead of representing it as a faithful whole-document answer. The unchanged long-document rubric was not weakened, and further tuning was stopped after this bounded revision.

This proves reuse of the local text model and document/task/Device infrastructure for a real non-analytics task, plus successful summarization of one complete short public PDF. It does **not** prove reliable long-document summaries, arbitrary task/model selection, OCR, chart understanding or document-training improvements. This PDF route remains local-only; the tests do not exercise hosted Relay or model-role agent collaboration. The final model choice reused the existing installed Qwen3; separate catalog-selection work is outside this acceptance.

Hosted browser verification remains pending explicit approval for a new isolated session under `AGENTS.md`. HTTP exact-origin acceptance alone does not prove browser loopback permissions, file-picker behavior or rendering on the deployed UI.

Frontend source inspection confirms non-CSV uploads route to `/api/files`, document submissions use `{documentId, request}` without analytics fields, final `answer` renders before optional source excerpts, and follow-ups reuse `/api/tasks/:id/followup`. The inspected code is not proof of the current deployed build. A browser acceptance script was prepared and syntax-checked in the ignored evidence directory, but never launched; no Chrome process, tab, debugger connection or personal profile was created/touched by this chat. Since the long-document path remains blocked, no browser approval was requested for it.

Owned deliverables: this report and `scripts/pdf-summary-acceptance.mjs`. Backend/frontend fixes were made by their respective owners. Script syntax validation passed; API assertions and source review are the substantive checks, rather than redundant unit tests. No repository-wide tests, service restarts, model installs, training, commits, branch changes or deployments were performed by this acceptance chat.
