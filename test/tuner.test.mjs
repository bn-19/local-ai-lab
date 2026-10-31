import { test } from "node:test";
import assert from "node:assert/strict";
import { coerce, recipes } from "../lib/tuner.mjs";
const recipe = recipes["candy-vision"];
test("proposer values are clamped to the recipe bounds", () => {
  assert.equal(coerce(recipe, { knob: "epochs", value: 999, rationale: "x" }).value, 40);
  assert.equal(coerce(recipe, { knob: "epochs", value: 3.7, rationale: "x" }).value, 4);
  assert.equal(coerce(recipe, { knob: "lr", value: 0, rationale: "x" }).value, 0.0001);
  assert.equal(coerce(recipe, { knob: "normalize_features", value: 1, rationale: "x" }).value, true);
});
test("non-numeric proposals are rejected, long rationales are cut", () => {
  assert.throws(() => coerce(recipe, { knob: "lr", value: "fast", rationale: "x" }));
  assert.equal(coerce(recipe, { knob: "hidden", value: 64, rationale: "y".repeat(5000) }).rationale.length, 1000);
});
