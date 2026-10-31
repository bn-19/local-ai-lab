import test from 'node:test';
import assert from 'node:assert/strict';
import {monitorView,relayView,actorsView} from '../src/activity-state.js';
test('relay view lists what crossed Relay with recorded delivery state only',()=>{
 const state={relay:{ready:true,agents:['planner','evaluator']},
  jobs:[{id:'a'.repeat(36),kind:'tune-propose',viaRelay:true,status:'ready',createdAt:1000,finishedAt:5000,requestMessageId:'m1',receivedMessageId:'r1',completionMessageId:'m2',payload:{tuningId:'t',scores:[{round:0,development_accuracy:0.745}]}},
        {id:'b'.repeat(36),kind:'plan',viaRelay:true,status:'failed',createdAt:2000,error:'Run npm run setup:relay'},
        {id:'c'.repeat(36),kind:'plan',viaRelay:false,status:'ready',createdAt:2500}],
  loops:[{id:'l',taskId:'t',events:[{kind:'handoff',role:'planner',to:'evaluator',phase:'audit',messageId:'h1',at:3000,transport:'relay'},{kind:'receipt',messageId:'h1',at:3100}]}]};
 const v=relayView(state);
 assert.equal(v.messages.length,4);
 assert.deepEqual(v.messages.map(m=>m.delivery),['received','not sent','received','awaiting receipt']);
 assert.deepEqual(v.messages.map(m=>m.from+'→'+m.to),['Planner→Evaluator','Planner→Evaluator','Planner→Evaluator','Evaluator→Planner']);
 assert.match(v.messages[0].crosses.join(' '),/74\.5%/);
 assert.deepEqual(v.counts,{sent:3,received:2,failed:1});
 assert.equal(relayView({}).ready,false);
});
test('actors view reads the device reservation and project records from saved state',()=>{
 const state={device:{queue:[{id:'q',kind:'plan',createdAt:9000,viaRelay:true}],active:{id:'j',kind:'tune-round',attempt:'att12345',executor:'ex',startedAt:5000,cancel:false},history:[{id:'h',kind:'plan',status:'ready',startedAt:0,finishedAt:1500}],alarms:0},
  jobs:[{id:'j',kind:'tune-round',stage:'Executor · training round 2'}],projectKeys:{job:3,task:1},tasks:[{id:'t',request:'x',status:'ready',completedAt:100}],tunings:[],saved:[],loops:[]};
 const v=actorsView(state,10000);
 assert.equal(v.device.active.stage,'Executor · training round 2');assert.equal(v.device.active.runningFor,5);
 assert.equal(v.device.queue[0].waitingFor,1);assert.equal(v.device.queue[0].viaRelay,true);assert.equal(v.device.history[0].durationS,1.5);
 assert.deepEqual(v.project.counts,[['job',3],['task',1]]);assert.equal(v.project.recent[0].kind,'task');
 assert.equal(actorsView({}).device.active,null);assert.equal(actorsView({}).device.alarms,null);
});
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
