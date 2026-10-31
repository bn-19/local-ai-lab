import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {api} from './api-client.mjs';
const csv=await readFile('.local-lab/sources/candy/candy-data.csv','utf8');
const dataset=await api('datasets',csv,{headers:{Authorization:'Bearer '+(await readFile('.local-lab/pairing-token','utf8')).trim(),'Content-Type':'text/csv','X-Filename':'Halloween-Candy-Power-Ranking.csv'}});
assert.equal(dataset.rows,85);
async function wait(id){let last='';for(let i=0;i<1000;i++){const j=await api('jobs/'+id);if(j.stage!==last){console.log(j.stage);last=j.stage;}if(j.status==='ready')return j;if(['failed','cancelled'].includes(j.status))throw Error(j.error);await new Promise(r=>setTimeout(r,1000));}throw Error('Timed out');}
const task=await api('tasks',{request:'Halloween candy: compare matchup win rates and chocolate preferences',datasetId:dataset.id,measure:{operation:'mean',column:'winpercent'},groupColumn:'competitorname',dateColumn:null,filterColumn:'chocolate',negativePolicy:'include',reuseRecipe:true});
await wait(task.jobId);
await writeFile('.local-lab/candy-demo.json',JSON.stringify({datasetId:dataset.id,taskId:task.taskId},null,2));
const training=await api(`tasks/${task.taskId}/finetune`,{});console.log('Candy training job '+training.jobId);
const done=await wait(training.jobId);
assert.equal(done.result.profile,'candy');assert.ok(done.result.adapted.nonzeroLoRABParameters>0);
await writeFile('.local-lab/candy-training.json',JSON.stringify({jobId:training.jobId,...done.result},null,2));
console.log(JSON.stringify({baseline:done.result.baseline.score,adapted:done.result.adapted.score,total:done.result.total,selected:done.result.selected,seconds:done.result.elapsedSeconds}));
