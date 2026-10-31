"""Reviewed detector + crop-classifier baseline; no input annotations enter inference."""
import sys,os,json,hashlib,time
from pathlib import Path
ROOT=Path(sys.argv[2]);MODEL='IDEA-Research/grounding-dino-tiny';REV='a2bb814dd30d776dcf7e30523b00659f4f141c71';SHA='1a2412ef99bd74bcd3c2a246fa1e48581f8889a1300c9051974741314fc042f3'
def digest(p):
 h=hashlib.sha256()
 with open(p,'rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def write(p,v):
 q=Path(str(p)+'.part');q.write_text(json.dumps(v,indent=2));os.chmod(q,0o600);q.replace(p)
if sys.argv[1]=='install':
 from huggingface_hub import snapshot_download
 p=Path(snapshot_download(MODEL,revision=REV,local_dir=ROOT/'detector',allow_patterns=['model.safetensors','config.json','preprocessor_config.json','processor_config.json','tokenizer_config.json','tokenizer.json','vocab.txt','special_tokens_map.json']))
 if digest(p/'model.safetensors')!=SHA:raise ValueError('Detector checksum mismatch')
 write(ROOT/'detector-installed.json',{'model':MODEL,'revision':REV,'sha256':SHA,'bytes':sum(x.stat().st_size for x in p.rglob('*')if x.is_file()),'license':'Apache-2.0'})
 sys.exit(0)
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
import warnings
import numpy as np
import torch
from PIL import Image,ImageOps
from transformers import AutoProcessor,AutoModelForZeroShotObjectDetection,CLIPModel,CLIPProcessor
Image.MAX_IMAGE_PIXELS=20_000_000;warnings.simplefilter('error',Image.DecompressionBombWarning)
torch.set_num_threads(4);started=time.time()
with Image.open(sys.argv[4]) as image:
 if image.format not in ('JPEG','PNG')or getattr(image,'n_frames',1)!=1 or image.width*image.height>20_000_000:raise ValueError('Use a single JPEG/PNG up to20MP')
 image.load();image=ImageOps.exif_transpose(image).convert('RGB')
if digest(ROOT/'detector/model.safetensors')!=SHA:raise ValueError('Detector artifact changed')
processor=AutoProcessor.from_pretrained(ROOT/'detector',local_files_only=True)
model=AutoModelForZeroShotObjectDetection.from_pretrained(ROOT/'detector',local_files_only=True).eval()
# CPU baseline avoids unsupported custom MPS operations. No custom/remote code.
model.config.disable_custom_kernels=True
prompt='a wrapped candy . a candy bar . a sweet in a wrapper .'
# Fixed full-frame plus overlapping 2x2 tiles preserves small-wrapper detail.
# This is a reviewed inference policy, not learned weights or annotation-fed proposals.
w,h=image.size;tw,th=round(w*.6),round(h*.6)
windows=[(0,0,w,h),(0,0,tw,th),(w-tw,0,w,th),(0,h-th,tw,h),(w-tw,h-th,w,h)]
all_boxes=[];all_scores=[]
for tile_index,(x0,y0,x1,y1) in enumerate(windows):
 tile=image.crop((x0,y0,x1,y1));inputs=processor(images=tile,text=prompt,return_tensors='pt')
 with torch.no_grad():outputs=model(**inputs)
 r=processor.post_process_grounded_object_detection(outputs,inputs.input_ids,threshold=.25,text_threshold=.25,target_sizes=[(tile.height,tile.width)])[0]
 for box,score in zip(r['boxes'].cpu().numpy(),r['scores'].cpu().numpy()):
  box[[0,2]]=np.clip(box[[0,2]],0,tile.width);box[[1,3]]=np.clip(box[[1,3]],0,tile.height)
  # Reject aggregate pile/bowl regions, and internally clipped tile fragments.
  if (box[2]-box[0])*(box[3]-box[1])>tile.width*tile.height*.30:continue
  if tile_index and ((x0>0 and box[0]<2)or(y0>0 and box[1]<2)or(x1<w and box[2]>tile.width-2)or(y1<h and box[3]>tile.height-2)):continue
  box+=np.array([x0,y0,x0,y0]);all_boxes.append(box);all_scores.append(score)
boxes=np.array(all_boxes);scores=np.array(all_scores)
def iou(a,b):
 x=max(0,min(a[2],b[2])-max(a[0],b[0]));y=max(0,min(a[3],b[3])-max(a[1],b[1]));inter=x*y;return inter/max(1,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-inter)
kept=[]
for idx in np.argsort(scores)[::-1]:
 box=boxes[idx].copy();box[[0,2]]=np.clip(box[[0,2]],0,image.width);box[[1,3]]=np.clip(box[[1,3]],0,image.height)
 if not np.isfinite(box).all()or min(box[2]-box[0],box[3]-box[1])<8:continue
 if any(iou(box,b)>0.5 for _,b in kept):continue
 kept.append((int(idx),box))
 if len(kept)>=60:break
# A proposal enclosing multiple disjoint smaller proposals is a likely group.
filtered=[]
for idx,box in kept:
 area=(box[2]-box[0])*(box[3]-box[1]);children=[]
 for other_idx,b in kept:
  if other_idx==idx:continue
  child_area=(b[2]-b[0])*(b[3]-b[1])
  inter=max(0,min(box[2],b[2])-max(box[0],b[0]))*max(0,min(box[3],b[3])-max(box[1],b[1]))
  if child_area<area*.5 and inter/max(1,child_area)>.9:children.append(b)
 if any(iou(a,b)<.2 for n,a in enumerate(children)for b in children[n+1:]):continue
 filtered.append((idx,box))
kept=filtered
del model,outputs,inputs
labels=['Snickers','Twix','Kit Kat','Milky Way','Midnight Milky Way','3 Musketeers','Baby Ruth','Butterfinger','Crunch','100 Grand','Reeses Peanut Butter Cups']
negative=['an unknown candy in a wrapper','a fruit flavored wrapped candy','a mint candy','a lollipop','a packet of chips','a background object']
clip_sha='a63082132ba4f97a80bea76823f544493bffa8082296d62d71581a4feff1576f'
if digest(ROOT/'model/pytorch_model.bin')!=clip_sha:raise ValueError('CLIP artifact changed')
clip=CLIPModel.from_pretrained(ROOT/'model',local_files_only=True).eval();cp=CLIPProcessor.from_pretrained(ROOT/'model',local_files_only=True)
instances=[]
friend_binding=None
if kept:
 crops=[image.crop(tuple(int(v)for v in box))for _,box in kept]
 with torch.no_grad():
  text=clip.get_text_features(**cp(text=['a photo of a '+x+' candy wrapper' for x in labels]+negative,return_tensors='pt',padding=True));text=text/text.norm(dim=-1,keepdim=True)
  feats=clip.get_image_features(**cp(images=crops,return_tensors='pt'));feats=feats/feats.norm(dim=-1,keepdim=True);similarity=(feats@text.T).numpy()
 friend_probs=None
 if len(sys.argv)>5:
  import re
  from torchvision import models,transforms
  friend_binding=json.loads(Path(sys.argv[5]).read_text());head_path=friend_binding.get('headFile','')
  if not re.fullmatch(r'friend-friend-result-[a-f0-9-]{36}/model/head\.pt',head_path):raise ValueError('Invalid head binding')
  if digest(ROOT/head_path)!=friend_binding['headSha256']:raise ValueError('Head checksum changed')
  backbone=ROOT/'torch/hub/checkpoints/resnet18-f37072fd.pth'
  if digest(backbone)!=friend_binding['backboneSha256']:raise ValueError('Backbone checksum changed')
  ck=torch.load(ROOT/head_path,map_location='cpu',weights_only=True)
  expected=['100_Grand','3_Musketeers','Baby_Ruth','Butterfingers','Crunch','Midnight_Milky_Way','Milky_Way','Snickers','Twix']
  if ck['labels']!=expected or ck['config']['hidden']!=256 or ck['config']['image_size']!=96:raise ValueError('Unexpected reviewed head configuration')
  net=models.resnet18(weights=None);net.load_state_dict(torch.load(backbone,map_location='cpu',weights_only=True));net.fc=torch.nn.Identity();net.eval()
  head=torch.nn.Sequential(torch.nn.Linear(512,256),torch.nn.ReLU(),torch.nn.Linear(256,9));head.load_state_dict(ck['state']);head.eval()
  tf=transforms.Compose([transforms.Resize((96,96)),transforms.ToTensor(),transforms.Normalize([.485,.456,.406],[.229,.224,.225])])
  with torch.no_grad():friend_probs=head((net(torch.stack([tf(c)for c in crops]))-ck['mean'])/ck['std']).softmax(1).numpy()
  friend_labels=[x.replace('_',' ').replace('Butterfingers','Butterfinger')for x in expected]
 for n,((idx,box),sim)in enumerate(zip(kept,similarity)):
  order=np.argsort(sim[:len(labels)])[::-1];best=int(order[0]);margin=float(sim[best]-sim[order[1]]);accepted=float(sim[best])>=.30 and margin>=.03 and sim[best]-sim[len(labels):].max()>=.02
  detail={}
  if friend_probs is not None:
   fp=friend_probs[n];rank=np.argsort(fp)[::-1];chosen=int(rank[0]);head_margin=float(fp[chosen]-fp[rank[1]])
   detail={'zeroShotCandidate':labels[best],'headCandidate':friend_labels[chosen],'headScore':round(float(fp[chosen]),4),'headMargin':round(head_margin,4)}
   best=labels.index(friend_labels[chosen]);margin=float(sim[best]-max(np.delete(sim[:len(labels)],best)))
   accepted=bool(fp[chosen]>=.9 and head_margin>=.5 and sim[best]>=.25 and sim[best]>=sim[:len(labels)].max()-.01 and sim[best]-sim[len(labels):].max()>=.02)
  instances.append({**detail,'id':n+1,'box':[round(float(x),1)for x in box],'detectorScore':round(float(scores[idx]),4),'label':labels[best]if accepted else'Unknown / uncertain','candidate':labels[best],'similarity':round(float(sim[best]),4),'margin':round(margin,4),'status':'accepted'if accepted else'uncertain','occlusion':'not inferred; hidden instances cannot be counted','truncated':bool(box[0]<=1 or box[1]<=1 or box[2]>=image.width-1 or box[3]>=image.height-1)})
from pile_geometry import suppress_same_brand_duplicates
instances,suppressed=suppress_same_brand_duplicates(instances)
counts={}
for instance in instances:
 if instance['status']=='accepted':counts[instance['label']]=counts.get(instance['label'],0)+1
write(Path(sys.argv[3]),{'kind':'pile','width':image.width,'height':image.height,'instances':instances,'suppressedInstances':suppressed,'counts':counts,'uncertainCount':sum(x['status']!='accepted'for x in instances),'model':{'detector':MODEL,'revision':REV,'sha256':SHA,'classifier':'openai/clip-vit-base-patch32','classifierRevision':'3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268','classifierSHA256':clip_sha,'trainedHeadUsed':friend_binding is not None,'friendHead':({'sha256':friend_binding['headSha256'],'backboneSHA256':friend_binding['backboneSha256'],'sourceRevision':friend_binding['sourceRevision'],'candidateOnly':True}if friend_binding else None)},'policy':{'detectorThreshold':.25,'nmsIoU':.5,'classificationCosineThreshold':.30,'classificationMargin':.03,'negativeMargin':.02,'maxInstances':60,'prompt':prompt,'version':'tiled-v3-deduplicated','friendAcceptance':({'headScore':.9,'headMargin':.5,'clipCosine':.25,'clipBestTolerance':.01,'negativeMargin':.02}if friend_binding else None),'windows':windows,'maxRegionFraction':.30},'elapsedMs':round((time.time()-started)*1000),'device':'cpu','scope':'Experimental detector baseline. Counts derive only from accepted visible detections; unknown, occluded and missed candies can make totals incomplete. Scores are not calibrated probabilities.'})
