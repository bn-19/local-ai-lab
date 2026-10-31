import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {api} from './api-client.mjs';
const state=await api('state');
assert.equal(state.device.active,null,'Wait for the active job');
assert.equal(state.device.queue.length,0,'Wait for queued jobs');
const task=state.tasks.find(t=>t.status==='ready');
assert.ok(task,'Create a dashboard task first');
const previousRecipe=state.recipe;
await api(`tasks/${task.id}/evaluate`,{});
let result;
const deadline=Date.now()+8*60*1000;
let last='';
while(Date.now()<deadline){
  const current=await api(`tasks/${task.id}`);
  result=current.evaluation;
  const progress=JSON.stringify({stage:result?.stage,baseline:result?.baseline?.length,candidate:result?.tuned?.length});
  if(progress!==last){console.log(progress);last=progress;}
  if(['complete','failed','cancelled'].includes(result?.stage))break;
  await new Promise(r=>setTimeout(r,1000));
}
assert.equal(result?.stage,'complete',JSON.stringify(result));
assert.equal(result.benchmark,'retail-rules-v1');
assert.equal(result.baseline.length,10);
assert.equal(result.tuned.length,10);
assert.equal(result.selected,result.tunedScore>result.baselineScore?'tuned':'baseline');
const after=await api('state');
assert.deepEqual(after.recipe,previousRecipe,'Reporting experiment must not change dashboard planner recipe');
await writeFile('.local-lab/reporting-experiment.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({baseline:result.baselineScore,candidate:result.tunedScore,total:result.finalCount,selected:result.selected,failures:[...result.baseline,...result.tuned].filter(r=>!r.passed).map(r=>({id:r.id,plan:r.plan,failure:r.failure}))},null,2));
