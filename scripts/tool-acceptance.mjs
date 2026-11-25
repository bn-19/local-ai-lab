// Public/synthetic fixtures only. Never uploads files to a remote service.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4173',token=(await readFile('.local-lab/pairing-token','utf8')).trim();
const evidenceFile='.local-lab/tool-acceptance.json';
const api=async(route,body,raw=false)=>{
 const response=await fetch(base+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,Origin:base,...(body!==undefined?{'Content-Type':raw?'text/csv':'application/json'}:{}),...(raw?{'X-Filename':'synthetic-sales.csv'}:{})},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
 const value=await response.json();if(!response.ok)throw Error(value.error);return value;
};
const wait=async id=>{let prior;for(let i=0;i<2400;i++){
 const job=await api('jobs/'+id);if(job.stage!==prior){console.log(job.stage);prior=job.stage;}
 if(!['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,500));
}throw Error('Acceptance job timeout');};
const mode=process.argv[2];
if(mode==='start'){
 const health=await api('health');assert.equal(health.runtimes.relay.enabled,false);
 const dataset=await api('datasets',await readFile('test/fixtures/sales-tool.csv'),true);
 const input={request:'Help me answer sales reporting questions for my small shop',datasetId:dataset.id};
 const recommendation=await api('tools/recommend',input);assert.ok(recommendation.compatible,recommendation.reasons.join('; '));
 const created=await api('tools',input);
 await writeFile(evidenceFile,JSON.stringify({created,datasetId:dataset.id,recommendation,startedAt:new Date().toISOString()},null,2));console.log(JSON.stringify(created));
 const job=await wait(created.jobId);assert.equal(job.status,'ready',job.error);
 const evidence=JSON.parse(await readFile(evidenceFile));evidence.training=job.result;evidence.trainingJob=job;
 await writeFile(evidenceFile,JSON.stringify(evidence,null,2));console.log(JSON.stringify({selected:job.result.selected,baseline:job.result.evaluation.baseline.score,candidate:job.result.evaluation.adapted.score,total:job.result.evaluation.total,gate:job.result.evaluation.gate}));
}else if(mode==='run'){
 const evidence=JSON.parse(await readFile(evidenceFile));const tool=(await api('tools')).find(t=>t.id===evidence.created.taskId);assert.ok(tool);
 const original=evidence.training;assert.ok(original,'Pre-restart training evidence is required');
 const binding=original.binding.fingerprint;
 assert.equal(tool.binding.fingerprint,binding,'Reopened tool binding was substituted');
 assert.equal(tool.binding.base.revision,original.binding.base.revision);
 assert.equal(tool.binding.adapter?.files['adapters.safetensors'].sha256??null,original.binding.adapter?.files['adapters.safetensors'].sha256??null);
 const checks=[];
 for(const [request,expected] of [['How much net revenue did the shop make?',50],['What is average order value?',50/3],['How many distinct merchandise orders were recorded?',3],['How much profit remains after inventory costs?',null]]){
   const {jobId}=await api('tools/'+tool.id+'/run',{request});const review=await wait(jobId);assert.equal(review.status,'ready',review.error);
   assert.equal(review.result.requiresConfirmation,true);assert.equal(review.result.answer,undefined,'No calculation before explicit review');
   const confirmed=await api('tools/'+tool.id+'/calculate',{reviewJobId:jobId,confirmWholeFile:true});const job=await wait(confirmed.jobId);assert.equal(job.status,'ready',job.error);
   assert.equal(job.result.bindingFingerprint,binding);assert.equal(job.result.baseRevision,tool.binding.base.revision);
   assert.equal(job.result.adapterSHA256,tool.binding.adapter?.files['adapters.safetensors'].sha256??null);
   assert.equal(job.result.loadedAdapterSHA256,job.result.adapterSHA256);
   if(expected===null)assert.ok(job.result.clarification);else assert.ok(Math.abs(job.result.answer-expected)<0.000001,JSON.stringify(job.result));
   checks.push(job.result);
 }
 evidence.runs=[...(evidence.runs??[]),{at:new Date().toISOString(),checks}];await writeFile(evidenceFile,JSON.stringify(evidence,null,2));
 const state=await api('state');assert.equal(state.device.active,null);assert.equal(state.device.queue.length,0);
 console.log(JSON.stringify({checks:checks.length,bindingFingerprint:binding,baseRevision:tool.binding.base.revision,adapterSHA256:checks[0].adapterSHA256}));
}else throw Error('Use start or run');
