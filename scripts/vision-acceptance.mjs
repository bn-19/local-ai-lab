// Explicit opt-in local API acceptance. Uses the existing Device; launches no browser/runtime.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const token=(await readFile('.local-lab/pairing-token','utf8')).trim();
const api=async(path,{method='GET',body,headers={}}={})=>{const r=await fetch('http://127.0.0.1:4173/api'+path,{method,body,headers:{Authorization:'Bearer '+token,...headers}});const j=await r.json();if(!r.ok)throw Error(j.error);return j;};
const post=(path,data)=>api(path,{method:'POST',body:JSON.stringify(data),headers:{'Content-Type':'application/json'}});
const wait=async id=>{const start=Date.now();while(Date.now()-start<180000){const j=await api('/jobs/'+id);if(!['queued','running'].includes(j.status)){assert.equal(j.status,'ready',j.error);return j;}await new Promise(r=>setTimeout(r,500));}throw Error('Vision acceptance timed out; inspect job '+id);};
const status=await api('/vision');assert.equal(status.installed,true);assert.ok(status.evaluation,'Run bounded evaluation first');
const samples=await api('/vision/samples');const summary=[];
for(const sample of [samples.find(s=>s.label==='rocher_chocolate'),samples.find(s=>s.label==='lays_classic')]){
 assert.ok(sample,'Reviewed supported and OOD samples required');const photo=await post('/vision/samples/'+sample.id,{});const queued=await post('/vision',{action:'predict',photoId:photo.id});const job=await wait(queued.jobId);const saved=await api('/tasks/'+queued.taskId);assert.deepEqual(saved.visionResult,job.result);assert.equal(job.result.model.revision,status.model.revision);summary.push({expected:sample.label,label:job.result.label,accepted:job.result.accepted,workerMs:job.result.elapsedMs,jobMs:job.finishedAt-job.startedAt,model:job.result.model.selected});
}
await assert.rejects(()=>api('/photos',{method:'POST',body:'<svg onload="bad"/>',headers:{'X-Filename':'bad.svg'}}),/JPEG or PNG/);
const state=await api('/state');assert.equal(state.device.active,null);assert.equal(state.device.queue.length,0);console.log(JSON.stringify({checks:'saved model binding, supported+OOD actual predictions, invalid format rejection, Device idle',predictions:summary},null,2));
