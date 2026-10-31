"""Candy-vision recipe: fine-tune a classifier head on labelled candy-bar crops.

Contract (the only thing the tuner loop knows about a recipe):
  python3 -I train.py --data <dir> --config <json> --out <dir>
  stdin:  nothing          stdout: one JSON object (metrics)          exit 0 on success

<dir> holds images/*.jpg and annotations.csv (image,label,x,y,w,h,img_w,img_h).
Photos are split by file name with a fixed seed into train / development / held-out.
The held-out split is never shown to the proposer; the loop only uses it to decide
whether a round is promoted. Nothing here reads model-written code.
"""
import argparse, csv, hashlib, json, os, sys, time

import torch, torch.nn as nn
from PIL import Image
from torchvision import models, transforms

KNOBS = {  # bounded search space; the proposer may change ONE of these per round
    "epochs": (1, 40),
    "lr": (1e-4, 2e-2),
    "weight_decay": (0.0, 1e-2),
    "hidden": (0, 512),  # 0 = linear head, >0 = one hidden layer
    "normalize_features": (False, True),
    "class_balance": (False, True),
}
DEFAULT = {
    "image_size": 96,
    "epochs": 1,
    "lr": 5e-4,
    "weight_decay": 0.0,
    "hidden": 0,
    "normalize_features": False,
    "class_balance": False,
    "seed": 7,
}


def split_of(name, seed):
    h = int(hashlib.sha256(f"{seed}:{name}".encode()).hexdigest()[:8], 16) % 100
    return "train" if h < 70 else "development" if h < 85 else "heldout"


def load_rows(data):
    with open(os.path.join(data, "annotations.csv"), newline="") as f:
        rows = [r for r in csv.DictReader(f)]
    for r in rows:
        for k in ("x", "y", "w", "h"):
            r[k] = int(float(r[k]))
    return rows


def features(data, rows, size, out, device):
    """Frozen ImageNet ResNet-18 embeddings for every crop, cached per image size."""
    cache = os.path.join(out, f"features-{size}.pt")
    if os.path.exists(cache):
        c = torch.load(cache)
        if c["n"] == len(rows):
            return c["x"]
    weights = models.ResNet18_Weights.IMAGENET1K_V1
    net = models.resnet18(weights=weights)
    net.fc = nn.Identity()
    net.eval().to(device)
    tf = transforms.Compose(
        [
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    xs, batch, opened = [], [], {}
    with torch.no_grad():
        for i, r in enumerate(rows):
            im = opened.get(r["image"])
            if im is None:
                opened = {r["image"]: Image.open(os.path.join(data, "images", r["image"])).convert("RGB")}
                im = opened[r["image"]]
            crop = im.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
            batch.append(tf(crop))
            if len(batch) == 64 or i == len(rows) - 1:
                xs.append(net(torch.stack(batch).to(device)).cpu())
                batch = []
                print(json.dumps({"progress": "extracting", "done": i + 1, "total": len(rows)}), file=sys.stderr, flush=True)
    x = torch.cat(xs)
    torch.save({"n": len(rows), "x": x}, cache)
    return x


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", required=True)
    p.add_argument("--config", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--cache", default=None, help="shared dir for frozen-backbone features (defaults to --out)")
    a = p.parse_args()
    cache_dir = a.cache or a.out
    os.makedirs(cache_dir, exist_ok=True)
    start = time.time()
    cfg = {**DEFAULT, **json.loads(a.config)}
    for k, (lo, hi) in KNOBS.items():  # refuse out-of-range values from the proposer
        v = cfg[k]
        if isinstance(lo, bool):
            cfg[k] = bool(v)
        elif not (lo <= float(v) <= hi):
            raise SystemExit(f"config {k}={v} outside bounds {lo}..{hi}")
    torch.manual_seed(cfg["seed"])
    os.makedirs(a.out, exist_ok=True)
    device = "mps" if torch.backends.mps.is_available() else "cpu"

    rows = load_rows(a.data)
    labels = sorted({r["label"] for r in rows})
    y = torch.tensor([labels.index(r["label"]) for r in rows])
    split = [split_of(r["image"], cfg["seed"]) for r in rows]
    idx = {s: torch.tensor([i for i, v in enumerate(split) if v == s]) for s in ("train", "development", "heldout")}
    x = features(a.data, rows, cfg["image_size"], cache_dir, device)
    mu = sd = None
    if cfg["normalize_features"]:
        mu, sd = x[idx["train"]].mean(0), x[idx["train"]].std(0) + 1e-6
        x = (x - mu) / sd

    d = x.shape[1]
    head = nn.Linear(d, len(labels)) if not cfg["hidden"] else nn.Sequential(
        nn.Linear(d, int(cfg["hidden"])), nn.ReLU(), nn.Linear(int(cfg["hidden"]), len(labels))
    )
    weight = None
    if cfg["class_balance"]:
        counts = torch.bincount(y[idx["train"]], minlength=len(labels)).float()
        weight = counts.sum() / (len(labels) * counts)
    loss_fn = nn.CrossEntropyLoss(weight=weight)
    opt = torch.optim.Adam(head.parameters(), lr=float(cfg["lr"]), weight_decay=float(cfg["weight_decay"]))
    xt, yt = x[idx["train"]], y[idx["train"]]
    for epoch in range(int(cfg["epochs"])):
        perm = torch.randperm(len(xt))
        for b in range(0, len(xt), 64):
            j = perm[b : b + 64]
            opt.zero_grad()
            loss_fn(head(xt[j]), yt[j]).backward()
            opt.step()

    def evaluate(s):
        with torch.no_grad():
            pred = head(x[idx[s]]).argmax(1)
        truth = y[idx[s]]
        acc = (pred == truth).float().mean().item()
        conf = {}
        for t, pr in zip(truth.tolist(), pred.tolist()):
            if t != pr:
                k = (labels[t], labels[pr])
                conf[k] = conf.get(k, 0) + 1
        top = sorted(conf.items(), key=lambda kv: -kv[1])[:5]
        per_class = {}
        for c in range(len(labels)):
            m = truth == c
            if m.any():
                per_class[labels[c]] = round((pred[m] == c).float().mean().item(), 3)
        return acc, [{"true": t, "predicted": pr, "count": n} for (t, pr), n in top], per_class

    dev_acc, dev_conf, dev_per_class = evaluate("development")
    held_acc, _, _ = evaluate("heldout")
    train_acc, _, _ = evaluate("train")
    ckpt = os.path.join(a.out, "head.pt")
    # Everything predict.py needs to reproduce a prediction: label order, config, head weights and the
    # training-split normalization statistics (None when normalization was off).
    torch.save({"labels": labels, "config": cfg, "state": head.state_dict(), "mean": mu, "std": sd,
                "backbone": "torchvision resnet18 IMAGENET1K_V1", "splits": {s: sorted({rows[i]["image"] for i in idx[s].tolist()}) for s in idx}}, ckpt)
    with open(os.path.join(a.out, "config.json"), "w") as f:
        json.dump(cfg, f, indent=1)
    print(
        json.dumps(
            {
                "recipe": "candy-vision",
                "backbone": "torchvision resnet18 IMAGENET1K_V1 (frozen)",
                "device": device,
                "classes": labels,
                "counts": {s: len(idx[s]) for s in idx},
                "config": cfg,
                "train_accuracy": round(train_acc, 4),
                "development_accuracy": round(dev_acc, 4),
                "heldout_accuracy": round(held_acc, 4),
                "development_confusions": dev_conf,
                "development_per_class": dev_per_class,
                "checkpoint": ckpt,
                "elapsed_ms": int((time.time() - start) * 1000),
            }
        )
    )


if __name__ == "__main__":
    main()
