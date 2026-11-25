import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {readFile,unlink} from 'node:fs/promises';
import {terminateOwnedProcessGroup} from './process-groups.mjs';
// Resolve/reject only after close: callers retain the Device reservation until exit.
export async function runLocalProcess(command,args,{signal,timeout=120000,maxBuffer=1024*1024,env=process.env,killDelay=2000,marker}={}) {
 signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{detached:true,stdio:['ignore','pipe','pipe'],env});
  let failure=null,tail='',bytes=0,killTimer;
  const kill=sig=>{if(child.pid)try{process.kill(-child.pid,sig);}catch(error){if(error.code!=='ESRCH')failure??=error;}};
  const stop=error=>{if(failure)return;failure=error;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),killDelay);};
  const abort=()=>stop(signal.reason||Error('Local process cancelled'));
  const deadline=setTimeout(()=>stop(Error('Local process exceeded time limit')),timeout);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  const output=chunk=>{bytes+=chunk.length;tail=(tail+chunk.toString()).slice(-1500);if(bytes>maxBuffer)stop(Error('Local process output exceeded limit'));};
  child.stdout.on('data',output);child.stderr.on('data',output);
  child.on('error',error=>{failure??=error;});
  child.on('close',async code=>{
   clearTimeout(deadline);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);
   try{
    if(child.pid){const cleanup=await terminateOwnedProcessGroup(child.pid);if(!cleanup.confirmedGone)throw Error('Owned process group still exists');}
   }catch(error){reject(Object.assign(Error('Local process cleanup could not be confirmed: '+error.message),{code:'LOCAL_PROCESS_CLEANUP_UNCONFIRMED'}));return;}
   if(marker&&child.pid)try{const saved=JSON.parse(await readFile(marker.path,'utf8'));if(saved.pid===child.pid&&saved.jobId===marker.jobId)await unlink(marker.path);}catch(error){if(error.code!=='ENOENT'){reject(error);return;}}
   if(failure)reject(failure);else if(code!==0)reject(Error(`Local process failed (${code}): ${tail}`));else resolve();
  });
  if(marker&&child.pid)try{writeFileSync(marker.path,JSON.stringify({pid:child.pid,jobId:marker.jobId}),{mode:0o600});}catch(error){stop(error);}
 });
}
