// Fixed public source only; never downloads user-provided URLs. Run under Device reservation.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {visionDataset} from '../lib/vision-policy.mjs';
const root=path.resolve(process.argv[2]), directory=path.join(root,'dataset');await mkdir(directory,{recursive:true,mode:0o700});
const manifest={...visionDataset,splitPolicy:'Subject 2=train, subject 3=development, subject 1=final. Original paper establishes unseen test subject. Deterministic first capped rows; no augmentation before split.',rows:[]};
const wanted=(row,split)=>Number(row.label)<5?{group:split==='test'?'final':String(row.sample_id)==='2'?'train':String(row.sample_id)==='3'?'development':null,cap:split==='test'?20:String(row.sample_id)==='2'?20:10}: [5,9,13,18,23].includes(Number(row.label))?{group:split==='test'?'final':'development',cap:8}:null;
const counts=new Map(), hashes=new Set();let total=0;
async function get(url){for(let i=0;i<3;i++){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(r.ok)return r;if(i===2)throw Error('Public dataset request failed: '+r.status);} }
for(const split of ['train','test']){
 for(let offset=0;offset<3000;offset+=100){
  const response=await get(`https://datasets-server.huggingface.co/rows?dataset=Anilot%2FMIMEX&config=default&split=${split}&offset=${offset}&length=100`);const page=await response.json();
  for(const item of page.rows??[]){const row=item.row, spec=wanted(row,split);if(!spec?.group)continue;if(Number(row.label)>=5&&split==='train'&&String(row.sample_id)!=='3')continue;
   const key=spec.group+':'+row.label;if((counts.get(key)||0)>=spec.cap)continue;
   const url=new URL(row.image.src);if(url.hostname!=='datasets-server.huggingface.co'||!url.pathname.includes(visionDataset.revision))throw Error('Dataset image revision/source changed; review required');
   const bytes=Buffer.from(await(await get(url)).arrayBuffer());total+=bytes.length;if(bytes.length>8*1024*1024||total>80*1024*1024)throw Error('Dataset download exceeded budget');
   const sha256=createHash('sha256').update(bytes).digest('hex');if(hashes.has(sha256))continue;hashes.add(sha256);
   const file=sha256+'.jpg';await writeFile(path.join(directory,file),bytes,{mode:0o600});counts.set(key,(counts.get(key)||0)+1);
   manifest.rows.push({file,label:Number(row.label),product:row.product_name,subject:String(row.sample_id),split:spec.group,sha256,sourceIndex:item.row_idx,sourceSplit:split,sourceHash:row.image_hash,source:url.origin+url.pathname});
  }
  const groups=split==='train'?['train','development']:['final'];let complete=true;for(const group of groups)for(let label=0;label<5;label++)if((counts.get(group+':'+label)||0)<(group==='development'?10:20))complete=false;for(const label of [5,9,13,18,23])if((counts.get((split==='train'?'development':'final')+':'+label)||0)<8)complete=false;
  if(complete)break;
 }
}
for(const group of ['train','development','final'])for(let label=0;label<5;label++)if((counts.get(group+':'+label)||0)<8)throw Error('Insufficient subject-disjoint data for '+group+' label '+label);
manifest.downloadedBytes=total;manifest.counts=Object.fromEntries(counts);await writeFile(path.join(root,'dataset.json'),JSON.stringify(manifest,null,2),{mode:0o600});console.log('Prepared',manifest.rows.length,'subject-disjoint images',total,'bytes');
