"""Fixed local vision operations. No model-generated code or remote inference."""
import sys, os, json, hashlib, time, warnings
from pathlib import Path
ROOT=Path(sys.argv[2]); MODEL='openai/clip-vit-base-patch32'; REV='3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268'; SHA='a63082132ba4f97a80bea76823f544493bffa8082296d62d71581a4feff1576f'
LABELS=['Ferrero Rocher chocolate','Milka chocolate','Kinder chocolate','Toblerone white chocolate','Toblerone dark chocolate']
NEGATIVE=['a packet of potato chips','a bottle of water','a bottle of ketchup','a bottle of shampoo','a deodorant spray','an empty room','a person','a pile of mixed candy packages']
def digest(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def write(p,v):
 q=Path(str(p)+'.part');q.write_text(json.dumps(v,indent=2));os.chmod(q,0o600);q.replace(p)
if sys.argv[1]=='install':
 from huggingface_hub import snapshot_download
 p=Path(snapshot_download(MODEL,revision=REV,local_dir=ROOT/'model',allow_patterns=['pytorch_model.bin','config.json','preprocessor_config.json','tokenizer_config.json','tokenizer.json','vocab.json','merges.txt','special_tokens_map.json']))
 if digest(p/'pytorch_model.bin')!=SHA: raise ValueError('Model digest mismatch')
 write(ROOT/'installed.json',{'revision':REV,'sha256':SHA,'bytes':sum(x.stat().st_size for x in p.rglob('*') if x.is_file()),'installedAt':int(time.time()*1000)})
 sys.exit(0)
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
import numpy as np
import torch
from PIL import Image, ImageOps
from transformers import CLIPModel, CLIPProcessor
Image.MAX_IMAGE_PIXELS=20_000_000
warnings.simplefilter('error',Image.DecompressionBombWarning)
def photo(p):
 with Image.open(p) as im:
  if im.format not in ('JPEG','PNG') or getattr(im,'n_frames',1)!=1: raise ValueError('Use a single JPEG or PNG image')
  if im.width*im.height>20_000_000 or min(im.size)<24: raise ValueError('Photo dimensions must be at least24px and at most20MP')
  im.load(); return ImageOps.exif_transpose(im).convert('RGB')
def dhash(im):
 a=np.array(im.resize((9,8)).convert('L')); return sum(int(v)<<i for i,v in enumerate((a[:,1:]>a[:,:-1]).ravel()))
torch.manual_seed(42);torch.set_num_threads(4)
device='mps' if torch.backends.mps.is_available() else 'cpu'
# Verify local bytes on every new process. No silent fallback to another revision.
if digest(ROOT/'model/pytorch_model.bin')!=SHA: raise ValueError('Installed vision weights changed; reinstall')
model=CLIPModel.from_pretrained(ROOT/'model',local_files_only=True).eval().to(device)
processor=CLIPProcessor.from_pretrained(ROOT/'model',local_files_only=True)
with torch.no_grad():
 tokens=processor(text=['a photo of '+x for x in LABELS]+['a photo of '+x for x in NEGATIVE],return_tensors='pt',padding=True).to(device)
 texts=model.get_text_features(**tokens);texts=texts/texts.norm(dim=-1,keepdim=True)
 text_features=texts.cpu().numpy()
def encode(images):
 with torch.no_grad():
  v=model.get_image_features(**processor(images=images,return_tensors='pt').to(device));v=v/v.norm(dim=-1,keepdim=True);return v.cpu().numpy()
def classify(features,threshold=.22,margin=.01,head=None):
 sim=features@text_features.T; best=sim[:,:5].argmax(1);ordered=np.sort(sim[:,:5],axis=1);accepted=(ordered[:,-1]>=threshold)&((ordered[:,-1]-ordered[:,-2])>=margin)&(ordered[:,-1]>sim[:,5:].max(1))
 if head is not None: best=(features@head['weight'].T+head['bias']).argmax(1)
 return np.where(accepted,best,-1),sim

def metrics(features,rows,threshold,margin,head=None):
 pred,sim=classify(features,threshold,margin,head); target=np.array([r['label'] if r['label']<5 else -1 for r in rows]);known=target>=0;unknown=~known
 return {'count':len(rows),'supportedCount':int(known.sum()),'unknownCount':int(unknown.sum()),'supportedCorrect':int((pred[known]==target[known]).sum()),'supportedAccuracy':float((pred[known]==target[known]).mean()) if known.any() else None,'unknownRejected':int((pred[unknown]==-1).sum()),'unknownRejection':float((pred[unknown]==-1).mean()) if unknown.any() else None,'overallCorrect':int((pred==target).sum()),'predictions':[{'file':r['file'],'subject':r['subject'],'expected':int(t),'predicted':int(v),'similarity':float(scores[:5].max())} for r,t,v,scores in zip(rows,target,pred,sim)]}
started=time.time();out=Path(sys.argv[3]);head_file='head-'+out.stem+'.npz'
def progress(actor,summary): write(Path(str(out)+'.progress'),{'actor':actor,'summary':summary})
if sys.argv[1]=='evaluate':
 progress('Evaluator','Validating photos and removing cross-split near duplicates before local feature extraction')
 manifest=json.loads((ROOT/'dataset.json').read_text());rows=[];images=[];seen=[];excluded=0
 # Dedup before encoding; fixed policy, no performance-dependent test filtering.
 for row in manifest['rows']:
  im=photo(ROOT/'dataset'/row['file']);h=dhash(im)
  if any(split!=row['split'] and (h^other).bit_count()<=2 for split,other in seen): excluded+=1;continue
  seen.append((row['split'],h));rows.append(row);images.append(im)
 for split in ('train','development','final'):
  for label in range(5):
   if sum(r['split']==split and r['label']==label for r in rows)<5: raise ValueError('Too few independent photos after perceptual duplicate removal: '+split+' '+str(label))
 progress('Evaluator','Encoding subject-disjoint photos locally with CLIP')
 features=np.concatenate([encode(images[i:i+16]) for i in range(0,len(images),16)])
 def partition(split):
  idx=[i for i,r in enumerate(rows) if r['split']==split];return features[idx],[rows[i] for i in idx]
 train,tr=partition('train');dev,dr=partition('development');final,fr=partition('final')
 # All configuration and promotion decisions use development only.
 threshold,margin=max([(t,m) for t in [.18,.20,.22,.24,.26] for m in [0,.01,.02]],key=lambda x: metrics(dev,dr,*x)['overallCorrect'])
 baseline_dev=metrics(dev,dr,threshold,margin);head=None;candidate_dev=None;selected='baseline';decision='Baseline retained: development target met; no training needed.'
 events=[{'actor':'Planner','summary':'Five supported chocolate labels, one product per photo; unknown class rejection required.'},{'actor':'Evaluator','summary':f"Baseline development: {baseline_dev['supportedCorrect']}/{baseline_dev['supportedCount']} supported, {baseline_dev['unknownRejected']}/{baseline_dev['unknownCount']} unknown rejected."}]
 if baseline_dev['supportedAccuracy']<.9:
  progress('Trainer','Baseline missed the90%development target; learning a small classification head for120steps')
  # Real learned parameters; frozen encoder. CPU small-head training is deterministic.
  layer=torch.nn.Linear(train.shape[1],5);optimizer=torch.optim.AdamW(layer.parameters(),lr=.02,weight_decay=.01);x=torch.tensor(train);y=torch.tensor([r['label'] for r in tr]);losses=[]
  for epoch in range(120):
   optimizer.zero_grad();loss=torch.nn.functional.cross_entropy(layer(x),y);loss.backward();optimizer.step()
   if epoch in (0,119): losses.append(float(loss.detach()))
  head={'weight':layer.weight.detach().numpy(),'bias':layer.bias.detach().numpy()};np.savez(ROOT/head_file,**head)
  candidate_dev=metrics(dev,dr,threshold,margin,head)
  if candidate_dev['supportedCorrect']>baseline_dev['supportedCorrect'] and candidate_dev['unknownRejected']>=baseline_dev['unknownRejected']: selected='linear-head'
  decision='Development-selected '+selected+': '+('learned head improved supported accuracy without reducing unknown rejection.' if selected=='linear-head' else 'learned head did not pass the improvement gate; baseline retained.')
  events.append({'actor':'Trainer','summary':f'120 actual AdamW steps on {len(tr)} training-subject photos; encoder frozen. Loss {losses[0]:.4f} → {losses[-1]:.4f}.'})
 else: events.append({'actor':'Trainer','summary':'Skipped: development target met; no learned-weight update performed.'})
 events.append({'actor':'Evaluator','summary':decision+' Final test follows this decision; no final-test tuning.'})
 binding={'model':MODEL,'revision':REV,'sha256':SHA,'selected':selected,'threshold':threshold,'margin':margin,'headFile':head_file if selected=='linear-head' else None,'headSha256':digest(ROOT/head_file) if selected=='linear-head' else None}
 progress('Evaluator',decision+' Measuring final held-out subject now.')
 result={'scope':'One packaged product per photo; no boxes or counts. Limited MIMEX subject-held-out subset, not broad real-world validation.','model':binding,'dataset':{k:v for k,v in manifest.items() if k!='rows'},'excludedNearDuplicates':excluded,'baselineDevelopment':baseline_dev,'candidateDevelopment':candidate_dev,'baselineFinal':metrics(final,fr,threshold,margin),'selectedFinal':metrics(final,fr,threshold,margin,head if selected=='linear-head' else None),'decision':decision,'events':events,'elapsedMs':round((time.time()-started)*1000),'device':device,'completedAt':int(time.time()*1000),'scoreMeaning':'Cosine similarity, not calibrated probability. Unknown rejection is limited and can fail.'}
 write(out,result)
elif sys.argv[1]=='predict':
 binding={'model':MODEL,'revision':REV,'sha256':SHA,'selected':'baseline','threshold':.22,'margin':.01,'headSha256':None}
 if len(sys.argv)>5: binding=json.loads(Path(sys.argv[5]).read_text())
 if binding['revision']!=REV or binding['sha256']!=SHA: raise ValueError('Selected recipe model mismatch')
 head=None
 if binding['selected']=='linear-head':
  import re
  if not re.fullmatch(r'head-result-[a-f0-9-]{36}\.npz',binding.get('headFile','')): raise ValueError('Invalid learned head binding')
  if digest(ROOT/binding['headFile'])!=binding['headSha256']: raise ValueError('Learned head changed; re-evaluate')
  with np.load(ROOT/binding['headFile'],allow_pickle=False) as h: head={k:h[k] for k in ('weight','bias')}
 features=encode([photo(Path(sys.argv[4]))]);pred,sim=classify(features,binding['threshold'],binding['margin'],head);label=int(pred[0]);order=np.argsort(sim[0,:5])[::-1]
 write(out,{'label':LABELS[label] if label>=0 else 'Unknown / unsupported photo','accepted':label>=0,'similarities':[{'label':LABELS[i],'score':float(sim[0,i])} for i in order],'model':binding,'device':device,'elapsedMs':round((time.time()-started)*1000),'scope':'One packaged product per photo; no detection or counts. Piles and unfamiliar packaging are unsupported.','scoreMeaning':'Cosine similarity, not probability. A plausible label may still be wrong.'})
else: raise ValueError('Unsupported operation')
