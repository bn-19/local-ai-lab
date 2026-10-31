import test from 'node:test';
import assert from 'node:assert/strict';
import {loopTrainingData,loopDevelopment} from '../lib/candy-loop-data.mjs';
import {selectCandidate} from '../lib/agent-loop.mjs';
import {candyTrainingData} from '../lib/candy.mjs';
test('loop uses a fresh final set isolated from development and training',()=>{const data=loopTrainingData();const exposed=new Set([...data.train,...data.valid,...loopDevelopment,...candyTrainingData().final].map(c=>c.request));assert.equal(data.final.length,33);for(const c of data.final)assert.ok(!exposed.has(c.request),c.request);});
test('promotion is strict and rejects impossible scores',()=>{assert.equal(selectCandidate(20,21,33),'candidate');assert.equal(selectCandidate(33,33,33),'current');assert.equal(selectCandidate(32,30,33),'current');assert.throws(()=>selectCandidate(30,34,33));});
