# Fine-tuned reporting on real CSV data

Open the local app, open the saved Online Retail task, and use **Ask the fine-tuned model about this CSV**. This loads the selected trained MLX adapter, interprets a whole-file reporting question, validates the returned enum-only plan, and calculates the answer in DuckDB against the uploaded table. The original dashboard and its filter controls remain a separate workflow; dashboard filters do not affect this whole-file report.

Supported questions: revenue, average order value, distinct order count, top 12 products by revenue, and profit/margin clarification when costs are absent. The output includes the plan, dataset identity, mapped columns, explicit dataset policy, included/excluded row counts, actual adapter checksum and model revision. Date/country filters and arbitrary groupings are not supported by this adapter interface.

## Dataset policy

The default mapping is `InvoiceNo → order`, `StockCode → product`, `Quantity → quantity`, `UnitPrice → unitPrice`. Other CSVs require an explicit validated API mapping. The UI currently uses these default column names and reports missing columns before queueing inference.

The synthetic training fixture excluded only POST/ADJUST. Real-data inspection found additional bookkeeping/postage codes. The live dataset policy explicitly excludes POST, ADJUST, DOT, D, M, C2, BANK CHARGES, AMAZONFEE, B and CRUK when the model selects merchandise scope. The real CSV descriptions identify postage, discount, manual entries, carriage, bank fees, Amazon fees, bad-debt adjustments and commission. Samples and unrecognized codes remain included. This is an explicit application policy, not a claim that the adapter learned to discover non-product codes.

The adapter chooses metric, return handling, and merchandise/all scope. Trusted calculations apply the configured exclusion list. An explicit request to include shipping/adjustment codes selects all scope. Net revenue includes negative quantities by default. Average order value divides revenue by distinct invoice IDs, including return invoices. Rows missing any of the four mapped fields are excluded. These definitions should be reviewed for a different business.

## API and controls

`POST /api/tasks/:id/report` accepts:

```json
{
  "request": "What is our average order value?",
  "mapping": {"order":"InvoiceNo","product":"StockCode","quantity":"Quantity","unitPrice":"UnitPrice"},
  "excludedProductCodes": ["POST","ADJUST","DOT","D","M","C2","BANK CHARGES","AMAZONFEE","B","CRUK"]
}
```

Mapping and exclusion list are optional for the default retail profile. Optional `adapterJobId` chooses a successful locally persisted fine-tuning result; otherwise the latest eligible result is used. Client paths/model identifiers/SQL are never accepted. The adapter file must be app-owned and match the recorded SHA-256. Unknown options are rejected rather than silently treated as filters.

The endpoint returns `jobId`. It uses the same Device queue, job status and cancellation route as other inference. MLX inference has a 120-second timeout and 16 GiB allocation cap. Only the question goes to the local model; CSV rows stay in DuckDB. A strict validated plan selects trusted SQL templates; no generated SQL executes. Results persist under `report:<jobId>`, `job.result`, and `task.liveReport`. The selected artifact remains separate from the existing Ollama dashboard recipe.

Reports only support the whole-file operations above. Always inspect the displayed plan/scope, especially when a question asks for unsupported filtering or grouping. This is a bounded reporting tool, not a general SQL analyst.

## Real-data validation

The integration suite reads the original 541,909-row UCI Online Retail CSV with a separate streaming Python `Decimal` calculation. It independently computes four policy combinations, order-level averages, distinct counts and product rankings. Eight actual adapter requests are compared with these results, including all 12 ranking values and a missing-cost clarification. Numeric tolerance is 0.00001 for DuckDB double-precision totals. This is an end-to-end integration check, not a new generalization accuracy benchmark.

```sh
.venv/bin/python scripts/verify-live-retail.py
node scripts/live-report-acceptance.mjs
```

Local evidence: `.local-lab/live-report-acceptance.json` and `.local-lab/live-retail-oracle.json`. Neither the CSV nor evidence is committed. No browser automation is needed.

Measured on October 31, 2026: all eight checks passed. Default merchandise scope included 539,061 rows, net revenue 9,790,347.853, 25,318 distinct invoices, average order value 386.69515178924. Product 22423 led the revenue ranking at 164,762.19. All-scope net revenue was 9,747,747.934. Excluding negative quantity rows gave 10,272,184.473 for merchandise and 10,644,560.424 for all codes. Excluding bookkeeping adjustments can increase net revenue because some adjustments are negative. Actual adapter inference/load timing was approximately 1.1–1.25 seconds per question in this warm-cache run.
