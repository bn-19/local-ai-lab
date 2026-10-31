import {runPile} from './pile.mjs';
import {health} from './health.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runLocalProcess} from './local-process.mjs';
import {save,state} from './actors.mjs';
import {visionModel,visionDataset,visionLabels,visionAction} from './vision-policy.mjs';
const source=fileURLToPath(new URL('../',import.meta.url));
export const visionRoot=path.resolve('.local-lab/vision');
const python=path.join(visionRoot,'venv/bin/python');
export async function visionStatus(){let installed=false,bytes=0;try{const ready=JSON.parse(await readFile(path.join(visionRoot,'installed.json'),'utf8'));installed=ready.revision===visionModel.revision;bytes=ready.bytes;}catch{}return {model:visionModel,dataset:visionDataset,labels:visionLabels,installed,bytes,path:visionRoot,retention:'Saved until you remove it; no automatic deletion.',evaluation:(await state())['vision:evaluation']??null,friendHead:(await state())['vision:friend-head-candidate']??null,detectorInstalled:await stat(path.join(visionRoot,'detector-installed.json')).then(()=>true).catch(()=>false)};}
export async function runVision(job,signal,progress){
 const action=visionAction(job.payload.action);if(['install-detector','detect','train-pile-head','detect-friend'].includes(action))return runPile(job,signal,progress);await mkdir(visionRoot,{recursive:true,mode:0o700});
 const stage=async(actor,summary)=>progress(`${actor} · ${summary}`);
 const run=(args,timeout=120000)=>runLocalProcess(python,args,{signal,timeout,maxBuffer:8*1024*1024,env:{...process.env,HF_HUB_DISABLE_TELEMETRY:'1',TOKENIZERS_PARALLELISM:'false'}});
 if(action==='install'){
  const machine=(await health()).machine;if(machine.freeDiskGB<3)throw Error('Vision setup needs at least 3 GB free disk');
  await stage('Planner','Install pinned CLIP vision runtime; ~605 MB weights plus dependencies. Kept on this Mac.');
  await runLocalProcess('python3',['-m','venv',path.join(visionRoot,'venv')],{signal});
  await run(['-m','pip','install','--disable-pip-version-check','-r',path.join(source,'requirements-vision.txt')],900000);
  await stage('System','Downloading official pinned model and verifying SHA-256');
  await run([path.join(source,'scripts/vision-worker.py'),'install',visionRoot],900000);
  return visionStatus();
 }
 if(!(await visionStatus()).installed)throw Error('Install the vision model first');
 const output=path.join(visionRoot,'result-'+job.id+'.json');
 if(action==='evaluate'){
  await stage('Planner','Evaluate five single-product labels; separate people for training, development and final test');
  try{await stat(path.join(visionRoot,'dataset.json'));}catch{await stage('System','Downloading bounded author-released MIT photo subset');await runLocalProcess(process.execPath,[path.join(source,'scripts/vision-data.mjs'),visionRoot],{signal,timeout:900000});}
  await stage('Evaluator','Measure CLIP baseline; train a small frozen-encoder head only if development accuracy is below 90%');
  let last='',pending=Promise.resolve();const timer=setInterval(()=>{pending=pending.then(async()=>{try{const p=JSON.parse(await readFile(output+'.progress','utf8'));const next=p.actor+' · '+p.summary;if(next!==last){last=next;await progress(next);}}catch{}});},1000);
  try{await run([path.join(source,'scripts/vision-worker.py'),'evaluate',visionRoot,output],900000);}finally{clearInterval(timer);await pending;}
  const result={...JSON.parse(await readFile(output,'utf8')),jobId:job.id};await stage('Evaluator',result.decision);signal.throwIfAborted();await save('vision:evaluation',result);return result;
 }
 const s=await state(),photo=s['photo:'+job.payload.photoId];if(!photo||!/^[a-f0-9-]{36}$/.test(photo.id))throw Error('Photo not found');
 await stage('System','Running selected vision model locally; one packaged product per image');
 const binding=s['vision:evaluation']?.model;const bindingPath=output+'.binding.json';if(binding)await writeFile(bindingPath,JSON.stringify(binding),{mode:0o600,flag:'wx'});
 await run([path.join(source,'scripts/vision-worker.py'),'predict',visionRoot,output,path.join(visionRoot,'photos',photo.id),...(binding?[bindingPath]:[])],120000);
 const result={...JSON.parse(await readFile(output,'utf8')),photoId:photo.id};signal.throwIfAborted();
 await save('task:'+job.taskId,{...s['task:'+job.taskId],status:'ready',visionResult:result,completedAt:Date.now()});return result;
}
export async function createVisionTask(photoId,action='predict'){const s=await state();if(!s['photo:'+photoId])throw Error('Photo not found');const task={id:randomUUID(),kind:'vision',photoId,request:action.startsWith('detect')?'Detect and count candies in a pile · experimental':'Identify one packaged chocolate product',model:visionModel,status:'queued',createdAt:Date.now()};await save('task:'+task.id,task);return task;}
