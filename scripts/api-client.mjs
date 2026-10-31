import { readFile } from "node:fs/promises";
export const token = (
  await readFile(".local-lab/pairing-token", "utf8")
).trim();
export async function api(route, body, options = {}) {
  const r = await fetch("http://127.0.0.1:4173/api/" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...options.headers,
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
    ...options,
  });
  const data = await r.json();
  if (!r.ok) throw Error(r.status + " " + JSON.stringify(data));
  return data;
}
if (process.argv[1]?.endsWith("api-client.mjs"))
  console.log(
    JSON.stringify(
      await api(
        process.argv[2] ?? "health",
        process.argv[3] ? JSON.parse(process.argv[3]) : undefined,
      ),
      null,
      2,
    ),
  );
