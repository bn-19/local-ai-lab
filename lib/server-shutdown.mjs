// Signal delivery can reach both a wrapper and its child; repeated signals share one drain.
export function installShutdownHandlers(server,drain,{signals=process,exit=code=>process.exit(code),report=error=>console.error('Local shutdown failed:',error.message)}={}){
 let shutdown;
 const stop=()=>shutdown??=(async()=>{
   const closed=new Promise(resolve=>server.close(resolve));
   await drain();server.closeAllConnections();await closed;
   exit(0);
 })().catch(error=>{report(error);exit(1);});
 for(const sig of ['SIGTERM','SIGINT'])signals.on(sig,stop);
 return stop;
}
