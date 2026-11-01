import { readFile } from "node:fs/promises";
try {
  process.env.TERSE_API_KEY ??= (
    await readFile(".local-lab/actor-secret", "utf8")
  ).trim();
} catch {}
import { createActorStub } from "terse-sdk/actors";
const stub = (name, id, methods) => {
  const raw = createActorStub(
    name,
    id,
    methods.map((name) => ({ name, result: "value" })),
  );
  return Object.fromEntries(
    methods.map((method) => [
      method,
      async (...args) => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await raw[method](...args);
          } catch (e) {
            if (
              attempt >= 20 ||
              !/unavailable|restarting|fetch failed|ECONNREFUSED/i.test(
                e.message,
              )
            )
              throw e;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      },
    ]),
  );
};
export const project = stub("Project", "analytics", ["read", "put", "routeJob"]);
export const device = stub("Device", "local-mac", [
  "read",
  "enqueue",
  "reserve",
  "finish",
  "cancel",
  "reconcile",
]);
export const state = async () => JSON.parse(await project.read());
export const save = (key, value) => project.put(key, JSON.stringify(value));
