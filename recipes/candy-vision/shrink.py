"""Resize candy photos to a fixed width and rescale their VIA bounding boxes.

Usage: python3 -I shrink.py <src_root> <out_root> [width]
Reads  <src_root>/Images/Images/*.JPG and <src_root>/Annotation CSV Files/Annotation CSV Files/*.csv
Writes <out_root>/images/*.jpg and <out_root>/annotations.csv (one row per box, scaled)
Originals are never modified.
"""
import csv, glob, json, os, sys
from PIL import Image, ImageOps

src, out = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
img_dir = os.path.join(src, "Images", "Images")
csv_dir = os.path.join(src, "Annotation CSV Files", "Annotation CSV Files")
os.makedirs(os.path.join(out, "images"), exist_ok=True)

# 1. resize every photo, remember its scale factor
scale = {}
files = sorted(glob.glob(os.path.join(img_dir, "*.JPG")))
for i, path in enumerate(files, 1):
    name = os.path.basename(path)
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)  # bake in phone rotation so boxes line up
    w, h = im.size
    s = width / w
    im = im.resize((width, round(h * s)), Image.LANCZOS)
    im.save(os.path.join(out, "images", name.replace(".JPG", ".jpg")), quality=90)
    scale[name] = (s, w, h)
    if i % 50 == 0:
        print(f"{i}/{len(files)}", flush=True)

# 2. merge all annotation csvs, scale boxes
rows_out, missing = [], set()
for f in sorted(glob.glob(os.path.join(csv_dir, "*.csv"))):
    for r in csv.DictReader(open(f)):
        name = r["filename"]
        if name not in scale:
            missing.add(name); continue
        s, w, h = scale[name]
        b = json.loads(r["region_shape_attributes"])
        label = json.loads(r["region_attributes"])["candy_type"]
        rows_out.append({
            "image": name.replace(".JPG", ".jpg"),
            "label": label,
            "x": round(b["x"] * s), "y": round(b["y"] * s),
            "w": round(b["width"] * s), "h": round(b["height"] * s),
            "img_w": width, "img_h": round(h * s),
        })

with open(os.path.join(out, "annotations.csv"), "w", newline="") as fh:
    wr = csv.DictWriter(fh, fieldnames=list(rows_out[0].keys()))
    wr.writeheader(); wr.writerows(rows_out)

print(f"images: {len(files)}  boxes: {len(rows_out)}  unmatched csv rows: {len(missing)}")
