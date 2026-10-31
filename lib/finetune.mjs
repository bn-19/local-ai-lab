import {candyTrainingData,candySystem} from './candy.mjs';
import {spawn} from 'node:child_process';
import {writeFileSync,unlinkSync} from 'node:fs';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fineTuneData,trainingSystem} from './finetune-data.mjs';
export async function runFineTune(job,signal,progress,options={}){
 const run=path.resolve('.local-lab/finetune',job.id);
 const profile=job.payload.profile??'retail';
 const data=options.data??(profile==='candy'?candyTrainingData():fineTuneData());
 const system=profile==='candy'?candySystem:trainingSystem;
 const model=JSON.parse(await readFile('.local-lab/finetune/model.json','utf8'));
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
 await writeFile(path.join(run,'manifest.json'),JSON.stringify({version:options.version??profile+'-qlora-v1',profile,baselineAdapter:options.baselineAdapter?path.resolve(options.baselineAdapter):null,model,system,config,hashes,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),provenance:'Authored synthetic question families split before policy variants; no private CSV used.',startedAt:Date.now()},null,2));
 // All descendants share a task-owned process group; cancellation kills the whole group.
 await new Promise((resolve,reject)=>{
   const child=spawn(path.resolve('.venv/bin/python'),['-u','scripts/finetune-worker.py','run',run],{detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1'}});
   if(child.pid)writeFileSync('.local-lab/finetune-active.json',JSON.stringify({pid:child.pid,jobId:job.id}),{mode:0o600});
   let tail='',stopping=false,killTimer;
   const kill=sig=>{try{process.kill(-child.pid,sig);}catch(e){if(e.code!=='ESRCH')throw e;}};
   const stop=()=>{stopping=true;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),2000);};
   const deadline=setTimeout(stop,16*60*1000);
   signal.addEventListener('abort',stop,{once:true});
   if(signal.aborted)stop();
   let pending=Promise.resolve();
   const output=chunk=>{tail=(tail+chunk.toString()).slice(-12000);const line=chunk.toString().trim().split('\n').at(-1);pending=pending.then(async()=>{await appendFile(path.join(run,'run.log'),chunk);if(line)await progress(line.slice(0,350));}).catch(()=>{});};
   child.stdout.on('data',output);child.stderr.on('data',output);
   child.on('error',reject);
   child.on('close',async code=>{try{unlinkSync('.local-lab/finetune-active.json');}catch{}clearTimeout(deadline);clearTimeout(killTimer);signal.removeEventListener('abort',stop);if(stopping)kill('SIGKILL');await pending;code===0&&!stopping?resolve():reject(Error(stopping?'Fine-tuning cancelled or exceeded 16-minute cap':`Fine-tuning failed (${code}): ${tail.slice(-1500)}`));});
 });
 return JSON.parse(await readFile(path.join(run,'result.json'),'utf8'));
}
