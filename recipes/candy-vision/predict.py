"""Classify candy-bar crops with a trained candy-vision head.

Usage:
  python3 -I predict.py --head DIR/head.pt --image photo.jpg [--box x,y,w,h ...]
  python3 -I predict.py --head DIR/head.pt --data DIR --split heldout [--limit N]

Preprocessing is identical to train.py: crop the box, resize to image_size x image_size (default 96),
ImageNet mean/std normalisation, frozen torchvision ResNet-18 (IMAGENET1K_V1) 512-d embedding,
then the training-split feature mean/std from the checkpoint if normalize_features was on,
then the head. Prints one JSON line per crop with the label, probability and class order.
"""
import argparse, json, os, sys

import torch, torch.nn as nn
from PIL import Image
from torchvision import models, transforms

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import load_rows, split_of  # noqa: E402


def build_head(ck):
    labels, cfg = ck["labels"], ck["config"]
    d = 512
    head = nn.Linear(d, len(labels)) if not cfg["hidden"] else nn.Sequential(
        nn.Linear(d, int(cfg["hidden"])), nn.ReLU(), nn.Linear(int(cfg["hidden"]), len(labels)))
    head.load_state_dict(ck["state"])
    head.eval()
    return head


def embedder(image_size):
    net = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
    net.fc = nn.Identity()
    net.eval()
    tf = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    return net, tf


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--head", required=True)
    p.add_argument("--image")
    p.add_argument("--box", action="append", default=[], help="x,y,w,h in pixels of --image; repeatable. Omit to use the whole image")
    p.add_argument("--data", help="recipe data dir with images/ and annotations.csv")
    p.add_argument("--split", default="heldout", choices=["train", "development", "heldout"])
    p.add_argument("--limit", type=int, default=5)
    a = p.parse_args()

    ck = torch.load(a.head, map_location="cpu")
    labels, cfg = ck["labels"], ck["config"]
    head = build_head(ck)
    net, tf = embedder(int(cfg["image_size"]))
    mu, sd = ck.get("mean"), ck.get("std")
    if cfg["normalize_features"] and mu is None:
        raise SystemExit("Checkpoint predates mean/std saving; retrain with the current train.py or pass the cached features to reconstruct them")

    crops = []
    if a.image:
        im = Image.open(a.image).convert("RGB")
        boxes = [tuple(int(float(v)) for v in b.split(",")) for b in a.box] or [(0, 0, im.width, im.height)]
        for (x, y, w, h) in boxes:
            crops.append({"image": os.path.basename(a.image), "box": [x, y, w, h], "crop": im.crop((x, y, x + w, y + h)), "expected": None})
    elif a.data:
        rows = [r for r in load_rows(a.data) if split_of(r["image"], cfg["seed"]) == a.split][: a.limit]
        for r in rows:
            im = Image.open(os.path.join(a.data, "images", r["image"])).convert("RGB")
            crops.append({"image": r["image"], "box": [r["x"], r["y"], r["w"], r["h"]], "crop": im.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])), "expected": r["label"]})
    else:
        raise SystemExit("Pass --image or --data")

    with torch.no_grad():
        feats = net(torch.stack([tf(c["crop"]) for c in crops]))
        if mu is not None:
            feats = (feats - mu) / sd
        probs = head(feats).softmax(1)
    for c, pr in zip(crops, probs):
        k = int(pr.argmax())
        print(json.dumps({"image": c["image"], "box": c["box"], "label": labels[k], "probability": round(float(pr[k]), 4),
                          "expected": c["expected"], "match": None if c["expected"] is None else c["expected"] == labels[k], "classes": labels}))


if __name__ == "__main__":
    main()
