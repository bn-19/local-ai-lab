import {spawn} from 'node:child_process';
// Resolve/reject only after close: callers retain the Device reservation until exit.
export async function runLocalProcess(command,args,{signal,timeout=120000,maxBuffer=1024*1024,env=process.env,killDelay=2000}={}) {
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
  child.on('close',code=>{
   clearTimeout(deadline);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);
   if(failure)kill('SIGKILL');
   if(failure)reject(failure);else if(code!==0)reject(Error(`Local process failed (${code}): ${tail}`));else resolve();
  });
 });
}
