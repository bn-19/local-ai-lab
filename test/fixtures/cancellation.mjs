import { mock } from 'node:test';
import assert from 'node:assert/strict';
const records = {};
const queued = [];
const cancelled = [];
mock.module('../../lib/actors.mjs', { namedExports: {
  project: {},
  state: async () => structuredClone(records),
  save: async (key, value) => { records[key] = structuredClone(value); },
  device: {
    cancel: async id => cancelled.push(id),
    enqueue: async value => queued.push(JSON.parse(value)),
  },
}});
mock.module('../../lib/data.mjs', { namedExports: {
  dashboard: async () => ({}), liveReport: async () => ({}), candyReport: async () => ({}), validateDefinition: () => {},
}});
mock.module('../../lib/relay.mjs', { namedExports: {
  connectRelay: async () => {}, requestWork: async () => {},
  completed: async () => {}, agentHandoff: async () => {}, receiveHandoff: async () => null, relayStatus: { ready: true },
}});
const { cancelJob, evaluate } = await import('../../lib/jobs.mjs');
for (const kind of ['evalcase', 'optimize']) {
  records['task:task'] = { id: 'task' };
  records['evaluation:task'] = { stage: 'baseline', baseline: [{ passed: true }], tuned: [] };
  records['job:pending'] = { id: 'pending', taskId: 'task', kind, status: 'queued' };
  await assert.rejects(evaluate('task'), /already in progress/);
  await cancelJob('pending');
  assert.equal(records['job:pending'].status, 'cancelled');
  assert.equal(records['evaluation:task'].stage, 'cancelled');
  assert.deepEqual(records['evaluation:task'].baseline, [{ passed: true }]);
  const retried = await evaluate('task');
  assert.equal(retried.kind, 'evalcase');
  assert.equal(queued.at(-1).id, retried.id);
  assert.equal(records['evaluation:task'].stage, 'baseline');
  await cancelJob('pending');
  assert.equal(records['evaluation:task'].stage, 'baseline', 'repeated cancellation cannot cancel a retry');
}
records['job:finished'] = { id: 'finished', taskId: 'task', kind: 'evalcase', status: 'ready' };
const before = cancelled.length;
await cancelJob('finished');
assert.equal(cancelled.length, before);
assert.equal(records['job:finished'].status, 'ready');
await assert.rejects(cancelJob('missing'), /Job not found/);
console.log('Queued evaluation cancellation and retry passed');
// A newer candy adapter must never replace a retail adapter, or vice versa.
const { requestReport } = await import('../../lib/jobs.mjs');
records['dataset:retail']={columns:['InvoiceNo','StockCode','Quantity','UnitPrice'].map(name=>({name,type:['Quantity','UnitPrice'].includes(name)?'DOUBLE':'VARCHAR'}))};
records['dataset:candy']={columns:['competitorname','winpercent','sugarpercent','pricepercent','chocolate','fruity'].map(name=>({name,type:'DOUBLE'}))};
records['task:retail']={id:'retail',datasetId:'retail'};
records['task:candy']={id:'candy',datasetId:'candy'};
records['fineTune:retail-trained']={selected:'adapter'};
records['fineTune:candy-trained']={selected:'adapter',profile:'candy'};
assert.equal((await requestReport('retail',{request:'Revenue?'})).payload.adapterJobId,'retail-trained');
assert.equal((await requestReport('candy',{request:'Most popular candies?'})).payload.adapterJobId,'candy-trained');
await assert.rejects(requestReport('candy',{request:'Popular?',adapterJobId:'retail-trained'}),/successful adapter/);
records['task:coder']={id:'coder',model:{id:'qwen2.5-coder:1.5b'}};
await assert.rejects(requestReport('coder',{request:'Most popular candies?'}),/another selected base/);
const {fineTune}=await import('../../lib/jobs.mjs');
await assert.rejects(fineTune('coder'),/unavailable/);
records['task:photo-task']={id:'photo-task',kind:'vision',status:'queued'};
records['job:photo-pending']={id:'photo-pending',taskId:'photo-task',kind:'vision',status:'queued'};
await cancelJob('photo-pending');
assert.equal(records['task:photo-task'].status,'cancelled');
assert.equal(records['job:photo-pending'].status,'cancelled');
