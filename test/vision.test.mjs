import test from 'node:test';
import assert from 'node:assert/strict';
import {imageType,visionAction,visionModel} from '../lib/vision-policy.mjs';
test('photo boundary rejects markup, short files and oversized payloads before storage',()=>{
 assert.throws(()=>imageType(Buffer.from('<svg onload="bad"></svg>')),/JPEG or PNG/);
 assert.throws(()=>imageType(Buffer.alloc(10)),/empty or invalid/);
 assert.throws(()=>imageType(Buffer.alloc(8*1024*1024+1)),/8 MB/);
 const png=Buffer.alloc(20);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);assert.equal(imageType(png),'image/png');
 const jpeg=Buffer.alloc(20);Buffer.from([255,216,255]).copy(jpeg);assert.equal(imageType(jpeg),'image/jpeg');
});
test('vision dispatch permits fixed capabilities only and pins independent base model',()=>{
 for(const action of ['install','evaluate','predict'])assert.equal(visionAction(action),action);
 for(const action of ['shell','train-anything','../../file',null,{}])assert.throws(()=>visionAction(action),/Unsupported/);
 assert.match(visionModel.revision,/^[a-f0-9]{40}$/);assert.match(visionModel.sha256,/^[a-f0-9]{64}$/);
});
test('cancelled evaluation output cannot replace the durable selected recipe',async()=>{
 const {spawnSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks',fileURLToPath(new URL('./fixtures/vision-commit.mjs',import.meta.url))],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr+result.stdout);
});
