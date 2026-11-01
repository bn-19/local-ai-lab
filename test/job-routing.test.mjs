import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchQueuedJob} from '../lib/job-routing.mjs';
import {relayEnabled,relayStatus,connectRelay} from '../lib/relay.mjs';
function fixture(job,relayReady=false){
 let saved=structuredClone(job);const queue=[],sent=[];
 return {queue,sent,get saved(){return saved;},set saved(v){saved=v;},deps:{
  read:async()=>structuredClone(saved),persist:async v=>{saved=structuredClone(v);},
  routeLocal:async v=>{if(saved.status==='queued')saved={...saved,...v,viaRelay:false,transport:'local-durable',stage:'Queued locally'};return structuredClone(saved);},
  enqueueLocal:async v=>queue.push(JSON.parse(v)),sendRelay:async j=>{sent.push(j);return 'receipt';},relayReady,
 }};
}
test('default mode is local; disabled Relay never connects',async()=>{
 assert.equal(relayEnabled({}),false);assert.equal(relayEnabled({LOCAL_LAB_RELAY_ENABLED:'0'}),false);assert.equal(relayEnabled({LOCAL_LAB_RELAY_ENABLED:'1'}),true);
 assert.equal(relayStatus.enabled,false);await connectRelay(()=>{throw Error('must not run');});assert.equal(relayStatus.ready,false);assert.equal(relayStatus.error,undefined);
});
test('new local jobs and recovered Relay jobs use the same durable ID without cloud calls',async()=>{
 for(const viaRelay of [false,true]){
  const f=fixture({id:'stable',status:'queued',viaRelay});
  await dispatchQueuedJob(f.saved,f.deps);
  assert.equal(f.queue.length,1);assert.equal(f.queue[0].id,'stable');assert.equal(f.queue[0].viaRelay,false);assert.equal(f.sent.length,0);
 }
});
test('explicit healthy Relay uses real receipt; outage falls back without failing the job',async()=>{
 const f=fixture({id:'stable',status:'queued',viaRelay:true},true);
 await dispatchQueuedJob(f.saved,f.deps);assert.equal(f.sent.length,1);assert.equal(f.queue.length,0);assert.equal(f.saved.requestMessageId,'receipt');
 f.deps.sendRelay=async()=>{throw Error('offline');};await dispatchQueuedJob(f.saved,f.deps);
 assert.equal(f.queue.length,1);assert.equal(f.saved.viaRelay,false);assert.equal(f.saved.status,'queued');assert.match(f.saved.routingReason,/queued locally/);
});
test('cancelled or completed work is never re-enqueued by recovery or failed optional send',async()=>{
 for(const status of ['cancelled','ready','running']){const f=fixture({id:'stable',status,viaRelay:true});await dispatchQueuedJob(f.saved,f.deps);assert.equal(f.queue.length,0);}
 const f=fixture({id:'stable',status:'queued',viaRelay:true},true);
 f.deps.sendRelay=async()=>{f.saved={...f.saved,status:'cancelled'};throw Error('interrupted');};
 await dispatchQueuedJob(f.saved,f.deps);assert.equal(f.queue.length,0);assert.equal(f.saved.status,'cancelled');
});
