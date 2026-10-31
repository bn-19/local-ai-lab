import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
for (const dir of ["lib", "scripts", "test"])
  for (const name of await readdir(dir))
    if (name.endsWith(".mjs"))
      execFileSync(process.execPath, ["--check", dir + "/" + name], {
        stdio: "inherit",
      });
execFileSync(process.execPath, ["--check", "server.mjs"], { stdio: "inherit" });
console.log("JavaScript syntax checks passed (no browser launched)");
