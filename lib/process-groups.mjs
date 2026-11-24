const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function exists(pgid){if(!Number.isInteger(pgid)||pgid<2)throw Error('Invalid task-owned process group');try{process.kill(-pgid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
export function signalOwnedProcessGroup(pgid,signal){if(!Number.isInteger(pgid)||pgid<2)throw Error('Invalid task-owned process group');try{process.kill(-pgid,signal);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function wait(pgid,timeout){const end=Date.now()+timeout;while(exists(pgid)&&Date.now()<end)await delay(Math.min(25,Math.max(1,end-Date.now())));return !exists(pgid);}
export async function terminateOwnedProcessGroup(pgid,{termGraceMs=200,killGraceMs=2000}={}){
  if(!Number.isInteger(termGraceMs)||termGraceMs<0||!Number.isInteger(killGraceMs)||killGraceMs<1)throw Error('Invalid process cleanup timing');
  if(!exists(pgid))return {confirmedGone:true,termSent:false,killSent:false};
  const termSent=signalOwnedProcessGroup(pgid,'SIGTERM');if(await wait(pgid,termGraceMs))return {confirmedGone:true,termSent,killSent:false};
  const killSent=signalOwnedProcessGroup(pgid,'SIGKILL');return {confirmedGone:await wait(pgid,killGraceMs),termSent,killSent};
}
