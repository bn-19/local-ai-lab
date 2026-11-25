import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';import os from 'node:os';import path from 'node:path';
import {verifiedDownload} from '../lib/verified-download.mjs';
import {trainingRuntimeSpec,managedRuntimeStatus,trainingPython,validatePythonLayout,isolatedPythonEnv,bootstrapTrainingRuntime} from '../lib/managed-python.mjs';
const pinFor=bytes=>({url:'https://files.pythonhosted.org/packages/test/fixture.whl',sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length});

test('cold managed setup pins complete wheel-only closure and never probes legacy/global Python',async()=>{
 const before=process.cwd(),root=await mkdtemp(path.join(os.tmpdir(),'local-lab-python-test-'));
 try{
  process.chdir(root);const spec=await trainingRuntimeSpec();
  assert.equal(spec.python.version,'3.12.16');assert.equal(spec.wheels.packages.length,46);assert.equal(spec.downloadBytes,156084339);
  assert.ok(spec.wheels.packages.every(p=>p.filename.endsWith('.whl')&&!p.filename.includes('macosx_26')));
  await mkdir('.venv/bin',{recursive:true});await writeFile('.venv/bin/python','#!/bin/sh\ntouch legacy-used\n',{mode:0o700});
  await assert.rejects(trainingPython(),/Download the local learning setup/);assert.equal((await managedRuntimeStatus()).ready,false);
  await assert.rejects(readFile('legacy-used'),{code:'ENOENT'});
  // Never adopt or overwrite an unmarked directory merely because its name matches a pin.
  await mkdir(spec.root,{recursive:true});await writeFile(path.join(spec.root,'user-file'),'preserve');
  await assert.rejects(bootstrapTrainingRuntime(new AbortController().signal,async()=>{}),/ownership record is missing/);
  assert.equal(await readFile(path.join(spec.root,'user-file'),'utf8'),'preserve');
 }finally{process.chdir(before);await rm(root,{recursive:true,force:true});}
});

test('download cancellation removes only partial bytes; retry, verified reuse and corruption are explicit',async()=>{
 const before=process.cwd(),root=await mkdtemp(path.join(os.tmpdir(),'local-lab-download-test-'));
 try{
  process.chdir(root);const bytes=Buffer.from('verified-fixture'),pin=pinFor(bytes),controller=new AbortController();let calls=0;
  await assert.rejects(verifiedDownload(pin,'.local-lab/downloads/fixture.whl',{signal:controller.signal,fetcher:async()=>new Response(new ReadableStream({start(stream){stream.enqueue(bytes.subarray(0,4));controller.abort(Error('cancel fixture'));stream.error(controller.signal.reason);}}))}),/cancel fixture/);
  assert.deepEqual(await readdir('.local-lab/downloads'),[]);
  const result=await verifiedDownload(pin,'.local-lab/downloads/fixture.whl',{fetcher:async()=>{calls++;return new Response(bytes);}});assert.equal(result.downloadedBytes,bytes.length);
  const cached=await verifiedDownload(pin,'.local-lab/downloads/fixture.whl',{fetcher:async()=>assert.fail('cached bytes must not redownload')});assert.equal(cached.cacheReused,true);assert.equal(calls,1);
  await writeFile('.local-lab/downloads/fixture.whl','corrupt');
  await assert.rejects(verifiedDownload(pin,'.local-lab/downloads/fixture.whl',{fetcher:async()=>assert.fail('corrupt cache must fail before execution')}),/failed verification/);
  await writeFile('outside','preserve');await symlink(path.join(root,'outside'),'.local-lab/downloads/link.whl');
  await assert.rejects(verifiedDownload(pin,'.local-lab/downloads/link.whl'),/regular setup artifact/);assert.equal(await readFile('outside','utf8'),'preserve');
 }finally{process.chdir(before);await rm(root,{recursive:true,force:true});}
});

test('Python extraction only accepts reviewed in-tree links and isolated environment removes user Python overrides',()=>{
 validatePythonLayout('python/bin/python3.12\npython/bin/python3\n','-rw-r--r-- 0 root root 1 date python/bin/python3.12\nlrwxrwxrwx 0 root root 0 date python/bin/python3 -> python3.12\n');
 assert.throws(()=>validatePythonLayout('python/bin/python3.12\npython/../../outside\n',''),/Unsafe/);
 assert.throws(()=>validatePythonLayout('python/bin/python3.12\npython/bin/python3\n','-rw date python/bin/python3.12\nlrwx date python/bin/python3 -> /usr/bin/python3\n'),/Unsafe Python archive link/);
 const env=isolatedPythonEnv({PYTHONPATH:'/untrusted',PYTHONHOME:'/global',VIRTUAL_ENV:'/old',__PYVENV_LAUNCHER__:'/global'});
 for(const key of ['PYTHONPATH','PYTHONHOME','VIRTUAL_ENV','__PYVENV_LAUNCHER__'])assert.equal(env[key],undefined);
 assert.equal(env.PIP_CONFIG_FILE,'/dev/null');
});
