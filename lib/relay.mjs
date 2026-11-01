import { readFile } from "node:fs/promises";
export const relayEnabled = (env = process.env) => env.LOCAL_LAB_RELAY_ENABLED === '1';
export const relayStatus = { enabled: relayEnabled(), ready: false, mode: relayEnabled() ? 'relay' : 'local' };
let relay, planner, evaluator, trainer;
const agents = {};
export async function connectRelay(onRequest, onCompletion, onHandoff = async () => {}) {
  // Having saved credentials is not consent to connect. Default startup never
  // imports the cloud SDK or reads those credentials.
  if (!relayStatus.enabled) return;
  try {
    const { AgentRelay } = await import('@agent-relay/sdk');
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
    if(keys.trainer)trainer=await relay.workspace.reconnect({apiToken:keys.trainer.token});
    Object.assign(agents,{planner,evaluator,trainer});
    relayStatus.agents=Object.keys(agents).filter(k=>agents[k]);
    relay.addListener("dm.received", async (event) => {
      try {
        if (![planner.id, evaluator.id, trainer?.id].includes(event.envelope.from.id))
          return;
        const message = JSON.parse(event.message.text);
        if(message.protocol==='local-lab-loop-v1'){
          if(!/^[a-f0-9-]{36}$/.test(message.loopId)||agents[message.from]?.id!==event.envelope.from.id||!agents[message.to])return;
          await onHandoff({...message,messageId:event.message.messageId,receivedAt:Date.now()});return;
        }
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

export async function agentHandoff({loopId,from,to,phase,score}){
 if(!relayStatus.ready||!agents[from]||!agents[to])throw Error('Connect Planner, Evaluator and Trainer Relay identities first');
 const message=await agents[from].sendMessage({to:'@local-lab-'+to,text:JSON.stringify({protocol:'local-lab-loop-v1',loopId,from,to,phase,score})});
 return message.messageId;
}

// Confirm delivery by reading the recipient's actual inbox, independent of websocket timing.
export async function receiveHandoff(messageId,to){
 const client=agents[to];if(!client)throw Error('Recipient is not connected');
 const inbox=await client.inbox.list({limit:100});
 const item=inbox.items.find(i=>i.message.messageId===messageId);
 if(!item)return null;
 const message=JSON.parse(item.message.text);
 if(message.protocol!=='local-lab-loop-v1'||message.to!==to||agents[message.from]?.id!==item.message.from.id)throw Error('Unexpected handoff sender or recipient');
 await client.inbox.ack({inboxItemId:item.id,state:'read'});
 return {...message,messageId,receivedAt:Date.now(),receiptSource:'recipient inbox',inboxItemId:item.id};
}
