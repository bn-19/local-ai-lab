import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
const root = path.resolve(".local-lab");
await mkdir(root, { recursive: true });
let secret;
try {
  secret = (await readFile(path.join(root, "actor-secret"), "utf8")).trim();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  secret = randomBytes(32).toString("hex");
  await writeFile(path.join(root, "actor-secret"), secret, { mode: 0o600 });
}
const kind = process.argv[2];
const env = {
  ...process.env,
  PATH: path.resolve("node_modules/.bin") + ":" + process.env.PATH,
  XDG_CACHE_HOME: path.join(root, "cache"),
  DURABLE_ACTORS_DATA_DIR: path.resolve(".durable-actors"),
  TERSE_ACTOR_SECRET: secret,
  TERSE_API_KEY: secret,
  DURABLE_ACTORS_SECRET: secret,
  OLLAMA_HOST: "127.0.0.1:11435",
  OLLAMA_MODELS: path.join(root, "models"),
  OLLAMA_NO_CLOUD: "1",
  OLLAMA_NUM_PARALLEL: "1",
  OLLAMA_CONTEXT_LENGTH: "4096",
};
const commands = {
  actors: [
    path.resolve("node_modules/.bin/bun"),
    ["node_modules/terse-cli/dist/index.js", "actor", "dev"],
  ],
  ollama: [path.join(root, "runtime", "ollama"), ["serve"]],
  server: [process.execPath, ["server.mjs"]],
};
if (!commands[kind]) throw Error("Expected actors, ollama or server");
const [command, args] = commands[kind];
const child = spawn(command, args, { env, stdio: "inherit" });
child.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
