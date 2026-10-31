import {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const original=process.cwd(),tmp=await mkdtemp(path.join(os.tmpdir(),'vision-fence-'));process.chdir(tmp);
const records={'vision:evaluation':{model:{selected:'old'}}};let controller,abortAtExit=true;
mock.module('../../lib/actors.mjs',{namedExports:{state:async()=>structuredClone(records),save:async(k,v)=>{records[k]=structuredClone(v);}}});
mock.module('../../lib/health.mjs',{namedExports:{health:async()=>({machine:{freeDiskGB:100}})}});
mock.module('../../lib/local-process.mjs',{namedExports:{runLocalProcess:async(command,args)=>{await writeFile(args[3],JSON.stringify({model:{selected:'new'},decision:'candidate measured'}));if(abortAtExit)controller.abort();}}});
try{
 const {runVision,visionRoot}=await import('../../lib/vision.mjs');const {visionModel}=await import('../../lib/vision-policy.mjs');await mkdir(visionRoot,{recursive:true});await writeFile(path.join(visionRoot,'installed.json'),JSON.stringify({revision:visionModel.revision}));await writeFile(path.join(visionRoot,'dataset.json'),'{}');
 controller=new AbortController();await assert.rejects(()=>runVision({id:'cancelled',payload:{action:'evaluate'}},controller.signal,async()=>{}));assert.equal(records['vision:evaluation'].model.selected,'old','cancelled worker output never becomes selected');
 abortAtExit=false;controller=new AbortController();await runVision({id:'success',payload:{action:'evaluate'}},controller.signal,async()=>{});assert.equal(records['vision:evaluation'].model.selected,'new');assert.equal(records['vision:evaluation'].jobId,'success');
 console.log('Actor selection commits only after successful uncancelled worker exit');
}finally{process.chdir(original);await rm(tmp,{recursive:true,force:true});}
