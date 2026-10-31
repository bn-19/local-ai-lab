import { AgentRelay } from "@agent-relay/sdk";
import { readFile } from "node:fs/promises";
export const relayStatus = { ready: false, error: "Relay not connected" };
let relay, planner, evaluator;
export async function connectRelay(onRequest, onCompletion) {
  try {
    const keys = JSON.parse(await readFile(".local-lab/relay.json", "utf8"));
    relay = new AgentRelay({
      workspaceKey: keys.workspaceKey,
      onError: () => {
        relayStatus.error = "Relay listener failure";
      },
    });
    planner = await relay.workspace.reconnect({ apiToken: keys.planner.token });
    evaluator = await relay.workspace.reconnect({
      apiToken: keys.evaluator.token,
    });
    relay.addListener("dm.received", async (event) => {
      try {
        if (![planner.id, evaluator.id].includes(event.envelope.from.id))
          return;
        const message = JSON.parse(event.message.text);
        if (
          message.protocol !== "local-lab-v1" ||
          !/^[-a-f0-9]{36}$/.test(message.jobId)
        )
          return;
        if (message.kind === "request")
          await onRequest(message, event.message.messageId);
        if (message.kind === "completion")
          await onCompletion(message, event.message.messageId);
      } catch (e) {
        if (e instanceof SyntaxError) return;
        relayStatus.error = e.message;
      }
    });
    relayStatus.ready = true;
    delete relayStatus.error;
  } catch (e) {
    relayStatus.ready = false;
    relayStatus.error =
      e.code === "ENOENT"
        ? "Run npm run setup:relay to create approved app-owned identities"
        : e.message;
  }
}
// Only identifiers/settings/aggregate scores cross Relay. Task text, schema, rows and output stay local.
export async function requestWork(job) {
  if (!relayStatus.ready) throw Error(relayStatus.error);
  const result = await planner.sendMessage({
    to: "@local-lab-evaluator",
    text: JSON.stringify({
      protocol: "local-lab-v1",
      kind: "request",
      jobId: job.id,
      taskId: job.taskId,
      work: job.kind,
      scores: job.kind === "optimize" ? job.payload.scores : undefined,
    }),
  });
  return result.messageId;
}
export async function completed(job) {
  if (!relayStatus.ready) return null;
  const result = await evaluator.sendMessage({
    to: "@local-lab-planner",
    text: JSON.stringify({
      protocol: "local-lab-v1",
      kind: "completion",
      jobId: job.id,
      taskId: job.taskId,
      status: job.status,
    }),
  });
  return result.messageId;
}
