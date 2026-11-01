import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,cp,rm,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {updateRuntime} from '../update-runtime.mjs';
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'local lab update '));t.after(()=>rm(root,{recursive:true,force:true}));
 const runtime=path.join(root,'Runtime'),bundle=path.join(root,'bundle'),source=path.join(root,'local-ai-lab');
 for(const p of [runtime,bundle,source])await mkdir(p);
 for(const p of ['.local-lab/installer','.local-lab/models','.durable-actors','node_modules','web/node_modules'])await mkdir(path.join(runtime,p),{recursive:true});
 for(const p of ['web/scripts','installer/macos'])await mkdir(path.join(source,p),{recursive:true});
 for(const f of ['package-lock.json','web/package-lock.json','installer/runtime-pins.json']){await mkdir(path.dirname(path.join(runtime,f)),{recursive:true});await writeFile(path.join(runtime,f),f.endsWith('package-lock.json')?JSON.stringify({version:'0.6.0.0',packages:{'':{version:'0.6.0.0'}}}):'{}');await writeFile(path.join(source,f),f.endsWith('package-lock.json')?JSON.stringify({version:'0.7.0.0',packages:{'':{version:'0.7.0.0'}}}):'{}');}
 await writeFile(path.join(runtime,'.local-lab/installer/release-manifest.json'),'{"old":true}');
 await writeFile(path.join(runtime,'.local-lab/models/weight'),'keep weights');await writeFile(path.join(runtime,'.durable-actors/saved'),'saved task');await writeFile(path.join(runtime,'personal.csv'),'unknown user file');
 await writeFile(path.join(source,'server.mjs'),'// new source');await writeFile(path.join(source,'web/scripts/build.mjs'),"import {mkdir,writeFile} from 'node:fs/promises';await mkdir('web/dist',{recursive:true});await writeFile('web/dist/index.html','new UI');");
 await mkdir(path.join(bundle,'installer/macos'),{recursive:true});await cp(new URL('../macos/common.sh',import.meta.url),path.join(bundle,'installer/macos/common.sh'));
 for(const f of ['Start.command','Stop.command'])await writeFile(path.join(bundle,f),'#!/bin/bash\n');
 execFileSync('/usr/bin/tar',['-czf',path.join(bundle,'source.tar.gz'),'-C',root,'local-ai-lab']);
 const sha=createHash('sha256').update(await readFile(path.join(bundle,'source.tar.gz'))).digest('hex');
 await writeFile(path.join(bundle,'release-manifest.json'),JSON.stringify({schemaVersion:1,source:{commit:'a'.repeat(40),sha256:sha}}));
 return {runtime,bundle};
}
test('source update preserves tasks/weights and previous source without accounts or downloads',async t=>{
 const f=await fixture(t),result=await updateRuntime(f);
 assert.equal(await readFile(path.join(f.runtime,'.durable-actors/saved'),'utf8'),'saved task');assert.equal(await readFile(path.join(f.runtime,'.local-lab/models/weight'),'utf8'),'keep weights');
 assert.equal(await readFile(path.join(f.runtime,'web/dist/index.html'),'utf8'),'new UI');assert.equal(await readFile(path.join(result.backup,'personal.csv'),'utf8'),'unknown user file');
 assert.equal(JSON.parse(await readFile(path.join(f.runtime,'.local-lab/installer/release-manifest.json'))).source.commit,'a'.repeat(40));
});
test('failure or cancellation after data transfer rolls back the original installation',async t=>{
 for(const cancelled of [false,true]){
 const f=await fixture(t),c=new AbortController();
 await assert.rejects(updateRuntime(f,{signal:c.signal,afterTransfer:async()=>{if(cancelled)c.abort(Error('cancelled'));else throw Error('injected failure');}}),cancelled?/cancelled/:/injected/);
 assert.equal(await readFile(path.join(f.runtime,'.durable-actors/saved'),'utf8'),'saved task');assert.equal(await readFile(path.join(f.runtime,'.local-lab/installer/release-manifest.json'),'utf8'),'{"old":true}');
 }
});
test('invalid source or changed dependencies never modify the installed data',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.bundle,'source.tar.gz'),'corrupt');await assert.rejects(updateRuntime(f),/hash mismatch/);
 assert.equal(await readFile(path.join(f.runtime,'.local-lab/models/weight'),'utf8'),'keep weights');
 const g=await fixture(t);await writeFile(path.join(g.runtime,'package-lock.json'),'changed');await assert.rejects(updateRuntime(g),/full installation/);assert.equal(await readFile(path.join(g.runtime,'.durable-actors/saved'),'utf8'),'saved task');
});

test('CLI updater executes through a symlink/resource path',async t=>{
 const f=await fixture(t),link=path.join(path.dirname(f.runtime),'update-entry.mjs');
 await symlink(new URL('../update-runtime.mjs',import.meta.url),link);
 execFileSync(process.execPath,[link,'--runtime',f.runtime,'--bundle',f.bundle],{stdio:'pipe'});
 assert.equal(JSON.parse(await readFile(path.join(f.runtime,'.local-lab/installer/release-manifest.json'))).source.commit,'a'.repeat(40));
});
