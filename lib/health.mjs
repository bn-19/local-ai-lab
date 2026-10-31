import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { statfs } from "node:fs/promises";
import { device } from "./actors.mjs";
import { models, version, catalog } from "./model.mjs";
import { relayStatus } from "./relay.mjs";
const exec = promisify(execFile);
let machine;
export async function health() {
  if (!machine) {
    let chip = os.cpus()[0]?.model ?? "Unknown";
    try {
      const r = await exec("system_profiler", ["SPHardwareDataType", "-json"]);
      const h = JSON.parse(r.stdout).SPHardwareDataType[0];
      chip = h.chip_type ?? chip;
    } catch {}
    machine = {
      chip,
      memoryGB: Math.round(os.totalmem() / 2 ** 30),
      platform: os.platform(),
      arch: os.arch(),
    };
  }
  const disk = await statfs(".local-lab"),
    runtimes = {
      ollama: { ready: false },
      terse: { ready: false },
      relay: { ...relayStatus },
    };
  let installed = [];
  try {
    installed = await models();
    runtimes.ollama = { ready: true, version: await version() };
  } catch {
    runtimes.ollama.error =
      "Start project Ollama runtime with npm run runtime:ollama";
  }
  try {
    await device.read();
    runtimes.terse.ready = true;
  } catch {
    runtimes.terse.error = "Start Terse with npm run runtime:actors";
  }
  return {
    status:
      runtimes.ollama.ready && runtimes.terse.ready
        ? "ready"
        : "setup_required",
    machine: {
      ...machine,
      freeDiskGB: Math.round((disk.bavail * disk.bsize) / 1e9),
      freeMemoryGB: Math.round((os.freemem() / 2 ** 30) * 10) / 10,
      memoryNote:
        "Free memory excludes reclaimable caches; 6 GB model budget is an estimate.",
    },
    runtimes,
    models: installed,
    recommendation: catalog[0],
    catalog,
  };
}
