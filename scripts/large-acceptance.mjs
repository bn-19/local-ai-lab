import assert from "node:assert/strict";
import { api } from "./api-client.mjs";
import { readFile, writeFile } from "node:fs/promises";
const dataset = JSON.parse(
  await readFile(".local-lab/retail-import.json", "utf8"),
);
const source = JSON.parse(
  await readFile(".local-lab/retail-provenance.json", "utf8"),
);
const created = await api("tasks", {
  request:
    "Show net revenue by product and monthly trend. Include returns; let me filter by Country.",
  datasetId: dataset.id,
  measure: {
    operation: "product_sum",
    column: "Quantity",
    column2: "UnitPrice",
  },
  dateColumn: "InvoiceDate",
  groupColumn: "Description",
  filterColumn: "Country",
  negativePolicy: "include",
  reuseRecipe: true,
});
let job;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 500));
  job = await api("jobs/" + created.jobId);
  if (["ready", "failed"].includes(job.status)) break;
}
assert.equal(job.status, "ready", JSON.stringify(job));
const task = await api("tasks/" + created.taskId);
assert.ok(
  Math.abs(task.dashboard.kpis[0].value - Number(source.net_revenue)) < 0.001,
);
assert.equal(task.dashboard.charts.length, 2);
assert.equal(task.dashboard.source.rows, 541909);
const followup = await api("tasks/" + created.taskId + "/followup", {
  request:
    "Count the number of transaction rows by Country instead. Keep the monthly timeline.",
});
let next;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 500));
  next = await api("jobs/" + followup.jobId);
  if (["ready", "failed"].includes(next.status)) break;
}
assert.equal(next.status, "ready", JSON.stringify(next));
const followTask = await api("tasks/" + followup.taskId);
assert.equal(followTask.measure.operation, "count");
assert.equal(followTask.dashboard.kpis[0].value, 541909);
assert.equal(next.viaRelay, false);
await writeFile(
  ".local-lab/large-acceptance.json",
  JSON.stringify(
    { dataset, created, job, task, followup, next, followTask },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      rows: dataset.rows,
      bytes: dataset.bytes,
      importMs: dataset.importMs,
      resource: dataset.resource,
      revenue: task.dashboard.kpis[0].value,
      independentRevenue: source.net_revenue,
      modelMs: task.measurement.elapsedMs,
      taskId: task.id,
      followupOperation: followTask.measure.operation,
      followupRows: followTask.dashboard.kpis[0].value,
      followupMs: followTask.measurement.elapsedMs,
      followupUsedRelay: next.viaRelay,
    },
    null,
    2,
  ),
);
