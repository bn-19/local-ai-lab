import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {api} from './api-client.mjs';
const {taskId}=JSON.parse(await readFile('.local-lab/candy-demo.json'));
const oracle=JSON.parse(await readFile('.local-lab/candy-oracle.json'));
const checks=[
 ['Which chocolate candies are most popular?','rank','winpercent','chocolate','desc'],
 ['Compare chocolate and non-chocolate average popularity.','compare','winpercent','all','desc'],
 ['Rank the cheapest fruity candies.','rank','pricepercent','fruity','asc'],
 ['Rank the least sugary candies.','rank','sugarpercent','all','asc'],
 ['How many fruity entries are there?','count','winpercent','fruity','desc'],
 ['What is the average win percentage for chocolate candies?','mean','winpercent','chocolate','desc'],
 ['How many grams of sugar are in each candy?','clarify','winpercent','all','desc'],
 ['What is the exact dollar price of these candies?','clarify','winpercent','all','desc'],
 ['Which candies are the most popular?','rank','winpercent','all','desc'],
];
const results=[];
for(const [request,operation,measure,subset,order] of checks){
 const {jobId}=await api(`tasks/${taskId}/report`,{request,subset});let job;
 for(let i=0;i<240;i++){job=await api('jobs/'+jobId);if(['ready','failed','cancelled'].includes(job.status))break;await new Promise(r=>setTimeout(r,500));}
 assert.equal(job.status,'ready',job.error);const r=job.result;
 const expectedPlan={operation,measure,subset,order};
 r.exactPlanMatch=isDeepStrictEqual(r.plan,expectedPlan);
 // Count SQL does not use measure/order. Keep exact mismatches in evidence; validate the actual calculation.
 if(operation==='count')assert.deepEqual({operation:r.plan.operation,subset:r.plan.subset},{operation,subset},request);
 else assert.deepEqual(r.plan,expectedPlan,request);
 if(operation==='clarify')assert.ok(r.clarification);
 else{
  const expected=oracle[[operation,measure,subset,order].join('|')];
  if(Array.isArray(expected)){assert.equal(r.answer.length,expected.length);expected.forEach((e,i)=>{assert.equal(r.answer[i].label,e.label);assert.ok(Math.abs(r.answer[i].value-e.value)<0.000001);});}
  else assert.ok(Math.abs(r.answer-expected)<0.000001);
 }
 results.push(r);console.log(JSON.stringify({request,answer:r.answer??r.clarification,unit:r.unit}));
}
await writeFile('.local-lab/candy-acceptance.json',JSON.stringify({taskId,passed:results.length,results},null,2));
console.log('9 candy reports with explicit confirmed subsets matched the independent original-CSV calculations.');
