import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {api} from './api-client.mjs';
const {taskId}=JSON.parse(await readFile('.local-lab/candy-demo.json'));
const {jobId}=await api(`tasks/${taskId}/agentloop`,{});console.log('Agent loop '+jobId);
let job,last='';
for(const end=Date.now()+20*60*1000;Date.now()<end;){
 job=await api('jobs/'+jobId);if(job.stage!==last){console.log(job.stage);last=job.stage;}
 if(['ready','failed','cancelled'].includes(job.status))break;
 await new Promise(r=>setTimeout(r,1500));
}
assert.equal(job.status,'ready',job.error);
const loop=job.result;
assert.ok(loop.events.some(e=>e.role==='Planner'&&e.kind==='decision'));
assert.ok(loop.events.some(e=>e.role==='Evaluator'&&e.kind==='decision'));
if(loop.candidate){assert.ok(loop.events.some(e=>e.role==='Trainer'&&e.kind==='decision'));assert.ok(loop.candidate.adapted.nonzeroLoRABParameters>0);assert.equal(loop.selected,loop.candidate.adapted.score>loop.candidate.baseline.score?'candidate':'current');}
if(loop.candidate?.baselineAdapter){
 const previous=await readFile(path.join(loop.candidate.baselineAdapter,'adapters.safetensors'));
 assert.notEqual(loop.candidate.adapterSHA256,createHash('sha256').update(previous).digest('hex'),'Candidate must contain changed weights, not a copied adapter');
}
for(const sent of loop.events.filter(e=>e.kind==='handoff'))assert.ok(loop.events.some(e=>e.kind==='receipt'&&e.messageId===sent.messageId));
await writeFile('.local-lab/agent-loop-latest.json',JSON.stringify(loop,null,2));
console.log(JSON.stringify({jobId,status:loop.status,selected:loop.selected,development:loop.development?.filter(c=>c.passed).length,baseline:loop.candidate?.baseline.score,candidate:loop.candidate?.adapted.score,total:loop.candidate?.total,handoffs:loop.events.filter(e=>e.kind==='receipt').length}));
