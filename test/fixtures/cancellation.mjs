import { mock } from 'node:test';
import assert from 'node:assert/strict';
const records = {};
const queued = [];
const cancelled = [];
mock.module('../../lib/actors.mjs', { namedExports: {
  state: async () => structuredClone(records),
  save: async (key, value) => { records[key] = structuredClone(value); },
  device: {
    cancel: async id => cancelled.push(id),
    enqueue: async value => queued.push(JSON.parse(value)),
  },
}});
mock.module('../../lib/data.mjs', { namedExports: {
  dashboard: async () => ({}), validateDefinition: () => {},
}});
mock.module('../../lib/relay.mjs', { namedExports: {
  connectRelay: async () => {}, requestWork: async () => {},
  completed: async () => {}, relayStatus: { ready: true },
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
