import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {api} from './api-client.mjs';
const oracle=JSON.parse(await readFile('.local-lab/live-retail-oracle.json'));
const s=await api('state');
const task=s.tasks.find(t=>t.datasetId==='72e1e9c8-42d2-49b2-826b-4408eac62ace');assert.ok(task,'Import the public retail fixture first');
const questions=[
 ['What is our net revenue?','revenue','merchandise-include'],
 ['What is our average order value?','average_order_value','merchandise-include'],
 ['Rank our top products by revenue.','top_products','merchandise-include'],
 ['How many distinct orders are there?','orders','merchandise-include'],
 ['Show revenue excluding negative quantity rows.','revenue','merchandise-exclude'],
 ['Show revenue including shipping and adjustment codes too.','revenue','all-include'],
 ['Show revenue including shipping and adjustments, but omit negative quantity rows.','revenue','all-exclude'],
 ['How much profit did we earn after product costs?','clarify',null],
];
const evidence=[];
for(const [request,metric,key] of questions){
 const {jobId}=await api(`tasks/${task.id}/report`,{request});let job;
 for(let i=0;i<240;i++){job=await api('jobs/'+jobId);if(['ready','failed','cancelled'].includes(job.status))break;await new Promise(r=>setTimeout(r,500));}
 assert.equal(job.status,'ready',job.error);const r=job.result;
 assert.equal(r.plan.metric,metric,request);
 if(metric==='clarify')assert.ok(r.clarification);
 else {
  assert.equal(r.plan.scope+'-'+r.plan.returns,key);
  assert.equal(r.includedRows,oracle[key].includedRows);
  if(metric==='top_products')for(let i=0;i<12;i++){assert.equal(r.answer[i].product,oracle[key][metric][i].product);assert.ok(Math.abs(r.answer[i].revenue-oracle[key][metric][i].revenue)<0.00001);}
  else assert.ok(Math.abs(r.answer-oracle[key][metric])<0.00001,JSON.stringify(r));
 }
 evidence.push(r);console.log(JSON.stringify({metric,request,answer:r.answer??r.clarification,rows:r.includedRows,elapsedMs:r.elapsedMs}));
}
const after=await api('state');assert.equal(after.device.active,null);assert.equal(after.device.queue.length,0);
assert.deepEqual(after.recipe,s.recipe);
await writeFile('.local-lab/live-report-acceptance.json',JSON.stringify({taskId:task.id,passed:evidence.length,results:evidence},null,2));
console.log('All 8 real-data reporting checks passed; dashboard recipe unchanged.');
