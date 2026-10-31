import test from 'node:test';
import assert from 'node:assert/strict';
import {monitorView} from '../src/activity-state.js';
test('only confirmed completion fills circles; failed jobs never complete result',()=>{
 const view=monitorView({jobs:[{id:'j',kind:'document',status:'failed',startedAt:1000,finishedAt:4000}]},9000);
 assert.equal(view.steps.find(s=>s.label==='Local work').state,'stopped');
 assert.equal(view.steps.find(s=>s.label==='Result').state,'upcoming');
 assert.equal(view.elapsed,3);assert.equal(view.eta,null);
 const relay=monitorView({jobs:[{id:'j',status:'ready',viaRelay:true,receivedMessageId:'r'}]});
 assert.equal(relay.steps.at(-1).state,'active');
});
test('ETA requires three completed timed jobs of the same kind',()=>{
 const active={id:'active',kind:'document',status:'running',createdAt:100000,startedAt:100000};
 const history=[10,20,30].map((seconds,i)=>({id:String(i),kind:'document',status:'ready',startedAt:1000,finishedAt:1000+seconds*1000}));
 assert.equal(monitorView({jobs:[active,...history.slice(0,2)]},105000).eta,null);
 assert.deepEqual(monitorView({jobs:[active,...history]},105000).eta,{low:5,high:25,samples:3});
 assert.equal(monitorView({jobs:[{...active,status:'queued'},...history]},105000).eta,null);
});
test('cost uses measured input/output only for selected task and marks partial coverage',()=>{
 const jobs=[{id:'1',taskId:'t',status:'running',usage:{inputTokens:1000000,outputTokens:1000000}},{id:'2',taskId:'t',status:'ready'},{id:'3',taskId:'other',status:'ready',usage:{inputTokens:9000000,outputTokens:9000000}}];
 const view=monitorView({jobs});assert.equal(view.cost,2.25);assert.equal(view.covered,1);assert.equal(view.total,2);
 assert.equal(monitorView({jobs},Date.now(),{input:NaN,output:2}).cost,null);
 assert.equal(monitorView({jobs:[{id:'j',status:'running'}]}).cost,null);
});
