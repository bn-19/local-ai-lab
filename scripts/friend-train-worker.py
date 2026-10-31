"""Bounded local regeneration of Lamitr's reviewed nine-brand recipe."""
import os,sys,json,csv,hashlib,subprocess,tarfile,time
from pathlib import Path
ROOT=Path(sys.argv[1]);OUT=Path(sys.argv[2]);RUN=ROOT/('friend-'+OUT.stem);RUN.mkdir(mode=0o700,exist_ok=False)
REV='0533adce3877dbeabf4118c66803508f43fdd405'
REPO=str(Path(__file__).resolve().parents[1])
PREFIX='recipes/candy-vision/candies-small/'
SOURCE=Path(__file__).resolve().parents[1]/'recipes/candy-friend/train.py'
CFG={'epochs':30,'lr':.002,'weight_decay':.0001,'hidden':256,'normalize_features':True}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def progress(actor,summary):Path(str(OUT)+'.progress').write_text(json.dumps({'actor':actor,'summary':summary}))
start=time.time();progress('Planner','Regenerate reviewed Lamitr recipe: nine brands, fixed 30 epochs, frozen ResNet18; original photo split retained and disclosed')
data=RUN/'data';(data/'images').mkdir(parents=True)
if subprocess.run(['git','cat-file','-e',REV],cwd=REPO,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
 raise ValueError('Reviewed recipe data not installed: fetch the authorized tuner/vision-recipe branch before training')
raw=subprocess.check_output(['git','show',REV+':'+PREFIX+'annotations.csv'],cwd=REPO)
(data/'annotations.csv').write_bytes(raw)
rows=list(csv.DictReader(raw.decode().splitlines()));names={r['image']for r in rows}
if len(rows)!=2113 or len(names)!=528:raise ValueError('Reviewed dataset shape changed')
proc=subprocess.Popen(['git','archive',REV,PREFIX],cwd=REPO,stdout=subprocess.PIPE)
with tarfile.open(fileobj=proc.stdout,mode='r|')as archive:
 for member in archive:
  name=member.name
  if not member.isfile()or not name.startswith(PREFIX+'images/'):continue
  leaf=name[len(PREFIX+'images/'):]
  if '/'in leaf or leaf not in names:continue
  if member.size>2000000:raise ValueError('Unexpected dataset image size')
  (data/'images'/leaf).write_bytes(archive.extractfile(member).read())
if proc.wait()!=0:raise ValueError('Dataset extraction failed')
manifest=[];seen={}
for name in sorted(names):
 p=data/'images'/name
 h=digest(p);n=int(hashlib.sha256(('7:'+name).encode()).hexdigest()[:8],16)%100
 split='train'if n<70 else'development'if n<85 else'heldout'
 if h in seen and seen[h]!=split:raise ValueError('Exact image duplicate across splits')
 seen[h]=split;manifest.append({'image':name,'sha256':h,'bytes':p.stat().st_size,'split':split})
provenance={'author':'Lamitr recipe; Ruopeng An candy dataset','sourceRevision':REV,'source':'https://www.kaggle.com/datasets/ruopengan/candy-brands-for-object-detection','license':'CDLA-Sharing-1.0','annotationSha256':hashlib.sha256(raw).hexdigest(),'trainingSourceSha256':digest(SOURCE),'config':CFG,'data':manifest,'rowOrderPreserved':True,'limitations':'Original filename-based split reproduced; related views on the same rug/lighting may cross splits. NOT a scene-held-out or pile-counting benchmark. IMG_1930 was previously inspected as development evidence and must not be called a new unseen final test.'}
(RUN/'provenance.json').write_text(json.dumps(provenance,indent=2))
progress('Trainer','Extracting reviewed ResNet18 features and learning the 30-epoch nine-brand head locally')
env={**os.environ,'TORCH_HOME':str(ROOT/'torch'),'PYTHONUNBUFFERED':'1'}
import certifi
env['SSL_CERT_FILE']=certifi.where()
p=subprocess.run([sys.executable,'-I',str(SOURCE),'--data',str(data),'--config',json.dumps(CFG),'--out',str(RUN/'model'),'--cache',str(RUN/'cache')],env=env,stdout=subprocess.PIPE,text=True,check=True)
(RUN/'training-stdout.txt').write_text(p.stdout)
metrics=json.loads(p.stdout.strip().splitlines()[-1]);head=RUN/'model/head.pt'
# The checkpoint is from this reviewed run; restricted loading still verifies its structure.
import torch
ck=torch.load(head,map_location='cpu',weights_only=True)
if set(ck)!=set(['labels','config','state','mean','std','backbone','splits'])or len(ck['labels'])!=9:raise ValueError('Unexpected head structure')
if ck['mean'].shape!=(512,)or ck['std'].shape!=(512,)or not torch.isfinite(ck['std']).all():raise ValueError('Invalid normalization')
backbone=ROOT/'torch/hub/checkpoints/resnet18-f37072fd.pth'
result={'kind':'friend-head','metrics':metrics,'headFile':str(head.relative_to(ROOT)),'headSha256':digest(head),'backboneSha256':digest(backbone),'provenance':str((RUN/'provenance.json').relative_to(ROOT)),'sourceRevision':REV,'elapsedMs':round((time.time()-start)*1000),'selected':False,'scope':'Locally regenerated crop classifier. No detector/counting accuracy claim; not selected until separately tested on detected crops.'}
OUT.write_text(json.dumps(result,indent=2));progress('Evaluator','Regeneration complete; candidate saved without automatic promotion')
