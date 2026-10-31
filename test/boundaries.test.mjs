import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../lib/model.mjs";
const task = {
  measure: { operation: "sum", column: "cnt" },
  groupColumn: "season",
  dateColumn: "date",
};
test("model cannot substitute a measure or invent grouping columns", () => {
  for (const plan of [
    {
      operation: "mean",
      groupColumn: "season",
      dateColumn: "date",
      chart: "bar",
      explanation: "x",
    },
    {
      operation: "sum",
      groupColumn: "DROP TABLE data",
      dateColumn: "date",
      chart: "bar",
      explanation: "x",
    },
    null,
  ])
    assert.throws(() => validatePlan(plan, task));
  assert.equal(
    validatePlan(
      {
        operation: "sum",
        groupColumn: "season",
        dateColumn: "date",
        chart: "bar",
        explanation: "Total by season",
      },
      task,
    ).operation,
    "sum",
  );
});
