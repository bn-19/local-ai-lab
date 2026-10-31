import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runLocalProcess} from './local-process.mjs';
import {state,save} from './actors.mjs';
const source=fileURLToPath(new URL('../scripts/pile-worker.py',import.meta.url));
export async function runPile(job,signal,progress){
 const root=path.resolve('.local-lab/vision'),python=path.join(root,'venv/bin/python');
 if(job.payload.action==='train-pile-head'){
  const output=path.join(root,'friend-result-'+job.id+'.json');
  await progress('System · Installing compatible pinned torchvision 0.21.0 for reviewed local recipe');
  await runLocalProcess(python,['-m','pip','install','--disable-pip-version-check','--no-deps','torchvision==0.21.0'],{signal,timeout:180000,maxBuffer:4*1024*1024});
  await progress('Trainer · Regenerating Lamitr nine-brand recipe; original dataset and split provenance saved');
  await runLocalProcess(python,[fileURLToPath(new URL('../scripts/friend-train-worker.py',import.meta.url)),root,output],{signal,timeout:600000,maxBuffer:8*1024*1024});
  signal.throwIfAborted();const result=JSON.parse(await readFile(output,'utf8'));
  await save('vision:friend-head-candidate',{...result,jobId:job.id});return result;
 }
 const install=job.payload.action==='install-detector';
 await progress(install?'System · Installing pinned Apache-2.0 Grounding DINO detector (~689 MB)':'Evaluator · Detecting visible candy instances, then classifying actual detected crops locally');
 let photo;
 if(!install){photo=(await state())['photo:'+job.payload.photoId];if(!photo||!/^[a-f0-9-]{36}$/.test(photo.id))throw Error('Photo not found');}
 const output=path.join(root,'pile-'+job.id+'.json');
 const extra=[];
 if(job.payload.action==='detect-friend'){
  const binding=(await state())['vision:friend-head-candidate'];
  if(!binding||!/^friend-friend-result-[a-f0-9-]{36}\/model\/head\.pt$/.test(binding.headFile))throw Error('Reviewed friend head candidate missing');
  const bindingPath=output+'.friend.json';await writeFile(bindingPath,JSON.stringify(binding),{mode:0o600,flag:'wx'});extra.push(bindingPath);
 }

 await runLocalProcess(python,[source,install?'install':'detect',root,...(install?[]:[output,path.join(root,'photos',photo.id),...extra])],{signal,timeout:install?600000:180000,maxBuffer:8*1024*1024,env:{...process.env,HF_HUB_DISABLE_TELEMETRY:'1',TOKENIZERS_PARALLELISM:'false'}});
 signal.throwIfAborted();
 if(install)return JSON.parse(await readFile(path.join(root,'detector-installed.json'),'utf8'));
 const result={...JSON.parse(await readFile(output,'utf8')),photoId:photo.id};
 const s=await state();signal.throwIfAborted();await save('task:'+job.taskId,{...s['task:'+job.taskId],request:'Detect and count candies in a pile',status:'ready',pileResult:result,completedAt:Date.now()});return result;
}
