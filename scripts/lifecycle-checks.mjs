import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { api, token } from "./api-client.mjs";
import { device, save, state } from "../lib/actors.mjs";
import { randomUUID } from "node:crypto";
const origin = "https://local-lab-bn-19s-projects.vercel.app";
const request = (route, headers) =>
  fetch("http://127.0.0.1:4173/api/" + route, { headers });
assert.equal((await request("health", { Origin: origin })).status, 401);
assert.equal(
  (
    await request("health", {
      Origin: "https://bad.example",
      Authorization: "Bearer " + token,
    })
  ).status,
  403,
);
const hostStatus = await new Promise((resolve, reject) => {
  const r = httpRequest(
    "http://127.0.0.1:4173/api/health",
    { headers: { Host: "evil.example", Authorization: "Bearer " + token } },
    (res) => {
      res.resume();
      resolve(res.statusCode);
    },
  );
  r.on("error", reject);
  r.end();
});
assert.equal(hostStatus, 403);
assert.equal(
  (await request("health", { Authorization: "Bearer " + "é".repeat(64) }))
    .status,
  401,
);
const preflight = await fetch("http://127.0.0.1:4173/api/datasets", {
  method: "OPTIONS",
  headers: {
    Origin: origin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type,x-filename",
  },
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
await assert.rejects(
  api("tasks", {
    request: "bad input",
    datasetId: "../../etc/passwd",
    measure: { operation: "sql" },
  }),
  /Dataset not found/,
);
const make = async (delay) => {
  const j = {
    id: randomUUID(),
    kind: "deferred",
    taskId: null,
    payload: {},
    status: "queued",
    notBefore: Date.now() + delay,
    stage: "Deferred until alarm",
    viaRelay: false,
  };
  await save("job:" + j.id, j);
  await device.enqueue(JSON.stringify(j));
  return j;
};
const cancelled = await make(10000);
await api("jobs/" + cancelled.id + "/cancel", {});
assert.equal((await api("jobs/" + cancelled.id)).status, "cancelled");
const before = JSON.parse(await device.read()).alarms;
const deferred = await make(1800);
let result;
for (let i = 0; i < 25; i++) {
  await new Promise((r) => setTimeout(r, 400));
  result = await api("jobs/" + deferred.id);
  if (result.status === "ready") break;
}
assert.equal(result.status, "ready");
assert.ok(JSON.parse(await device.read()).alarms > before);
const tasks = Object.entries(await state()).filter(([k]) =>
  k.startsWith("task:"),
);
assert.ok(
  tasks.some(
    ([, t]) =>
      t.id === "3f9eefe6-592a-4029-94df-612ec6d44072" && t.status === "ready",
  ),
);
console.log(
  JSON.stringify({
    authAndOrigin: true,
    invalidDatasetRejected: true,
    queuedCancellation: cancelled.id,
    deferredJob: deferred.id,
    alarmObserved: true,
    savedTaskRecovered: true,
  }),
);
