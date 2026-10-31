import assert from 'node:assert/strict';
import {writeFile,stat} from 'node:fs/promises';
import {api} from './api-client.mjs';
const s=await api('state');
assert.equal(s.device.active,null,'Wait for active work to finish');
assert.equal(s.device.queue.length,0,'Wait for queued work to finish');
const task=s.tasks.find(t=>t.status==='ready');assert.ok(task);
const {jobId}=await api(`tasks/${task.id}/finetune`,{});
console.log('Fine-tuning job: '+jobId);
let last='';let job;
for(const deadline=Date.now()+17*60*1000;Date.now()<deadline;){
 job=await api('jobs/'+jobId);
 if(job.stage!==last){console.log(job.stage);last=job.stage;}
 if(['ready','failed','cancelled'].includes(job.status))break;
 await new Promise(r=>setTimeout(r,1500));
}
assert.equal(job.status,'ready',job.error||'Job did not finish');
const result=job.result;
assert.equal(result.total,34);assert.ok((await stat(result.adapterPath)).size>0);
assert.ok(result.adapted.nonzeroLoRABParameters>0,'LoRA B weights must have changed from zero');
assert.equal(result.selected,result.adapted.score>result.baseline.score?'adapter':'baseline');
assert.deepEqual((await api('state')).recipe,s.recipe);
await writeFile('.local-lab/finetune/latest.json',JSON.stringify({jobId,taskId:task.id,...result},null,2));
console.log(JSON.stringify({baseline:result.baseline.score,adapted:result.adapted.score,total:result.total,selected:result.selected,seconds:result.elapsedSeconds,adapter:result.adapterPath,nonzeroLoRABParameters:result.adapted.nonzeroLoRABParameters}));
