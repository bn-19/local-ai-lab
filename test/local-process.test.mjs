import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {runLocalProcess} from '../lib/local-process.mjs';
test('cancellation retains the caller reservation until a TERM-resistant worker exits',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'local-lab-process-'));const ready=path.join(dir,'ready');
 const controller=new AbortController();let settled=false,pid;
 const work=runLocalProcess(process.execPath,['-e',"process.on('SIGTERM',()=>{});require('fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",ready],{signal:controller.signal,timeout:5000,killDelay:150}).finally(()=>{settled=true;});
 const result=work.then(()=>null,error=>error);
 try{
  for(let i=0;i<200;i++){try{pid=Number(await readFile(ready,'utf8'));break;}catch{await delay(10);}}
  assert.ok(pid,'worker started');controller.abort(Error('cancel requested'));
  await delay(40);assert.equal(settled,false,'caller must retain reservation while worker still exists');process.kill(pid,0);
  assert.match((await result).message,/cancel requested/);
  assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
 }finally{controller.abort();await result;await rm(dir,{recursive:true,force:true});}
});
test('missing executable and pre-cancelled request settle without starting work',async()=>{
 await assert.rejects(runLocalProcess('/nonexistent/local-lab-worker',[]),{code:'ENOENT'});
 const controller=new AbortController();controller.abort(Error('already cancelled'));
 await assert.rejects(runLocalProcess(process.execPath,['-e','process.exit(0)'],{signal:controller.signal}),/already cancelled/);
});
