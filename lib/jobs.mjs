import {answerDocument} from './document-answer.mjs';
import {selectedTaskModel,checkInstall} from './model-selection.mjs';
import {runAgentLoop} from './agent-loop.mjs';
import { documentChunks, documentSchema } from './documents.mjs';
import path from 'node:path';
import {isCandy} from './candy.mjs';
import {inferLiveReport,validateMapping,retailMapping,validateExclusions} from './live-reporting.mjs';
import { runFineTune } from './finetune.mjs';
import { reportingVersion, rules, reportingCases, reportingInput, reportingSchema, reportingPrompts, gradeReport } from './reporting.mjs';
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { device, state, save } from "./actors.mjs";
import {
  models,
  verifyModel,
  pull,
  generate as generateModel,
  planSchema,
  prompts,
  validatePlan,
  MODEL,
} from "./model.mjs";
import { dashboard, validateDefinition, liveReport, candyReport } from "./data.mjs";
import { connectRelay, requestWork, completed, relayStatus } from "./relay.mjs";
const executor = randomUUID();
let running = false,
  abort,
  current,
  timer;
export async function getJob(id) {
  return (await state())["job:" + id];
}
async function putJob(job) {
  const old=await getJob(job.id);
  const events=old?.events??[];
  if(!old||old.stage!==job.stage||old.status!==job.status)job.events=[...events,{at:Date.now(),actor:'System',phase:job.kind,status:job.status,summary:job.stage??job.status}].slice(-200);
  else job.events=events;
  await save("job:" + job.id, job);
  return job;
}
export async function enqueue(
  kind,
  taskId,
  payload = {},
  useRelay = false,
  delay = 0,
) {
  const job = {
    id: randomUUID(),
    kind,
    taskId,
    payload,
    status: "queued",
    stage: useRelay ? "Waiting for Relay delivery" : "Queued",
    createdAt: Date.now(),
    notBefore: Date.now() + delay,
    viaRelay: useRelay,
  };
  await putJob(job);
  if (useRelay) {
    try {
      const messageId = await requestWork(job);
      await putJob({ ...(await getJob(job.id)), requestMessageId: messageId });
    } catch (e) {
      await putJob({ ...job, status: "failed", error: e.message });
      throw e;
    }
  } else await device.enqueue(JSON.stringify(job));
  return job;
}
export async function createTask(input) {
  const s = await state(),
    dataset = s["dataset:" + input.datasetId];
  if(input.documentId) {
    const document=s['document:'+input.documentId];
    if(!document)throw Error('Document not found');
    if(typeof input.request!=='string'||input.request.trim().length<3||input.request.length>2000)throw Error('Describe your task in 3–2000 characters');
    const {model,selection}=await selectedTaskModel({...input,inputKind:'document'});
    const task={id:randomUUID(),kind:'document',documentId:document.id,request:input.request,model,selection,status:'queued',createdAt:Date.now()};
    await save('task:'+task.id,task);
    const job=await enqueue('document',task.id);return {taskId:task.id,jobId:job.id};
  }
  if (!dataset && !input.datasetId) {
    const {model,selection}=await selectedTaskModel(input);
    const task={id:randomUUID(),kind:'text',request:input.request,model,selection,status:'queued',createdAt:Date.now()};
    await save('task:'+task.id,task);
    const job=await enqueue('text',task.id);return {taskId:task.id,jobId:job.id};
  }
  if (!dataset) throw Error("Dataset not found");
  if (
    typeof input.request !== "string" ||
    input.request.length < 3 ||
    input.request.length > 4000
  )
    throw Error("Describe your task in 3–4000 characters");
  validateDefinition(dataset, input);
  const {model,selection}=await selectedTaskModel({...input,inputKind:"csv"});
  const task = {
    request: input.request,
    datasetId: input.datasetId,
    measure: input.measure,
    dateColumn: input.dateColumn ?? null,
    groupColumn: input.groupColumn,
    filterColumn: input.filterColumn ?? null,
    negativePolicy: input.negativePolicy,
    followup: input.followup === true,
    id: randomUUID(),
    model,
    selection,
    configuration: s.recipe?.model?.digest===model.digest?(s.recipe.configuration??"baseline"):"baseline",
    status: "queued",
    createdAt: Date.now(),
  };
  await save("task:" + task.id, task);
  const job = await enqueue("plan", task.id, {}, !input.reuseRecipe);
  return { taskId: task.id, jobId: job.id };
}
export async function cancelJob(id) {
  const job = await getJob(id);
  if (!job) throw Error("Job not found");
  if (!["queued", "running"].includes(job.status)) return;
  await device.cancel(id);
  if (current?.id === id) abort.abort();
  else if (job.status === "queued") {
    await putJob({ ...job, status: "cancelled", stage: "Cancelled" });
    if(job.kind==='agentloop')await save('loop:'+job.id,{id:job.id,taskId:job.taskId,status:'cancelled',events:[],completedAt:Date.now()});
    if(['document','text'].includes(job.kind)) {const task=(await state())['task:'+job.taskId];await save('task:'+job.taskId,{...task,status:'cancelled',error:'Document reading cancelled'});}
    if (["evalcase", "optimize"].includes(job.kind)) {
      const evaluation = (await state())["evaluation:" + job.taskId];
      await save("evaluation:" + job.taskId, {
        ...evaluation,
        stage: "cancelled",
        error: "Evaluation cancelled",
        failedJobId: job.id,
      });
    }
  }
}
export async function initializeWorker() {
  // A prior process must be gone before freeing its reservation. PID reuse errs on the safe side.
  try {
    const old = JSON.parse(await readFile(".local-lab/executor.json", "utf8"));
    let alive = true;
    try {
      process.kill(old.pid, 0);
    } catch (e) {
      if (e.code === "ESRCH") alive = false;
    }
    if (alive)
      throw Error(
        "Another executor may still be alive; stop it before restarting",
      );
    const previous = JSON.parse(await device.read());
    if (previous.active)
      throw Error(
        "Previous job may still be running in Ollama or the fine-tuning process group. Stop the task-owned runtime and follow the documented recovery steps before restarting.",
      );
    await device.reconcile(old.executor);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await writeFile(
    ".local-lab/executor.json",
    JSON.stringify({ pid: process.pid, executor }),
    { mode: 0o600 },
  );
  const recovered = await state();
  if (recovered.recipe && !recovered.recipe.evaluation) {
    const completed = Object.entries(recovered)
      .filter(([key, value]) => key.startsWith("evaluation:") && !value.benchmark && value.stage === "complete" && value.selected === recovered.recipe.configuration && recovered["task:" + key.slice(11)]?.model?.digest === recovered.recipe.model?.digest)
      .map(([, value]) => value).sort((a, b) => b.completedAt - a.completedAt)[0];
    if (completed) await save("recipe", { ...recovered.recipe, evaluation: completed });
  }
  await connectRelay(
    async (message, messageId) => {
      const job = await getJob(message.jobId);
      if (!job || job.taskId !== message.taskId || job.status !== "queued")
        return;
      await save("job:" + job.id, {
        ...job,
        receivedMessageId: messageId,
        stage: "Relay received; queued",
      });
      await device.enqueue(JSON.stringify(job));
    },
    async (message, messageId) => {
      const job = await getJob(message.jobId);
      if (job) await putJob({ ...job, completionReceivedId: messageId });
    },
    async message => save("handoff:"+message.messageId,message),
  );
  // Recover between jobs: local queued tasks can be re-enqueued idempotently. Relay requests are re-sent with same job ID.
  for (const job of Object.values(await state()).filter(
    (v) => v?.id && v?.kind && v.status === "queued",
  )) {
    if (job.viaRelay && relayStatus.ready) await requestWork(job);
    else if (!job.viaRelay) await device.enqueue(JSON.stringify(job));
  }
  timer = setInterval(
    () => tick().catch((e) => console.error("Worker:", e.message)),
    400,
  );
  timer.unref();
}
async function tick() {
  if (running) return;
  running = true;
  let job, attempt;
  try {
    const snapshot = await state();
    for (const pending of Object.values(snapshot).filter(
      (v) =>
        v?.kind &&
        v.viaRelay &&
        v.status === "queued" &&
        !v.receivedMessageId &&
        Date.now() - v.createdAt > 60000,
    )) {
      await putJob({
        ...pending,
        status: "failed",
        stage: "Relay delivery timed out",
        error:
          "No correlated Relay delivery within 60 seconds; retry as a new job.",
      });
      if (pending.taskId && pending.kind === "plan") {
        const task = snapshot["task:" + pending.taskId];
        await save("task:" + pending.taskId, {
          ...task,
          status: "failed",
          error: "Relay delivery timed out",
        });
      }
    }
    attempt = randomUUID();
    job = JSON.parse(await device.reserve(executor, attempt));
    if (!job) return;
    current = job;
    abort = new AbortController();
    await putJob({
      ...(await getJob(job.id)),
      attempt,
      executor,
      status: "running",
      startedAt: Date.now(),
      stage: job.kind === "install" ? "Downloading" : job.kind === "deferred" ? "Running deferred work" : "Running local model",
    });
    const watcher = setInterval(async () => {
      try {
        const d = JSON.parse(await device.read());
        if (d.active?.attempt === attempt && d.active.cancel) abort.abort();
      } catch {}
    }, 500);
    let result,
      status = "ready",
      error;
    try {
      result = await execute(job, abort.signal);
    } catch (e) {
      status = abort.signal.aborted ? "cancelled" : "failed";
      error = e.message;
    } finally {
      clearInterval(watcher);
    }
    const final = {
      ...(await getJob(job.id)),
      status,
      stage: status === "ready" ? "Complete" : status,
      result,
      error,
      finishedAt: Date.now(),
    };
    await putJob(final);
    await device.finish(attempt, JSON.stringify({ status, error }));
    if (job.taskId && ["plan", "document", "text"].includes(job.kind) && status !== "ready") {
      const t = (await state())["task:" + job.taskId];
      await save("task:" + job.taskId, { ...t, status, error });
    }
    if (job.viaRelay) {
      try {
        const messageId = await completed(final);
        await putJob({
          ...(await getJob(job.id)),
          completionMessageId: messageId,
        });
      } catch (e) {
        await putJob({ ...(await getJob(job.id)), relayError: e.message });
      }
    }
    if (status === "ready") await afterJob(job, result);
    else if (["evalcase", "optimize"].includes(job.kind)) {
      const e = (await state())["evaluation:" + job.taskId];
      await save("evaluation:" + job.taskId, {
        ...e,
        stage: status === "cancelled" ? "cancelled" : "failed",
        error,
        failedJobId: job.id,
      });
    }
  } finally {
    running = false;
    current = null;
    abort = null;
  }
}
async function execute(job, signal) {
  const generate=async (...args)=>{
    const trial=await generateModel(...args,task?.model??{id:MODEL});
    if(Number.isFinite(trial.inputTokens)&&Number.isFinite(trial.tokens)){
      const latest=await getJob(job.id), usage=latest.usage||{inputTokens:0,outputTokens:0,calls:0};
      await putJob({...latest,usage:{inputTokens:usage.inputTokens+trial.inputTokens,outputTokens:usage.outputTokens+trial.tokens,calls:usage.calls+1}});
    }
    return trial;
  };
  const s = await state(),
    task = s["task:" + job.taskId],
    dataset = task ? s["dataset:" + task.datasetId] : null;
  if(job.kind==='text'){
    const trial=await generate('Answer the user request directly. Output JSON with an answer string containing the answer, not a plan to answer. You cannot execute code, access files, or use tools. Code is text for review only.',{request:task.request},documentSchema,signal);
    if(typeof trial.value?.answer!=='string'||trial.value.answer.length>12000)throw Error('Invalid text answer');
    signal.throwIfAborted();const result={answer:trial.value.answer,model:trial.model,elapsedMs:trial.elapsedMs};
    await save('task:'+task.id,{...task,status:'ready',textResult:result,completedAt:Date.now()});return result;
  }
  if (job.kind === 'document') {
    const document=s['document:'+task.documentId];
    if(!document || !/^[a-f0-9-]{36}$/.test(document.id))throw Error('Document not found');
    const text=await readFile(path.resolve('.local-lab','documents',document.id+'.txt'),'utf8');
    const synthesized=await answerDocument({text,request:task.request,generate,signal,context:task.model.context??4096,progress:async stage=>putJob({...await getJob(job.id),stage})});
    signal.throwIfAborted();
    const result={name:document.name,characters:document.characters,...synthesized,model:task.model.id,modelBinding:task.model};
    await save('task:'+task.id,{...task,status:'ready',documentResult:result});
    return result;
  }
  if (job.kind === "install") {
    const candidate=await checkInstall(job.payload.modelId??MODEL);
    if(candidate.installed)return {...await verifyModel({id:candidate.id}),cacheReused:true};
    await pull(signal, async (update) => {
      await putJob({ ...(await getJob(job.id)), ...update });
    },candidate.id);
    return {...await verifyModel({id:candidate.id}),cacheReused:false};
  }
  if (job.kind === "agentloop") return runAgentLoop(job,signal,async stage=>putJob({...await getJob(job.id),stage}));
  if (job.kind === "deferred") return { alarmTriggered: true, at: Date.now() };
  if (job.kind === "report") {
    const recipe=s["fineTune:"+job.payload.adapterJobId];
    if(!recipe)throw Error("Trained adapter not found");
    const candy=job.payload.profile==='candy';
    const mapping=candy?null:validateMapping(dataset,job.payload.mapping);
    const trial=await inferLiveReport(job,recipe,signal);
    const modelPlan=trial.plan;
    const plan=candy&&job.payload.confirmedSubset?{...modelPlan,subset:job.payload.confirmedSubset}:modelPlan;
    const calculated=candy?await candyReport(dataset,plan):await liveReport(dataset,mapping,trial.plan,job.payload.excludedProductCodes);
    const result={...trial,...calculated,modelPlan,plan,confirmedSubset:job.payload.confirmedSubset??null,datasetPolicy:candy?null:{excludedProductCodes:job.payload.excludedProductCodes,note:"For merchandise scope, this explicit dataset exclusion list supersedes the synthetic training fixture codes. Samples and unrecognized codes remain included."},request:job.payload.request,mapping,datasetId:dataset.id,datasetName:dataset.name,jobId:job.id,completedAt:Date.now()};
    await save("report:"+job.id,result);
    const latest=(await state())["task:"+job.taskId];
    await save("task:"+job.taskId,{...latest,liveReport:result});
    return result;
  }
  if (job.kind === "finetune") {
    const result = await runFineTune(job, signal, async stage => {
      await putJob({ ...(await getJob(job.id)), stage });
    });
    const latest = (await state())["task:" + job.taskId];
    await save("task:" + job.taskId, { ...latest, fineTune: result });
    await save("fineTune:" + job.id, result);
    return result;
  }
  if (job.kind === "plan") {
    const system = task.followup
      ? prompts[task.configuration] +
        " For this follow-up, the previous choices below are context rather than binding: infer the requested operation, grouping and date from the new request, using only listed columns. Keep the original numeric measure columns; if unsupported, preserve choices and explain the limitation."
      : prompts[task.configuration];
    const trial = await generate(
      system,
      {
        request: task.request,
        columns: dataset.columns,
        [task.followup ? "previous" : "confirmed"]: {
          measure: task.measure,
          groupColumn: task.groupColumn,
          dateColumn: task.dateColumn ?? null,
        },
      },
      planSchema,
      signal,
    );
    const selected = task.followup
      ? {
          ...task,
          measure: { ...task.measure, operation: trial.value.operation },
          groupColumn: trial.value.groupColumn,
          dateColumn: trial.value.dateColumn,
        }
      : task;
    validateDefinition(dataset, selected);
    const plan = validatePlan(trial.value, selected);
    const output = await dashboard(dataset, { ...selected, plan });
    await save("task:" + task.id, {
      ...selected,
      status: "ready",
      plan,
      dashboard: output,
      measurement: {
        elapsedMs: trial.elapsedMs,
        tokens: trial.tokens,
        loadMs: trial.loadMs,
      },
      completedAt: Date.now(),
    });
    await save("recipe", {
      ...s.recipe,
      taskId: task.id,
      model: task.model,
      configuration: task.configuration,
      version: 1,
      measure: selected.measure,
      selectedAt: Date.now(),
    });
    return {
      taskId: task.id,
      elapsedMs: trial.elapsedMs,
      tokens: trial.tokens,
    };
  }
  if (job.kind === "evalcase") {
    const c = job.payload.case;
    const trial = await generate(reportingPrompts[job.payload.configuration], reportingInput(c), reportingSchema, signal);
    return { id:c.id, request:c.request, split:c.split, ...gradeReport(trial.value,c), elapsedMs:trial.elapsedMs, plan:trial.value };
  }
  if (job.kind === "optimize") {
    const evaluation = s["evaluation:" + task.id];
    const failures = evaluation.baseline
      .filter((r) => r.split === "development")
      .map(({ id, passed, failure, elapsedMs }) => ({
        id,
        passed,
        failure,
        elapsedMs,
      }));
    const trial = await generate(
      "You optimize a local CSV planner. Based only on development failures, choose baseline or tuned prompt configuration. This is prompt/config optimization, not weight training. Return a short rationale.",
      { failures, options: reportingPrompts },
      {
        type: "object",
        required: ["configuration", "rationale"],
        properties: {
          configuration: { type: "string", enum: ["baseline", "tuned"] },
          rationale: { type: "string" },
        },
      },
      signal,
    );
    return trial.value;
  }
  throw Error("Unsupported job");
}
const evalCases = reportingCases;
const caseAt = index => evalCases[index];
export async function evaluate(taskId) {
  const existing = await state();
  if (!existing["task:" + taskId]) throw Error("Task not found");
  if (
    existing["evaluation:" + taskId] &&
    !["complete", "failed", "cancelled"].includes(existing["evaluation:" + taskId].stage)
  )
    throw Error("An evaluation is already in progress");
  await save("evaluation:" + taskId, {
    baseline: [],
    tuned: [],
    stage: "baseline",
    type: "prompt adaptation; no weight training",
    benchmark: reportingVersion,
    policy: rules,
    scope: "Authored synthetic retail benchmark; independent of uploaded CSV. Not a production dashboard accuracy score.",
    model: existing["task:" + taskId].model,
    prompts: reportingPrompts,
    startedAt: Date.now(),
  });
  return enqueue("evalcase", taskId, {
    configuration: "baseline",
    index: 0,
    case: caseAt(0),
  });
}
async function afterJob(job, result) {
  if (job.kind === "evalcase") {
    const e = (await state())["evaluation:" + job.taskId],
      config = job.payload.configuration;
    e[config] = [...e[config], result];
    await save("evaluation:" + job.taskId, e);
    if (job.payload.index < evalCases.length - 1)
      await enqueue("evalcase", job.taskId, {
        configuration: config,
        index: job.payload.index + 1,
        case: caseAt(job.payload.index + 1),
      });
    else if (config === "baseline")
      await enqueue(
        "optimize",
        job.taskId,
        {
          scores: e.baseline
            .filter((r) => r.split === "development")
            .map((r) => ({ id: r.id, passed: r.passed, failure: r.failure })),
        },
        true,
      );
    else await finalizeEvaluation(job.taskId);
  }
  if (job.kind === "optimize") {
    const e = (await state())["evaluation:" + job.taskId];
    await save("evaluation:" + job.taskId, {
      ...e,
      proposal: result,
      stage: "tuned",
    });
    // Measure the one predefined development-example candidate even if the optimizer prefers baseline.
    await enqueue("evalcase", job.taskId, {
      configuration: "tuned", index: 0, case: caseAt(0),
    });
  }
}
async function finalizeEvaluation(taskId) {
  const s = await state(),
    e = s["evaluation:" + taskId];
  const score = (rs) =>
    rs.filter((r) => r.split === "final" && r.passed).length;
  const selected = score(e.tuned) > score(e.baseline) ? "tuned" : "baseline";
  const result = {
    ...e,
    stage: "complete",
    selected,
    baselineScore: score(e.baseline),
    tunedScore: score(e.tuned),
    finalCount: evalCases.filter(c => c.split === "final").length,
    completedAt: Date.now(),
  };
  await save("evaluation:" + taskId, result);
  await save("task:" + taskId, { ...s["task:" + taskId], evaluation: result });
  // This reporting schema is distinct from the dashboard planner: never promote it into that recipe.
  await save("reportingRecipe", { version:reportingVersion, model:s["task:" + taskId].model, configuration:selected, prompt:reportingPrompts[selected], policy:rules, evaluation:result });
}
export async function fineTune(taskId) {
  const s = await state();
  if (!s["task:" + taskId]) throw Error("Task not found");
  if(s["task:"+taskId].model?.id!==MODEL||!s["task:"+taskId].datasetId)throw Error("Fine-tuning unavailable for this model/task; reviewed Qwen3 candy/retail recipes only");
  if (Object.values(s).some(v => v?.kind === "finetune" && ["queued","running"].includes(v.status))) throw Error("Fine-tuning already in progress");
  return enqueue("finetune", taskId,{profile:isCandy(s["dataset:"+s["task:"+taskId].datasetId])?"candy":"retail"});
}
export async function requestReport(taskId,input){
 const s=await state(),task=s["task:"+taskId];
 if(!task)throw Error("Task not found");
 if(task.model?.id&&task.model.id!==MODEL)throw Error("Saved Qwen3 adapters cannot be applied to another selected base model");
 if(typeof input.request!=="string"||!input.request.trim()||input.request.length>2000)throw Error("Enter a reporting question (maximum 2000 characters)");
 const profile=isCandy(s["dataset:"+task.datasetId])?"candy":"retail";
 const mapping=profile==="candy"?null:validateMapping(s["dataset:"+task.datasetId],input.mapping??retailMapping);
 const excludedProductCodes=validateExclusions(input.excludedProductCodes);
 if(Object.keys(input).some(k=>!["request","mapping","adapterJobId","excludedProductCodes","subset"].includes(k)))throw Error("Unsupported report option; date/country filters are not implemented");
 if(input.subset!==undefined&&(profile!=="candy"||!["all","chocolate","fruity"].includes(input.subset)))throw Error("Choose All, Chocolate or Fruity for candy reports");
 const candidates=Object.entries(s).filter(([key,v])=>key.startsWith("fineTune:")&&v.selected==="adapter"&&(v.profile??"retail")===profile);
 const preferred=input.adapterJobId??s["selectedAdapter:"+profile]?.jobId;
 const chosen=preferred?candidates.find(([key])=>key==="fineTune:"+preferred):candidates.at(-1);
 if(!chosen)throw Error("Complete a successful adapter experiment first");
 return enqueue("report",taskId,{request:input.request.trim(),profile,mapping,excludedProductCodes,confirmedSubset:input.subset??null,adapterJobId:chosen[0].slice(9)});
}
export async function startAgentLoop(taskId){
 const s=await state();const task=s['task:'+taskId];
 if(task?.model?.id&&task.model.id!==MODEL)throw Error('Candy training loop requires its matching Qwen3 base');
 if(!task||!isCandy(s['dataset:'+task.datasetId]))throw Error('Choose the candy task');
 if(Object.values(s).some(v=>v?.kind==='agentloop'&&['queued','running'].includes(v.status)))throw Error('An agent loop is already running');
 const candidates=Object.entries(s).filter(([k,v])=>k.startsWith('fineTune:')&&v.profile==='candy'&&v.selected==='adapter');
 const preferred=s['selectedAdapter:candy']?.jobId;
 const selected=preferred?candidates.find(([k])=>k==='fineTune:'+preferred):candidates.at(-1);
 if(!selected)throw Error('Train the initial candy adapter first');
 const cloudBackoff=Object.entries(s).some(([k,v])=>k.startsWith('loop:')&&v.transportFallback&&Date.now()-(v.completedAt??v.startedAt)<300000);
 return enqueue('agentloop',taskId,{baselineJobId:selected[0].slice(9),cloudBackoff});
}
export function stopWorker() {
  clearInterval(timer);
  abort?.abort();
}
