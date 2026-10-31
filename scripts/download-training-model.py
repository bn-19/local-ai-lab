"""Download the pinned, reviewed model; does not execute repository code."""
import os, pathlib, json
root=pathlib.Path(__file__).resolve().parent.parent
os.environ['HF_HOME']=str(root/'.local-lab/huggingface')
from huggingface_hub import snapshot_download
repo='mlx-community/Qwen3-4B-4bit'
revision='4dcb3d101c2a062e5c1d4bb173588c54ea6c4d25'
dest=root/'.local-lab/models/qwen3-4b-mlx'
snapshot_download(repo,revision=revision,local_dir=str(dest),allow_patterns=['*.json','*.safetensors','*.jinja','*.txt','*.model','README.md'])
manifest=root/'.local-lab/finetune/model.json'
manifest.parent.mkdir(parents=True,exist_ok=True)
manifest.write_text(json.dumps({'repository':repo,'revision':revision,'path':str(dest.relative_to(root))}))
print('MLX training model ready')
