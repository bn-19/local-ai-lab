"""Score the same held-out candy crops with the tuned local head and with a GPT vision model.

Usage: python3 -I scripts/compare-gpt.py --data DIR --head head.pt --cache DIR [--model gpt-5.4-mini] [--limit N]
Reads the key from .local-lab/openai-key (ignored). Sends crops to OpenAI only for this explicit run.
Writes .local-lab/tuning/gpt-comparison-<model>.json and prints a side-by-side table.
"""
import argparse, base64, io, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from urllib import request, error

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "recipes", "candy-vision"))
import torch, torch.nn as nn
from PIL import Image
from train import load_rows, split_of

p = argparse.ArgumentParser()
p.add_argument("--data", required=True)
p.add_argument("--head", required=True)
p.add_argument("--cache", required=True)
p.add_argument("--model", default="gpt-5.4-mini")
p.add_argument("--limit", type=int, default=0)
p.add_argument("--workers", type=int, default=8)
a = p.parse_args()

rows = load_rows(a.data)
ck = torch.load(a.head)
labels, cfg = ck["labels"], ck["config"]
held = [i for i, r in enumerate(rows) if split_of(r["image"], cfg["seed"]) == "heldout"]
if a.limit:
    held = held[: a.limit]

# --- local side: same head, same crops ---
x = torch.load(os.path.join(a.cache, f"features-{cfg['image_size']}.pt"))["x"]
if cfg["normalize_features"]:
    train_idx = [i for i, r in enumerate(rows) if split_of(r["image"], cfg["seed"]) == "train"]
    mu, sd = x[train_idx].mean(0), x[train_idx].std(0) + 1e-6
    x = (x - mu) / sd
d = x.shape[1]
head = nn.Linear(d, len(labels)) if not cfg["hidden"] else nn.Sequential(
    nn.Linear(d, int(cfg["hidden"])), nn.ReLU(), nn.Linear(int(cfg["hidden"]), len(labels)))
head.load_state_dict(ck["state"])
t0 = time.time()
with torch.no_grad():
    local_pred = [labels[j] for j in head(x[held]).argmax(1).tolist()]
local_ms = (time.time() - t0) * 1000

# --- GPT side ---
key = open(".local-lab/openai-key").read().strip()
names = {l: l.replace("_", " ") for l in labels}
pretty_to_label = {v.lower(): k for k, v in names.items()}
prompt = ("This is a photo of one fun-size candy bar. Which of these is it? "
          + ", ".join(names.values()) + ". Reply with exactly one name from the list and nothing else.")
opened = {}


def crop_b64(r):
    im = opened.get(r["image"])
    if im is None:
        opened.clear()
        im = opened[r["image"]] = Image.open(os.path.join(a.data, "images", r["image"])).convert("RGB")
    c = im.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
    buf = io.BytesIO()
    c.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def ask(i):
    r = rows[i]
    body = {
        "model": a.model,
        "max_completion_tokens": 20,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + crop_b64(r), "detail": "low"}},
        ]}],
    }
    for attempt in range(4):
        try:
            req = request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                  headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
            t = time.time()
            with request.urlopen(req, timeout=60) as resp:
                out = json.load(resp)
            text = out["choices"][0]["message"]["content"].strip().lower().rstrip(".")
            pred = pretty_to_label.get(text)
            if pred is None:  # tolerate "it's a Twix" and singular/plural ("Butterfinger") answers
                for k, v in names.items():
                    stem = v.lower().rstrip("s")
                    if stem in text or text.rstrip("s") in v.lower():
                        pred = k
                        break
            u = out.get("usage", {})
            return {"i": i, "true": r["label"], "pred": pred or "UNPARSED:" + text, "ms": int((time.time() - t) * 1000),
                    "in": u.get("prompt_tokens", 0), "out": u.get("completion_tokens", 0)}
        except error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            return {"i": i, "true": r["label"], "pred": "ERROR", "error": f"{e.code} {msg}", "ms": 0, "in": 0, "out": 0}
        except Exception as e:  # network
            if attempt < 3:
                time.sleep(2 ** attempt)
                continue
            return {"i": i, "true": r["label"], "pred": "ERROR", "error": str(e), "ms": 0, "in": 0, "out": 0}


t0 = time.time()
with ThreadPoolExecutor(a.workers) as ex:
    gpt = list(ex.map(ask, held))
gpt_wall = time.time() - t0


def summarize(preds, truths):
    acc = sum(p == t for p, t in zip(preds, truths)) / len(truths)
    conf = {}
    for p, t in zip(preds, truths):
        if p != t:
            conf[(t, p)] = conf.get((t, p), 0) + 1
    top = sorted(conf.items(), key=lambda kv: -kv[1])[:5]
    return acc, [{"true": t, "predicted": p, "count": n} for (t, p), n in top]


truths = [rows[i]["label"] for i in held]
l_acc, l_conf = summarize(local_pred, truths)
g_acc, g_conf = summarize([g["pred"] for g in gpt], truths)
errors = [g for g in gpt if g["pred"] == "ERROR"]
tok_in, tok_out = sum(g["in"] for g in gpt), sum(g["out"] for g in gpt)
result = {
    "model": a.model, "n": len(held), "local": {"accuracy": l_acc, "config": cfg, "total_ms": local_ms, "confusions": l_conf},
    "gpt": {"accuracy": g_acc, "errors": len(errors), "first_error": errors[0].get("error") if errors else None,
            "wall_s": gpt_wall, "mean_ms": sum(g["ms"] for g in gpt) / max(1, len(gpt)),
            "prompt_tokens": tok_in, "completion_tokens": tok_out, "confusions": g_conf},
    "samples": gpt,
}
os.makedirs(".local-lab/tuning", exist_ok=True)
with open(f".local-lab/tuning/gpt-comparison-{a.model}.json", "w") as f:
    json.dump(result, f, indent=1)
print(f"\nheld-out crops: {len(held)}")
print(f"{'':22}{'local (tuned head)':>22}{a.model:>22}")
print(f"{'accuracy':22}{l_acc*100:>21.1f}%{g_acc*100:>21.1f}%")
print(f"{'time for all crops':22}{local_ms/1000:>20.2f}s{gpt_wall:>21.1f}s")
print(f"{'per-crop latency':22}{local_ms/len(held):>20.2f}ms{result['gpt']['mean_ms']:>20.0f}ms")
print(f"{'tokens billed':22}{'0':>22}{str(tok_in)+' in / '+str(tok_out)+' out':>22}")
print(f"{'photo leaves laptop':22}{'no':>22}{'yes':>22}")
if errors:
    print(f"GPT errors: {len(errors)}  first: {errors[0].get('error')}")
print("local top confusions:", l_conf[:3])
print("gpt   top confusions:", g_conf[:3])
