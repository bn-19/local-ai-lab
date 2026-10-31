// Seed the Project actor with a clearly labelled sample tuning run so every panel has content to
// look at on a machine without Relay or Ollama. Nothing here is presented as live: the tuning
// request, the saved model name and a `seeded` flag all say so, and the Device actor is untouched.
// Usage: node scripts/seed-demo.mjs          (needs runtime:actors running)
//        node scripts/seed-demo.mjs --clear  (removes exactly what it wrote)
import { randomUUID } from "node:crypto";
import { state, save } from "../lib/actors.mjs";

const MANIFEST = "seed:demo";
const classes = ["100_Grand", "3_Musketeers", "Baby_Ruth", "Butterfingers", "Crunch", "Midnight_Milky_Way", "Milky_Way", "Snickers", "Twix"];
const counts = { train: 1468, development: 353, heldout: 292 };
const backbone = "torchvision resnet18 IMAGENET1K_V1 (frozen)";

if (process.argv.includes("--clear")) {
  const manifest = (await state())[MANIFEST];
  if (!manifest) { console.log("Nothing seeded."); process.exit(0); }
  for (const key of manifest.keys) await save(key, null);
  await save(MANIFEST, null);
  console.log(`Removed ${manifest.keys.length} seeded records.`);
  process.exit(0);
}
if ((await state())[MANIFEST]) { console.log("Already seeded. Run with --clear first."); process.exit(1); }

const keys = [];
const put = async (key, value) => { keys.push(key); await save(key, value); };
let clock = Date.now() - 6 * 60 * 1000; // the run "happened" over the last six minutes
const tick = (ms) => (clock += ms);

// Round results taken from real candy-vision runs on 2026-10-31; the sequence is arranged as a demo.
const plan = [
  { change: "baseline", rationale: "Deliberately weak starting configuration so improvement is measurable.", config: { epochs: 1, lr: 0.0005, weight_decay: 0, hidden: 0, normalize_features: false, class_balance: false }, dev: 0.745, held: 0.709, train: 0.781, ms: 37210, conf: [["Twix", "Milky_Way", 10], ["Midnight_Milky_Way", "Milky_Way", 8], ["Baby_Ruth", "Butterfingers", 6]] },
  { knob: "epochs", from: 1, to: 10, rationale: "One epoch underfits every class and the confusions are spread across all nine labels, which points at training length rather than any single knob. Ten epochs is the largest expected gain before touching the learning rate.", dev: 0.962, held: 0.958, train: 0.994, ms: 912, conf: [["Midnight_Milky_Way", "Milky_Way", 5], ["Twix", "Milky_Way", 3]] },
  { knob: "normalize_features", from: false, to: true, rationale: "The remaining confusions are between dark wrappers of similar shape. Normalising the frozen features puts every dimension on the same scale so the head is not dominated by a few large activations.", dev: 0.975, held: 0.983, train: 0.998, ms: 1104, conf: [["Midnight_Milky_Way", "Milky_Way", 4], ["Snickers", "Baby_Ruth", 2]] },
  { knob: "hidden", from: 0, to: 256, rationale: "Milky Way and Midnight Milky Way keep crossing. A linear head cannot separate them on these features; one hidden layer of 256 units adds the capacity without a new backbone.", dev: 0.986, held: 0.99, train: 1, ms: 1620, conf: [["Midnight_Milky_Way", "Milky_Way", 2], ["Milky_Way", "Twix", 1]] },
  { knob: "lr", from: 0.0005, to: 0.002, rationale: "Training accuracy is already at 100% while development lags, so the head converges slowly rather than overfitting. A higher learning rate reaches the same optimum inside ten epochs.", dev: 0.992, held: 0.997, train: 1, ms: 1488, conf: [["Milky_Way", "Twix", 1]] },
  { knob: "epochs", from: 10, to: 30, rationale: "One development miss remains. More epochs is the last untried lever that does not add capacity; if it does not move held-out, the judge keeps round 4.", dev: 0.992, held: 0.997, train: 1, ms: 1733, conf: [["Milky_Way", "Twix", 1]] },
];

const tuningId = randomUUID();
const rounds = [];
let best = null;
let config = { ...plan[0].config };
const jobEvents = (kind, stage, start, end, status = "ready") => [
  { at: start, actor: "System", phase: kind, status: "queued", summary: "Queued" },
  { at: start + 200, actor: "System", phase: kind, status: "running", summary: stage },
  { at: end, actor: "System", phase: kind, status, summary: status === "ready" ? "Complete" : status },
];
for (let i = 0; i < plan.length; i++) {
  const p = plan[i];
  if (i > 0) {
    // Proposer step: a Relay job from Planner to Evaluator carrying only ids and aggregate scores.
    const proposeId = randomUUID();
    const start = tick(800), end = tick(9000 + i * 1300);
    config = { ...config, [p.knob]: p.to };
    await put("job:" + proposeId, {
      id: proposeId, kind: "tune-propose", taskId: tuningId, seeded: true,
      payload: { tuningId, scores: rounds.map((r) => ({ round: r.round, development_accuracy: r.development_accuracy })) },
      status: "ready", stage: "Complete", createdAt: start, notBefore: start, viaRelay: true,
      requestMessageId: `seed-req-${i}`, receivedMessageId: `seed-rcv-${i}`, completionMessageId: `seed-done-${i}`, completionReceivedId: `seed-ack-${i}`,
      startedAt: start + 1900, finishedAt: end, executor: "seed-executor", attempt: `seed-attempt-p${i}`,
      usage: { inputTokens: 860 + i * 140, outputTokens: 96 + i * 11, calls: 1 },
      result: { knob: p.knob, value: p.to, rationale: p.rationale, elapsedMs: end - start - 1900 },
      events: jobEvents("tune-propose", "Proposer · choosing next change", start, end),
    });
  }
  const roundId = randomUUID();
  const start = tick(500), end = tick(p.ms + 400);
  const promoted = !best || p.held > best.heldout_accuracy;
  const checkpoint = `.local-lab/tuning/${tuningId}/round-${i}/head.pt`;
  const round = {
    round: i, jobId: roundId, change: i === 0 ? p.change : `${p.knob}: ${JSON.stringify(p.from)} → ${JSON.stringify(p.to)}`, rationale: p.rationale,
    config: { image_size: 96, ...config, seed: 7 }, development_accuracy: p.dev, heldout_accuracy: p.held, train_accuracy: p.train,
    development_confusions: p.conf.map(([t, pr, n]) => ({ true: t, predicted: pr, count: n })),
    development_per_class: Object.fromEntries(classes.map((c) => [c, Math.min(1, Math.round((p.dev + (c === "Milky_Way" ? -0.06 : c === "Midnight_Milky_Way" ? -0.04 : 0.01)) * 1000) / 1000)])),
    elapsedMs: p.ms, checkpoint, promoted, finishedAt: end,
  };
  if (promoted) best = { round: i, config: round.config, heldout_accuracy: p.held, checkpoint };
  rounds.push(round);
  await put("job:" + roundId, {
    id: roundId, kind: "tune-round", taskId: tuningId, seeded: true,
    payload: { tuningId, round: i, config: i === 0 ? {} : config, change: round.change, rationale: p.rationale },
    status: "ready", stage: "Complete", createdAt: start, notBefore: start, viaRelay: false,
    startedAt: start + 300, finishedAt: end, executor: "seed-executor", attempt: `seed-attempt-r${i}`,
    result: { recipe: "candy-vision", backbone, development_accuracy: p.dev, heldout_accuracy: p.held, elapsed_ms: p.ms },
    events: jobEvents("tune-round", `Executor · training round ${i}`, start, end),
  });
}
const completedAt = tick(300);
await put("tuning:" + tuningId, {
  id: tuningId, kind: "tuning", seeded: true, recipe: "candy-vision",
  request: "Seeded demo, not a live run: teach a vision model to recognize candy bars in photos",
  backbone, maxRounds: plan.length, status: "complete", stage: "Complete", rounds, best, classes, counts,
  lastProposal: { knob: "epochs", value: 30, rationale: plan[5].rationale, elapsedMs: 11400 },
  createdAt: rounds[0].finishedAt - plan[0].ms - 1000, completedAt,
});
const savedId = randomUUID();
await put("saved:" + savedId, {
  id: savedId, name: "Seeded demo: candy vision head", kind: "tuning", refId: tuningId, seeded: true,
  summary: { recipe: "candy-vision", status: "complete", heldout_accuracy: best.heldout_accuracy, rounds: rounds.length, request: "Seeded demo, not a live run" },
  savedAt: tick(20000),
});
await save(MANIFEST, { keys, seededAt: Date.now(), note: "Sample records written by scripts/seed-demo.mjs; remove with --clear" });
console.log(`Seeded tuning ${tuningId} (${rounds.length} rounds, best held-out ${(best.heldout_accuracy * 100).toFixed(1)}%), ${keys.length} records. Remove with: node scripts/seed-demo.mjs --clear`);
