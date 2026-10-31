import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { device, state, save } from "./actors.mjs";
import {
  models,
  pull,
  generate,
  planSchema,
  prompts,
  validatePlan,
  MODEL,
} from "./model.mjs";
import { dashboard, validateDefinition } from "./data.mjs";
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
  if (!dataset) throw Error("Dataset not found");
  if (
    typeof input.request !== "string" ||
    input.request.length < 3 ||
    input.request.length > 4000
  )
    throw Error("Describe your task in 3–4000 characters");
  validateDefinition(dataset, input);
  const model = (await models()).find((m) => m.id === MODEL);
  if (!model) throw Error("Install the recommended model first");
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
    configuration: s.recipe?.configuration ?? "baseline",
    status: "queued",
    createdAt: Date.now(),
  };
  await save("task:" + task.id, task);
  const job = await enqueue("plan", task.id, {}, !input.reuseRecipe);
  return { taskId: task.id, jobId: job.id };
}
export async function cancelJob(id) {
  await device.cancel(id);
  const job = await getJob(id);
  if (!job) throw Error("Job not found");
  if (current?.id === id) abort.abort();
  else await putJob({ ...job, status: "cancelled", stage: "Cancelled" });
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
        "Previous job may still be running in Ollama. Stop the project Ollama runtime and run the documented recovery command before restarting.",
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
      stage: job.kind === "install" ? "Downloading" : "Running local model",
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
    if (job.taskId && job.kind === "plan" && status !== "ready") {
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
        stage: "failed",
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
  const s = await state(),
    task = s["task:" + job.taskId],
    dataset = task ? s["dataset:" + task.datasetId] : null;
  if (job.kind === "install") {
    await pull(signal, async (update) => {
      await putJob({ ...(await getJob(job.id)), ...update });
    });
    return (await models()).find((m) => m.id === MODEL);
  }
  if (job.kind === "deferred") return { alarmTriggered: true, at: Date.now() };
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
      model: task.model,
      configuration: task.configuration,
      version: 1,
      measure: task.measure,
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
    const trial = await generate(
      prompts[job.payload.configuration],
      c.input,
      planSchema,
      signal,
    );
    let passed = true,
      failure = null;
    try {
      validatePlan(trial.value, c.expected);
      if (trial.value.chart !== c.chart) throw Error("Wrong chart choice");
    } catch (e) {
      passed = false;
      failure = e.message;
    }
    return {
      id: c.id,
      split: c.split,
      passed,
      failure,
      elapsedMs: trial.elapsedMs,
      plan: trial.value,
    };
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
      { failures, options: prompts },
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
const evalCases = [
  {
    id: "dev-total",
    split: "development",
    request: "Compare total units by category",
    op: "sum",
    chart: "bar",
  },
  {
    id: "dev-average",
    split: "development",
    request: "Compare average units by category",
    op: "mean",
    chart: "bar",
  },
  {
    id: "test-count",
    split: "final",
    request: "Compare number of records by category",
    op: "count",
    chart: "bar",
  },
  {
    id: "test-product",
    split: "final",
    request: "Compare net revenue by category",
    op: "product_sum",
    chart: "bar",
  },
];
function caseAt(index) {
  const c = evalCases[index],
    expected = {
      measure: {
        operation: c.op,
        column: "units",
        column2: c.op === "product_sum" ? "price" : undefined,
      },
      groupColumn: "category",
      dateColumn: "date",
    };
  return {
    ...c,
    expected,
    input: {
      request: c.request,
      columns: [
        { name: "units", type: "INTEGER" },
        { name: "price", type: "DOUBLE" },
        { name: "category", type: "VARCHAR" },
        { name: "date", type: "DATE" },
      ],
      confirmed: expected,
    },
  };
}
export async function evaluate(taskId) {
  const existing = await state();
  if (!existing["task:" + taskId]) throw Error("Task not found");
  if (
    existing["evaluation:" + taskId] &&
    !["complete", "failed"].includes(existing["evaluation:" + taskId].stage)
  )
    throw Error("An evaluation is already in progress");
  await save("evaluation:" + taskId, {
    baseline: [],
    tuned: [],
    stage: "baseline",
    type: "prompt/configuration",
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
    if (result.configuration === "tuned")
      await enqueue("evalcase", job.taskId, {
        configuration: "tuned",
        index: 0,
        case: caseAt(0),
      });
    else {
      await save("evaluation:" + job.taskId, {
        ...e,
        proposal: result,
        stage: "complete",
        selected: "baseline",
        reason: "Optimizer found no justified change",
        completedAt: Date.now(),
      });
    }
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
    finalCount: 2,
    completedAt: Date.now(),
  };
  await save("evaluation:" + taskId, result);
  await save("task:" + taskId, { ...s["task:" + taskId], evaluation: result });
  await save("recipe", {
    ...s.recipe,
    configuration: selected,
    evaluation: result,
  });
}
export function stopWorker() {
  clearInterval(timer);
  abort?.abort();
}
