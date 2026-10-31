// Start an autonomous tuning run and print each round as it lands.
// Usage: node scripts/tune.mjs [recipe] [rounds]      (needs the running local services)
// Or:    node scripts/tune.mjs --watch <tuningId>     (reattach after a restart)
import { api } from "./api-client.mjs";
const args = process.argv.slice(2);
let id;
if (args[0] === "--watch") id = args[1];
else {
  const started = await api("tuning", { recipe: args[0] ?? "candy-vision", rounds: Number(args[1] ?? 5) });
  id = started.id;
  console.log(`tuning ${id}  recipe=${started.recipe}  rounds=${started.maxRounds}`);
}
const pct = (v) => (v == null ? "   -  " : (v * 100).toFixed(1).padStart(5) + "%");
let shown = 0, lastStage = "";
for (;;) {
  const t = await api("tuning/" + id);
  for (const r of t.rounds.slice(shown)) {
    console.log(
      `round ${String(r.round).padStart(2)}  dev ${pct(r.development_accuracy)}  held-out ${pct(r.heldout_accuracy)}  ${r.promoted ? "PROMOTED" : "kept best"}  ${(r.elapsedMs / 1000).toFixed(1)}s  ${r.change}`,
    );
    if (r.rationale && r.round > 0) console.log(`          proposer: ${r.rationale}`);
    const top = r.development_confusions?.[0];
    if (top) console.log(`          judge: most confused ${top.true} → ${top.predicted} (${top.count})`);
    shown++;
  }
  if (t.stage !== lastStage) {
    console.log(`  … ${t.stage}`);
    lastStage = t.stage;
  }
  if (t.status !== "running") {
    console.log(`\n${t.status}: best round ${t.best?.round} held-out ${pct(t.best?.heldout_accuracy)}  ${t.error ?? ""}`);
    console.log(`checkpoint ${t.best?.checkpoint}`);
    process.exit(t.status === "complete" ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
