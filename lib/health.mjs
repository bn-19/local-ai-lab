import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { statfs } from "node:fs/promises";
import { device } from "./actors.mjs";
import { models, version, catalog } from "./model.mjs";
import { relayStatus } from "./relay.mjs";
const exec = promisify(execFile);
let machine;
import {recommendModels} from "./model-catalog.mjs";
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
  let availableMemoryGB=os.freemem()/2**30;
  let memorySource='OS free memory; conservative fallback';
  if(os.platform()==='darwin')try{
    const {stdout}=await exec('vm_stat');
    const page=Number(stdout.match(/page size of (\d+) bytes/)?.[1]??4096);
    const count=label=>Number(stdout.match(new RegExp(label+':\\s+(\\d+)'))?.[1]??0);
    availableMemoryGB=(count('Pages free')+count('Pages inactive')+count('Pages speculative'))*page/2**30;
    memorySource='macOS vm_stat free + inactive + speculative pages; reclaimable estimate, not guaranteed allocation';
  }catch{}
  const result={
    status:
      runtimes.ollama.ready && runtimes.terse.ready
        ? "ready"
        : "setup_required",
    machine: {
      ...machine,
      freeDiskGB: Math.round((disk.bavail * disk.bsize) / 1e9),
      freeMemoryGB: Math.round((os.freemem() / 2 ** 30) * 10) / 10,
      availableMemoryGB:Math.round(availableMemoryGB*10)/10,
      memoryNote:memorySource,
    },
    runtimes,
    models: installed,
    recommendation: null,
    catalog,
  };
  result.recommendation=recommendModels({request:"General text task"},result).selected;
  return result;
}
