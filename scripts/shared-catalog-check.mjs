// Reads public metadata only. Optional write probes cannot affect any rows:
// empty INSERT array and UPDATE/DELETE filters contradict the nonempty id CHECK.
import {sharedCatalog,catalogConnection} from '../lib/shared-catalog.mjs';
import {recommendModels} from '../lib/model-catalog.mjs';
const result=await sharedCatalog();
console.log(JSON.stringify({evidence:result.source.kind==='supabase'?'actual remote catalog read':'actual fallback; no verified remote catalog',source:result.source,models:result.catalog.map(({id,digest})=>({id,digest}))},null,2));
if(result.source.kind!=='supabase'){
 console.error('NOT LIVE: configure an existing project and public client key. Built-in fallback remains available.');
 process.exitCode=2;
}else{
 const recommendation=recommendModels({request:'Explain code',inputKind:'code'},{catalog:result.catalog,machine:{platform:'darwin',arch:'arm64',memoryGB:24,availableMemoryGB:16,freeDiskGB:50},runtimes:{ollama:{ready:false}}});
 console.log(JSON.stringify({evidence:'real cloud catalog + local fixture hardware selection; no inference',catalogSource:result.source,selectedId:recommendation.selected?.id}));
 if(process.argv.includes('--verify-write-denial')){
  const {url,headers}=catalogConnection();
  const endpoint=new URL(url);endpoint.search='';
  const missingKey=await fetch(endpoint,{method:'POST',body:'[]',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(2500)});
  await missingKey.body?.cancel();
  if(missingKey.status!==401)throw Error('Expected missing-key write rejection; got HTTP '+missingKey.status);
  for(const method of ['POST','PATCH','DELETE']){
   const target=new URL(endpoint);if(method!=='POST')target.search='id=eq.';
   const response=await fetch(target,{method,headers:{...headers,'Content-Type':'application/json'},body:method==='POST'?'[]':method==='PATCH'?'{"enabled":false}':undefined,redirect:'error',signal:AbortSignal.timeout(2500)});
   // Only bounded status evidence is printed; no server error payload or credential.
   await response.body?.cancel();
   if(![401,403].includes(response.status))throw Error(method+' permission denial NOT verified (HTTP '+response.status+'); inspect grants/RLS. Probe could not change existing rows.');
   console.log(method+': public client write rejected (HTTP '+response.status+')');
  }
 }
}
