import { AgentRelay } from "@agent-relay/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir(".local-lab", { recursive: true });
let identities;
try {
  identities = JSON.parse(await readFile(".local-lab/relay.json", "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const relay = identities
  ? new AgentRelay({ workspaceKey: identities.workspaceKey })
  : process.env.RELAY_WORKSPACE_KEY
    ? new AgentRelay({ workspaceKey: process.env.RELAY_WORKSPACE_KEY })
    : await AgentRelay.createWorkspace({ name: "Local Lab analytics" });
identities ??= { workspaceKey: relay.workspaceKey };
await writeFile(".local-lab/relay.json", JSON.stringify(identities), {
  mode: 0o600,
});
for (const name of ["planner", "evaluator", "trainer"]) {
  if (identities[name]) continue;
  const a = await relay.workspace.register({
    name: "local-lab-" + name,
    type: "agent",
  });
  identities[name] = { token: a.token, id: a.id, handle: a.handle };
  await writeFile(".local-lab/relay.json", JSON.stringify(identities), {
    mode: 0o600,
  });
}
console.log("App-owned Relay workspace and three identities saved privately");
process.exit(0);
