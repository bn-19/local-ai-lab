// Unit tests only: synthetic data and HTTP doubles do not demonstrate local inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseCSV,verifyBytes,calculate,verifyDashboard,definition,client,localBase,waitJob,cancelOwned} from './core.mjs';
const rows=parseCSV('competitorname,winpercent,chocolate\r\nA,80,1\r\nB,40,0\r\nC,60,1\r\n');
function dashboard(filter=null){const e=calculate(rows,definition,filter);return {source:{...definition,rows:3,filteredRows:e.count},kpis:[{value:e.value},{value:e.count}],charts:[{title:'mean by competitorname',points:[...e.groups].sort((a,b)=>b.value-a.value)},{title:'mean by chocolate',points:e.categories}],filters:[{column:'chocolate',values:['0','1']}]};}
test('unit: CSV quotes, CRLF and malformed input',()=>{
 assert.deepEqual(parseCSV('a,b\r\n"x,y","z""q"\r\n"line\nbreak",2\r\n'),[{a:'x,y',b:'z"q'},{a:'line\nbreak',b:'2'}]);
 for(const text of ['a,a\n1,2','a,b\n1','a\n"unterminated','a\n"x"junk'])assert.throws(()=>parseCSV(text));
});
test('unit: byte identity rejects altered fixtures',()=>{
 const b=Buffer.from('public');verifyBytes(b,createHash('sha256').update(b).digest('hex'));
 assert.throws(()=>verifyBytes(Buffer.from('changed'),'0'.repeat(64)),/SHA256/);
});
test('unit: independent aggregates and reusable measures',()=>{
 assert.equal(calculate(rows).value,60);assert.equal(calculate(rows,definition,{column:'chocolate',value:'1'}).value,70);
 for(const [operation,value] of [['sum',180],['count',3],['product_sum',140]])assert.equal(calculate(rows,{...definition,measure:{operation,column:'winpercent',column2:'chocolate'}}).value,value);
 assert.throws(()=>calculate([{competitorname:'bad',winpercent:'NaN',chocolate:'1'}]));
});
test('unit: verify actual charts and filter calculations; reject incorrect results',()=>{
 for(const value of [null,'1','0']){const f=value===null?null:{column:'chocolate',value};verifyDashboard(dashboard(f),rows,definition,f);}
 for(const change of [d=>d.kpis[0].value++,d=>d.source.filteredRows++,d=>d.charts[0].points[0].value++,d=>d.charts[1].points.pop(),d=>d.filters[0].values.pop(),d=>d.charts[0].points.reverse()]){const d=dashboard();change(d);assert.throws(()=>verifyDashboard(d,rows));}
});
test('unit: loopback only; no URL credentials, redirects or token in URL',async()=>{
 for(const base of ['https://127.0.0.1','http://localhost','http://example.com','http://user:secret@127.0.0.1','http://127.0.0.1/?token=secret','http://127.0.0.1/app/'])assert.throws(()=>localBase(base));
 let call;const api=client('http://127.0.0.1:4173','unit-secret',async(...args)=>{call=args;return {ok:true,json:async()=>({status:'ready'})};});
 await api('/api/health');assert.ok(!call[0].includes('unit-secret'));assert.equal(call[1].headers.Authorization,'Bearer unit-secret');assert.equal(call[1].redirect,'error');
 const denied=client('http://127.0.0.1','secret',async()=>({ok:false,status:401,json:async()=>{throw Error('must not read error body');}}));
 await assert.rejects(denied('/api/health'),/401/);
});
const owned={jobId:'own-job',taskId:'own-task'};
test('unit: terminal failure is returned, never upgraded to ready',async()=>{
 const job=await waitJob(async()=>({id:owned.jobId,taskId:owned.taskId,status:'failed'}),owned);assert.equal(job.status,'failed');
 await assert.rejects(waitJob(async()=>({id:'other',taskId:owned.taskId,status:'ready'}),owned));
 await assert.rejects(waitJob(async()=>({id:owned.jobId,taskId:owned.taskId,status:'running'}),owned,{timeoutMs:2,pollMs:3}),/timeout/);
});
test('unit: cancellation restricted to owned active job; never terminal or mismatched job',async()=>{
 for(const status of ['queued','running','ready','failed','cancelled','interrupted']){
 const calls=[];await cancelOwned(async(route)=>{calls.push(route);return {id:owned.jobId,taskId:owned.taskId,status};},owned);
 assert.equal(calls.length,['queued','running'].includes(status)?2:1);assert.ok(calls.every(r=>r.startsWith('/api/jobs/own-job')));
 }
 let calls=0;await assert.rejects(cancelOwned(async()=>{calls++;return {id:owned.jobId,taskId:'someone-else',status:'running'};},owned));assert.equal(calls,1);
});
