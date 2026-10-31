import test from 'node:test';
import assert from 'node:assert/strict';
import { activityView } from '../src/activity-state.js';
import { LocalAPI, observeLocalActivity } from '../src/api.js';
const response = data => new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}});
const flush = () => new Promise(resolve => setImmediate(resolve));
test('handoff labels require actual receipts and failed delivery never becomes completion', () => {
  const waiting=activityView({jobs:[{id:'1',viaRelay:true,status:'queued',requestMessageId:'req',stage:'Waiting for Relay delivery'}]});
  assert.deepEqual(waiting.rows.slice(0,2),[{agent:'Planner',status:'Request sent'},{agent:'Evaluator',status:'Waiting for delivery'}]);
  assert.ok(!waiting.rows.some(r=>r.status==='Result received'));
  const failed=activityView({jobs:[{id:'1',viaRelay:true,status:'failed',error:'Delivery timed out'}]});
  assert.equal(failed.rows[1].status,'No delivery confirmed');assert.equal(failed.error,'Delivery timed out');
  const done=activityView({jobs:[{id:'1',viaRelay:true,status:'ready',completionMessageId:'done',completionReceivedId:'ack'}]});
  assert.equal(done.rows.at(-1).status,'Result received');assert.ok(done.evidence.some(row=>row[1]==='ack'));
});
test('running job takes precedence over newer completed job; local-only jobs do not fabricate Relay', () => {
  const view=activityView({jobs:[{id:'old',createdAt:1,kind:'evalcase',status:'running',stage:'Running local model'},{id:'new',createdAt:2,status:'ready'}]});
  assert.equal(view.jobId,'old');assert.deepEqual(view.rows,[{agent:'Local model',status:'Running local model'}]);
});
test('activity publishes real state after pairing and discards in-flight results after disconnect',async()=>{
  const events=[];let resolveState;let calls=0;
  const unsubscribe=observeLocalActivity(event=>events.push(event));
  const api=new LocalAPI({origin:'https://site.example',fetcher:async url=>{
    calls++;
    if(url.endsWith('/api/health'))return response({machine:{},runtimes:{}});
    return new Promise(resolve=>{resolveState=resolve;});
  }});
  try {
    assert.equal(calls,0);await api.pair('private-test-token');await flush();
    assert.equal(calls,2);assert.equal(events[0].type,'connected');
    api.disconnect();resolveState(response({jobs:[{id:'private-job',status:'ready'}]}));await flush();
    assert.deepEqual(events.map(e=>e.type),['connected','disconnected']);assert.ok(!JSON.stringify(events).includes('private-test-token'));
  }finally{unsubscribe();api.disconnect();}
});
test('polling advances real status and unsubscribing stops refresh',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let stateCalls=0;const events=[];
  const unsubscribe=observeLocalActivity(event=>events.push(event));
  const api=new LocalAPI({origin:'https://site.example',fetcher:async url=>url.endsWith('/api/health')?response({machine:{},runtimes:{}}):response({jobs:[{id:'j',status:++stateCalls===1?'running':'ready'}]})});
  try {
    await api.pair('token');await flush();assert.equal(events.at(-1).state.jobs[0].status,'running');
    t.mock.timers.tick(1000);await flush();assert.equal(events.at(-1).state.jobs[0].status,'ready');
    unsubscribe();const count=stateCalls;t.mock.timers.tick(20000);await flush();assert.equal(stateCalls,count);
  }finally{unsubscribe();api.disconnect();}
});
