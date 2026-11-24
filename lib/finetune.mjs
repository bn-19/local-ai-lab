import {candyTrainingData,candySystem} from './candy.mjs';
import {spawn} from 'node:child_process';
import {writeFileSync,unlinkSync} from 'node:fs';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fineTuneData,trainingSystem} from './finetune-data.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function processGroupExists(pgid){
 if(!Number.isInteger(pgid)||pgid<2)throw Error('Invalid task-owned process group');
 try{process.kill(-pgid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}
}
function signalProcessGroup(pgid,signal){
 try{process.kill(-pgid,signal);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}
}
async function waitForProcessGroupExit(pgid,timeoutMs){
 const deadline=Date.now()+timeoutMs;
 while(processGroupExists(pgid)&&Date.now()<deadline)await delay(Math.min(25,Math.max(1,deadline-Date.now())));
 return !processGroupExists(pgid);
}
export async function terminateOwnedProcessGroup(pgid,{termGraceMs=200,killGraceMs=2000}={}){
 if(!Number.isInteger(termGraceMs)||termGraceMs<0||!Number.isInteger(killGraceMs)||killGraceMs<1)throw Error('Invalid process cleanup timing');
 if(!processGroupExists(pgid))return {confirmedGone:true,termSent:false,killSent:false};
 const termSent=signalProcessGroup(pgid,'SIGTERM');
 if(await waitForProcessGroupExit(pgid,termGraceMs))return {confirmedGone:true,termSent,killSent:false};
 const killSent=signalProcessGroup(pgid,'SIGKILL');
 return {confirmedGone:await waitForProcessGroupExit(pgid,killGraceMs),termSent,killSent};
}

export async function runFineTune(job,signal,progress,options={}){
 const run=path.resolve('.local-lab/finetune',job.id);
 const profile=job.payload.profile??'retail';
 const data=options.data??(profile==='candy'?candyTrainingData():fineTuneData());
 const system=options.system??(profile==='candy'?candySystem:trainingSystem);
 const requireCriticalGate=options.requireCriticalGate??false;
 if(typeof system!=='string'||!system.trim())throw Error('Fine-tuning system instructions are required');
 if(typeof requireCriticalGate!=='boolean')throw Error('requireCriticalGate must be a boolean');
 if(requireCriticalGate&&(options.baselineAdapter!=null||options.resumeAdapter!=null))throw Error('Reviewed tool training must compare the unchanged foundation model with a new adapter');
 for(const split of ['train','valid','final'])if(!Array.isArray(data[split])||data[split].length<1)throw Error(`Fine-tuning ${split} cases are required`);
 const all=Object.values(data).flat();
 if(all.some(c=>typeof c.id!=='string'||!c.id||typeof c.request!=='string'||!c.request||!c.expected||typeof c.expected!=='object'))throw Error('Fine-tuning cases require id, request, and expected plan');
 if(new Set(all.map(c=>c.id)).size!==all.length)throw Error('Fine-tuning case IDs must be unique');
 if(requireCriticalGate&&!data.final.some(c=>c.critical===true))throw Error('Reviewed tool training requires critical final cases');
 const model=JSON.parse(await readFile('.local-lab/finetune/model.json','utf8'));
 if(requireCriticalGate&&(!model.repository||!model.revision||!model.path))throw Error('Reviewed tool training requires an exact base model repository, revision, and local path');
 await mkdir(path.join(run,'data'),{recursive:true});
 const hashes={};
 for(const split of ['train','valid']){
   const text=data[split].map(c=>JSON.stringify({messages:[{role:'system',content:system},{role:'user',content:c.request},{role:'assistant',content:JSON.stringify(c.expected)}]})).join('\n')+'\n';
   await writeFile(path.join(run,'data',split+'.jsonl'),text);
   hashes[split]=createHash('sha256').update(text).digest('hex');
 }
 const final=JSON.stringify(data.final,null,2);hashes.final=createHash('sha256').update(final).digest('hex');
 await writeFile(path.join(run,'final.json'),final);
 const config={model:path.resolve(model.path),train:true,data:path.join(run,'data'),adapter_path:path.join(run,'adapter'),iters:options.iterations??120,batch_size:2,num_layers:8,learning_rate:0.0001,max_seq_length:768,steps_per_report:10,steps_per_eval:60,val_batches:4,save_every:options.iterations??120,mask_prompt:true,grad_checkpoint:true,seed:7,lora_parameters:{rank:8,dropout:0,scale:16}};
 if(options.resumeAdapter)config.resume_adapter_file=path.resolve(options.resumeAdapter);
 await writeFile(path.join(run,'config.json'),JSON.stringify(config,null,2));
 await writeFile(path.join(run,'manifest.json'),JSON.stringify({version:options.version??profile+'-qlora-v1',profile,baselineAdapter:options.baselineAdapter?path.resolve(options.baselineAdapter):null,requireCriticalGate,model,system,config,hashes,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),provenance:'Authored synthetic question families split before policy variants; no private CSV used.',startedAt:Date.now()},null,2));
 // All descendants share a task-owned process group; cancellation kills the whole group.
 await new Promise((resolve,reject)=>{
   signal.throwIfAborted();
   const child=spawn(path.resolve('.venv/bin/python'),['-u','scripts/finetune-worker.py','run',run],{detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1'}});
   if(child.pid)writeFileSync('.local-lab/finetune-active.json',JSON.stringify({pid:child.pid,jobId:job.id}),{mode:0o600});
   let tail='',stopping=false,stopReason='',closed=false,spawnError,killTimer;
   const kill=sig=>{if(child.pid)signalProcessGroup(child.pid,sig);};
   const stop=reason=>{if(stopping||closed)return;stopping=true;stopReason=reason;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),2000);};
   const deadline=setTimeout(()=>stop('Fine-tuning exceeded the 16-minute cap'),16*60*1000);
   const abort=()=>stop('Fine-tuning cancelled');
   signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted)abort();
   let pending=Promise.resolve();
   const output=chunk=>{tail=(tail+chunk.toString()).slice(-12000);const line=chunk.toString().replace(/\x1b\[[0-9;]*m/g,'').trim().split('\n').at(-1);const step=line?.match(/^\s*(\d+)\s/);const summary=step?`Learning from local examples · ${step[1]} of ${config.iters}`:line;pending=pending.then(async()=>{await appendFile(path.join(run,'run.log'),chunk);if(summary)await progress(summary.slice(0,350));}).catch(()=>{});};
   child.stdout.on('data',output);child.stderr.on('data',output);
   // Settle only after close confirms the entire task-owned process group has
   // exited; an error event alone must not release the Device reservation.
   child.on('error',error=>{spawnError=error;});
   child.on('close',async code=>{
     closed=true;clearTimeout(deadline);clearTimeout(killTimer);signal.removeEventListener('abort',abort);
     await pending;
     let cleanup={confirmedGone:!child.pid};let cleanupError;
     try{if(child.pid)cleanup=await terminateOwnedProcessGroup(child.pid);}catch(error){cleanupError=error;}
     if(cleanupError||!cleanup.confirmedGone){
       // Keep the active marker so actor recovery cannot free the Device while
       // a task-owned descendant may still be running.
       reject(Error(`Fine-tuning process-group cleanup could not be confirmed: ${cleanupError?.message??'owned process group still exists'}`));
       return;
     }
     try{const active=JSON.parse(await readFile('.local-lab/finetune-active.json','utf8'));if(active.jobId===job.id&&active.pid===child.pid)unlinkSync('.local-lab/finetune-active.json');}catch{}
     if(spawnError)reject(spawnError);
     else if(stopping)reject(Error(stopReason));
     else if(code===0)resolve();
     else reject(Error(`Fine-tuning failed (${code}): ${tail.slice(-1500)}`));
   });
 });
 return JSON.parse(await readFile(path.join(run,'result.json'),'utf8'));
}
