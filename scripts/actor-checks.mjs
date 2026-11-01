import assert from "node:assert/strict";
import { createActorStub } from "terse-sdk/actors";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
try {
  process.env.TERSE_API_KEY = (
    await readFile(".local-lab/actor-secret", "utf8")
  ).trim();
} catch {}
const d = createActorStub(
  "Device",
  "test-" + randomUUID(),
  ["read", "enqueue", "reserve", "finish", "cancel", "reconcile"].map(
    (name) => ({ name, result: "value" }),
  ),
);
const id = randomUUID();
await d.enqueue(JSON.stringify({ id }));
await d.enqueue(JSON.stringify({ id }));
assert.equal(JSON.parse(await d.read()).queue.length, 1);
const one = JSON.parse(await d.reserve("owner", "attempt-one"));
assert.equal(one.id, id);
assert.equal(JSON.parse(await d.reserve("owner", "attempt-one")).id, id);
assert.equal(await d.reserve("other", "attempt-two"), "null");
await assert.rejects(d.finish("attempt-two", "{}"), /Stale attempt/);
assert.equal(JSON.parse(await d.read()).active.attempt, "attempt-one");
await d.cancel(id);
assert.equal(JSON.parse(await d.read()).active.cancel, true);
await d.finish("attempt-one", '{"status":"cancelled"}');
await d.finish("attempt-one", '{"status":"cancelled"}');
const late = randomUUID();
await d.cancel(late);
await d.enqueue(JSON.stringify({id:late}));
assert.equal(await d.reserve("owner","after-cancel"),"null",'cancel before delivery must prevent execution');
const deferred = randomUUID();
await d.enqueue(JSON.stringify({ id: deferred, notBefore: Date.now() + 1800 }));
assert.equal(await d.reserve("owner", "too-soon"), "null");
await new Promise((r) => setTimeout(r, 2500));
const state = JSON.parse(await d.read());
assert.ok(state.alarms >= 1);
assert.equal(JSON.parse(await d.reserve("owner", "after-alarm")).id, deferred);
await d.finish("after-alarm", '{"status":"ready"}');
console.log(
  JSON.stringify({
    passed: true,
    duplicateEnqueuePrevented: true,
    exclusiveReservation: true,
    lateResultFenced: true,
    cancellation: true,
    alarmCount: state.alarms,
    actorId: d.id ?? "isolated test actor",
  }),
);
