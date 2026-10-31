# Retail reporting prompt adaptation

Open a saved dashboard in the local app and choose **Run reporting experiment**. The experiment asks the installed Qwen3 model to interpret ordinary business questions using an authored retail policy. It compares a policy-only baseline with the same policy plus four reviewed examples. This is prompt adaptation, not weight training.

The benchmark is synthetic and independent of the uploaded CSV. It is not evidence of accuracy on the user's actual business data. Rules are explicit demo assumptions: net merchandise revenue includes returns and excludes POST/ADJUST; average order value divides by distinct merchandise order IDs, including return orders; rankings use net revenue; profit needs missing cost data. Explicit question overrides take precedence.

The seven-line fixture intentionally includes multi-line orders, a return, shipping, and an adjustment. Trusted code computes 50 net revenue, 110 before returns, three merchandise orders, 50/3 average order value, and product ranking A=50, B=0. Unit checks independently assert these values. Model outputs are restricted to metric, returns, and scope enums; no model-written code executes.

Four development questions supply the candidate examples. Six separately authored final questions test paraphrases, unsupported cost requests, distinct orders, and an explicit return-policy override. Neither expected answers nor fixture rows enter inference inputs. The optimizer receives only development findings and predefined prompt options; final results do not enter its prompt. Both candidates are measured regardless of the optimizer's preference. This is one bounded candidate comparison, not an adaptive search against the final set. Six questions are a pilot, not a broad quality claim.

Every model call, including the optimizer, uses the Terse Device queue. Relay carries only job IDs and aggregate development findings. Results include the actual plans, calculated answers, policy, exact prompt strings, model identity, timings, and selected configuration. Strict held-out improvement is required for selection; ties retain baseline. The reporting recipe is saved separately and never replaces the existing dashboard planner, which uses a different schema. Applying this recipe to arbitrary uploaded CSVs is not implemented yet.

Run with services up:

```sh
node scripts/reporting-experiment.mjs
```

This exercises the HTTP API, both model configurations, the Relay optimizer handoff, persisted results and dashboard-recipe isolation. Evidence is written to ignored `.local-lab/reporting-experiment.json`. No browser automation is launched.

## Measured pilot — October 31, 2026

Actual local Qwen3:4b run (digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`) completed in 52.836 seconds:

| Split | Baseline | Adapted prompt |
| --- | --- | --- |
| Development | 2/4 | 4/4 |
| Held-out | 4/6 | 5/6 |

The candidate was selected for this reporting recipe. It corrected the held-out missing-cost question: baseline substituted revenue, candidate requested clarification. Both configurations failed the explicit instruction to exclude negative quantities (returned 50 instead of 110). The final set has now been inspected; future tuning should use a new untouched final set.

The existing dashboard recipe was verified unchanged, and the queue was idle afterward. The optimizer request was received via Relay and its completion send was acknowledged; a completion-received ID was not present in stored evidence. This does not affect the locally persisted model results, but end-to-end completion receipt is not claimed for this run.
