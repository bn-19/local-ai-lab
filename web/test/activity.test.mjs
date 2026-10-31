import test from 'node:test';
import assert from 'node:assert/strict';
import { activityView } from '../src/activity-state.js';
import { LocalAPI, observeLocalActivity, selectActivityTask } from '../src/api.js';
const response = data => new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}});
const flush = () => new Promise(resolve => setImmediate(resolve));
test('selected task excludes unrelated running jobs and retains completed evidence', () => {
  const state={jobs:[{id:'one',taskId:'a',status:'ready',createdAt:1,startedAt:2,finishedAt:1002},{id:'two',taskId:'b',status:'running',createdAt:3}]};
  const view=activityView(state,'a');
  assert.equal(view.jobId,'one');assert.equal(view.status,'completed');
  assert.ok(!JSON.stringify(view.rows).includes('two'));
  assert.match(view.device,/1 running/);
  assert.deepEqual(activityView(JSON.parse(JSON.stringify(state)),'a'),view);
  assert.equal(activityView(state).rows.length,0);
  assert.equal(activityView(state,'missing').rows.length,0);
});
test('send is never receipt, including completed work with failed transport',()=>{
  const job={id:'j',taskId:'t',status:'ready',viaRelay:true,requestMessageId:'send'};
  const view=activityView({jobs:[job]},'t');
  assert.ok(view.rows.some(r=>r.summary==='Request sent'));
  assert.ok(!view.rows.some(r=>r.summary==='Request received'));
  assert.equal(view.rows.find(r=>r.summary==='No recipient receipt recorded').status,'failed');
  const received=activityView({jobs:[{...job,receivedMessageId:'receipt',completionReceivedId:'ack'}]},'t');
  assert.ok(received.rows.some(r=>r.summary==='Result received'));
});
test('optional role evidence is scoped and receipts correlate transport and recipient',()=>{
  const events=[{role:'planner',kind:'handoff',to:'evaluator',messageId:'m',transport:'local-durable',summary:'Sent locally',at:10},{role:'evaluator',kind:'receipt',from:'planner',messageId:'m',transport:'local-durable',at:11}];
  const state={loops:[{id:'l',taskId:'t',events},{id:'other',taskId:'x',events:[{summary:'PRIVATE'}]}]};
  let view=activityView(state,'t');
  assert.equal(view.rows.at(-1).summary,'Handoff received');
  assert.ok(JSON.stringify(view.rows).includes('local-durable'));
  assert.ok(!JSON.stringify(view).includes('PRIVATE'));
  events[1].transport='relay';view=activityView(state,'t');
  assert.match(view.rows.at(-1).summary,/matching handoff unavailable/);
});
test('persisted events deduplicate and missing optional data does not invent roles',()=>{
  const event={id:'event',actor:'System',summary:'Reading section 2 of 4',status:'running',at:10};
  const state={jobs:[{id:'j',taskId:'t',status:'running',events:[event,event]}]};
  const first=activityView(state,'t');
  assert.equal(first.rows.length,1);
  assert.deepEqual(activityView(state,'t'),first);
  assert.ok(!JSON.stringify(first).match(/Planner|Evaluator|Trainer/));
  for(const value of ['failed','cancelled','interrupted','queued']){
    const view=activityView({jobs:[{id:'j',taskId:'t',status:value,error:'PRIVATE document text'}]},'t');
    assert.equal(view.status,value==='interrupted'?'failed':value);
    assert.ok(!JSON.stringify(view).includes('PRIVATE'));
  }
});
test('selection and measured identity are evidence, not fabricated evaluation',()=>{
  const view=activityView({tasks:[{id:'t',model:{id:'qwen',digest:'hash',runtime:'ollama'},selection:{catalogVersion:'v1',reasons:['Fits 32 GB'],events:[{summary:'Checked hardware',status:'completed',at:1}]}}]},'t');
  assert.ok(view.evidence.some(([k,v])=>k==='Model'&&v==='qwen'));
  assert.ok(view.evidence.some(([k,v])=>k==='Catalog'&&v==='Built-in catalog'));
  assert.equal(view.rows.length,1);assert.equal(view.rows[0].agent,'System');
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
    assert.equal(calls,2);assert.equal(events.at(-1).type,'connected');
    api.disconnect();resolveState(response({jobs:[{id:'private-job',status:'ready'}]}));await flush();
    assert.deepEqual(events.map(e=>e.type),['selection','connected','disconnected']);assert.ok(!JSON.stringify(events).includes('private-test-token'));
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

test('running selected job takes precedence over a newer queued attempt',()=>{
  const view=activityView({jobs:[{id:'running',taskId:'t',status:'running',createdAt:1},{id:'queued',taskId:'t',status:'queued',createdAt:2}]},'t');
  assert.equal(view.jobId,'running');assert.equal(view.status,'active');
});
test('transport failure never asserts successful fallback',()=>{
  const view=activityView({loops:[{id:'l',taskId:'t',events:[{kind:'transport_failure',role:'System',summary:'raw error PRIVATE',at:2}]}]},'t');
  assert.equal(view.rows[0].summary,'Relay unavailable; no fallback receipt implied');
  assert.ok(!JSON.stringify(view).includes('PRIVATE'));
});

test('measured runtime requires saved start and finish; no timer estimates',()=>{
  const job={id:'j',taskId:'t',status:'ready',startedAt:1000,finishedAt:3500};
  assert.ok(activityView({jobs:[job]},'t').evidence.some(([k,v])=>k==='Measured runtime'&&v==='2.5 s'));
  delete job.finishedAt;
  assert.ok(!activityView({jobs:[job]},'t').evidence.some(([k])=>k==='Measured runtime'));
});
test('training start does not inherit a later loop failure or completion',()=>{
  for(const [saved,shown] of [['running','active'],['complete','active'],['cancelled','active'],['failed','active']]){
    const view=activityView({loops:[{id:'l',taskId:'t',status:saved,events:[{kind:'training',role:'Trainer',summary:'Training one candidate',at:1}]}]},'t');
    assert.equal(view.rows[0].status,shown);
  }
});
test('late observer receives selected task without polling or submitting work',()=>{
  selectActivityTask('selected');const events=[];
  const unsubscribe=observeLocalActivity(event=>events.push(event));
  try{assert.deepEqual(events,[{type:'selection',taskId:'selected'}]);}finally{unsubscribe();selectActivityTask(null);}
});

test('shared catalog label requires saved successful read evidence',()=>{
  const source={kind:'supabase',version:'shared-v1'};
  const state={tasks:[{id:'t',selection:{catalogSource:source}}]};
  assert.equal(activityView(state,'t').evidence[0][1],'Built-in catalog');
  source.status='synced';source.checkedAt=1000;
  assert.equal(activityView(state,'t').evidence[0][1],'Shared catalog (saved successful read)');
  source.kind='built-in';assert.equal(activityView(state,'t').evidence[0][1],'Built-in catalog');
});
