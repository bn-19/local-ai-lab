import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {toolTrainingData,toolTrainingProvenance,toolTrainingSystem} from '../lib/tool-training-data.mjs';
import {calculateReport,reportingSchema,rules} from '../lib/reporting.mjs';
import {terminateOwnedProcessGroup} from '../lib/finetune.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
function caseEvidence(final,passes){
 return final.map(c=>({...c,plan:passes.has(c.id)?c.expected:{...c.expected,scope:c.expected.scope==='all'?'merchandise':'all'},passed:passes.has(c.id),elapsedSeconds:0.01}));
}
function evaluation(final,passes,nonzero=0){
 return {cases:caseEvidence(final,passes),score:passes.size,peakMemoryBytes:1024,nonzeroLoRABParameters:nonzero};
}
function gate(payload){
 const result=spawnSync('python3',['scripts/finetune-worker.py','gate'],{cwd:root,input:JSON.stringify(payload),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 return JSON.parse(result.stdout);
}

test('reviewed sales tool uses disjoint synthetic splits and fresh critical finals',()=>{
 const data=toolTrainingData();
 assert.deepEqual(Object.keys(data),['train','valid','final']);
 assert.equal(data.train.length,146);assert.equal(data.valid.length,17);assert.equal(data.final.length,12);
 const all=Object.values(data).flat();
 assert.equal(new Set(all.map(c=>c.id)).size,all.length);
 assert.equal(new Set(all.map(c=>c.request)).size,all.length);
 assert.ok(data.final.filter(c=>c.critical).length>=3);
 assert.ok(data.final.filter(c=>c.expected.metric==='clarify').every(c=>c.critical));
 for(const c of all){
  assert.deepEqual(Object.keys(c.expected).sort(),Object.keys(reportingSchema.properties).sort());
  assert.doesNotThrow(()=>calculateReport(c.expected));
 }
 assert.equal(toolTrainingSystem.includes(JSON.stringify(reportingSchema)),true);
 assert.equal(toolTrainingSystem.includes(JSON.stringify(rules)),true);
 assert.match(toolTrainingProvenance.limits,/small synthetic evidence/);
});

test('critical gate promotes only a strict improvement with changed weights and protected cases',()=>{
 const final=toolTrainingData().final;
 const critical=new Set(final.filter(c=>c.critical).map(c=>c.id));
 const baselinePasses=new Set(final.slice(0,5).map(c=>c.id));
 const candidatePasses=new Set([...critical,...final.slice(0,8).map(c=>c.id)]);
 const result=gate({baseline:evaluation(final,baselinePasses),adapted:evaluation(final,candidatePasses,25),final,requireCriticalGate:true});
 assert.equal(result.selected,'adapter');
 assert.equal(result.aggregate.strictlyImproved,true);
 assert.equal(result.weights.changed,true);
 assert.equal(result.critical.allCandidatePassed,true);
 assert.deepEqual(result.critical.baselinePassingRegressions,[]);
});

test('critical gate retains the base on ties, unchanged weights, or any critical failure',()=>{
 const final=toolTrainingData().final;
 const criticalId=final.find(c=>c.critical).id;
 const baselinePasses=new Set(final.slice(0,4).map(c=>c.id));
 const betterPasses=new Set(final.slice(0,8).map(c=>c.id));
 let result=gate({baseline:evaluation(final,baselinePasses),adapted:evaluation(final,betterPasses,0),final,requireCriticalGate:true});
 assert.equal(result.selected,'baseline');assert.ok(result.reasons.includes('lora_b_unchanged'));
 betterPasses.delete(criticalId);
 betterPasses.add(final.at(-1).id);
 result=gate({baseline:evaluation(final,baselinePasses),adapted:evaluation(final,betterPasses,20),final,requireCriticalGate:true});
 assert.equal(result.selected,'baseline');assert.ok(result.reasons.includes('critical_candidate_failure'));
 result=gate({baseline:evaluation(final,baselinePasses),adapted:evaluation(final,baselinePasses,20),final,requireCriticalGate:true});
 assert.equal(result.selected,'baseline');assert.ok(result.reasons.includes('aggregate_not_strictly_better'));
});

test('gate rejects mismatched or non-finite evidence without loading MLX',()=>{
 const final=toolTrainingData().final;
 const passes=new Set(final.slice(0,4).map(c=>c.id));
 const baseline=evaluation(final,passes),adapted=evaluation(final,new Set(final.slice(0,8).map(c=>c.id)),12);
 adapted.cases[0].expected={...adapted.cases[0].expected,scope:'all'};
 let result=spawnSync('python3',['scripts/finetune-worker.py','gate'],{cwd:root,input:JSON.stringify({baseline,adapted,final,requireCriticalGate:true}),encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/identical final ID and expected plan/);
 const validAdapted=evaluation(final,new Set(final.slice(0,8).map(c=>c.id)),12);
 const invalid=JSON.stringify({baseline,adapted:validAdapted,final,requireCriticalGate:true}).replace('"score":4','"score":NaN');
 result=spawnSync('python3',['scripts/finetune-worker.py','gate'],{cwd:root,input:invalid,encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/NaN/);
});

test('cleanup confirms a stubborn task-owned descendant is gone after its group leader closes',async()=>{
 const descendant=`process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)`;
 const leader=`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','pipe','ignore']});child.stdout.once('data',()=>{console.log(child.pid);child.stdout.destroy();process.exit(0)});`;
 const processLeader=spawn(process.execPath,['-e',leader],{detached:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';processLeader.stdout.on('data',chunk=>{stdout+=chunk;});processLeader.stderr.on('data',chunk=>{stderr+=chunk;});
 let cleanup;
 try{
  const [code]=await once(processLeader,'close');
  assert.equal(code,0,stderr);
  const descendantPid=Number(stdout.trim());assert.ok(Number.isInteger(descendantPid)&&descendantPid>1);
  assert.doesNotThrow(()=>process.kill(-processLeader.pid,0),'fixture must leave its process group alive after leader close');
  cleanup=await terminateOwnedProcessGroup(processLeader.pid,{termGraceMs:100,killGraceMs:2000});
  assert.equal(cleanup.confirmedGone,true);assert.equal(cleanup.killSent,true);
  assert.throws(()=>process.kill(-processLeader.pid,0),{code:'ESRCH'});
  assert.throws(()=>process.kill(descendantPid,0),{code:'ESRCH'});
 }finally{
  if(!cleanup?.confirmedGone)await terminateOwnedProcessGroup(processLeader.pid,{termGraceMs:0,killGraceMs:2000}).catch(()=>{});
 }
});
