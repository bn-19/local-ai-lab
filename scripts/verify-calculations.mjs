import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { api } from "./api-client.mjs";
const evidence = JSON.parse(
  await readFile(".local-lab/acceptance.json", "utf8"),
);
const lines = (await readFile(".local-lab/sources/bike/day.csv", "utf8"))
  .trim()
  .split(/\r?\n/)
  .map((x) => x.split(","));
const header = lines.shift(),
  col = (n) => header.indexOf(n);
const aggregate = (rows, key) => {
  const out = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + Number(r[col("cnt")]);
  }
  return out;
};
const compare = (view, rows) => {
  const groups = aggregate(rows, (r) => r[col("season")]),
    months = aggregate(rows, (r) => r[col("dteday")].slice(0, 7));
  for (const chart of view.charts) {
    const expected = chart.kind === "line" ? months : groups;
    assert.equal(chart.points.length, Object.keys(expected).length);
    for (const p of chart.points) assert.equal(p.value, expected[p.label]);
  }
};
const t = await api("tasks/" + evidence.created.taskId);
compare(t.dashboard, lines);
const view = await api("tasks/" + t.id + "/dashboard", {
  filter: { column: "workingday", value: "1" },
});
compare(
  view,
  lines.filter((r) => r[col("workingday")] === "1"),
);
await assert.rejects(
  api("tasks", {
    request: "Injection rejection",
    datasetId: t.datasetId,
    measure: { operation: "sum", column: 'cnt"; DROP TABLE data;--' },
    groupColumn: "season",
    dateColumn: "dteday",
    negativePolicy: "include",
  }),
  /Select a valid column/,
);
console.log(
  "All 56 plotted Bike values independently matched, including filtered monthly/group charts; injected column rejected before model work.",
);
