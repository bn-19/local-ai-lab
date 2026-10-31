import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { api, token } from "./api-client.mjs";
const origin = "https://local-lab-bn-19s-projects.vercel.app";
const csv = await readFile(".local-lab/sources/bike/day.csv", "utf8");
const rows = csv
  .trim()
  .split(/\r?\n/)
  .map((line) => line.split(","));
const header = rows.shift();
const ix = header.indexOf("cnt"),
  wx = header.indexOf("workingday");
const expected = rows.reduce((n, r) => n + Number(r[ix]), 0),
  filtered = rows
    .filter((r) => r[wx] === "1")
    .reduce((n, r) => n + Number(r[ix]), 0);
const dataset = await api("datasets", csv, {
  headers: {
    Authorization: "Bearer " + token,
    "Content-Type": "text/csv",
    "X-Filename": "UCI-Bike-Sharing-day.csv",
    Origin: origin,
  },
});
assert.equal(dataset.rows, 731);
const created = await api(
  "tasks",
  {
    request:
      "Show total bike rentals by season and monthly trend, with a working-day filter.",
    datasetId: dataset.id,
    measure: { operation: "sum", column: "cnt" },
    dateColumn: "dteday",
    groupColumn: "season",
    filterColumn: "workingday",
    negativePolicy: "include",
  },
  {
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Origin: origin,
    },
  },
);
console.log("Created", created);
let job;
for (let n = 0; n < 180; n++) {
  job = await api("jobs/" + created.jobId);
  if (["ready", "failed", "cancelled"].includes(job.status)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert.equal(job.status, "ready", JSON.stringify(job));
const task = await api("tasks/" + created.taskId);
assert.equal(task.dashboard.kpis[0].value, expected);
assert.equal(task.dashboard.charts.length, 2);
const view = await api("tasks/" + created.taskId + "/dashboard", {
  filter: { column: "workingday", value: "1" },
});
assert.equal(view.kpis[0].value, filtered);
assert.equal(view.source.filteredRows, 500);
const denied = await fetch("http://127.0.0.1:4173/api/state", {
  headers: { Origin: "https://evil.example", Authorization: "Bearer " + token },
});
assert.equal(denied.status, 403);
const noToken = await fetch("http://127.0.0.1:4173/api/state", {
  headers: { Origin: origin },
});
assert.equal(noToken.status, 401);
await writeFile(
  ".local-lab/acceptance.json",
  JSON.stringify(
    {
      dataset,
      created,
      job,
      task,
      filtered: view,
      expected,
      filteredExpected: filtered,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      datasetId: dataset.id,
      taskId: task.id,
      jobId: job.id,
      rows: dataset.rows,
      importMs: dataset.importMs,
      total: expected,
      filtered,
      model: task.model,
      measurement: task.measurement,
      relayRequest: job.receivedMessageId,
      relayCompletion: job.completionReceivedId,
    },
    null,
    2,
  ),
);
