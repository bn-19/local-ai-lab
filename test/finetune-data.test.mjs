import test from 'node:test';
import assert from 'node:assert/strict';
import {fineTuneData,trainingSystem} from '../lib/finetune-data.mjs';
import {calculateReport} from '../lib/reporting.mjs';
test('fine-tuning has disjoint question families and supported policy targets',()=>{
 const sets=fineTuneData();assert.equal(sets.train.length,102);assert.equal(sets.valid.length,17);assert.equal(sets.final.length,34);
 const all=Object.values(sets).flat();assert.equal(new Set(all.map(c=>c.request)).size,all.length);
 for(const c of all){assert.doesNotThrow(()=>calculateReport(c.expected));assert.ok(!trainingSystem.includes(c.request));}
 assert.ok(sets.final.some(c=>c.expected.returns==='exclude'&&c.expected.scope==='all'));
});
