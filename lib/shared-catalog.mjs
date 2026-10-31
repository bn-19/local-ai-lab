import {catalog,catalogVersion} from './model-catalog.mjs';

const MAX_BYTES=16384, MAX_ROWS=20;
const fallback=reason=>({catalog,source:{kind:'built-in',version:catalogVersion,status:'not-synced',reason}});

// Only a public client key is accepted. JWT decoding checks key type, not authenticity;
// Supabase verifies the signature. Never accept admin/service-role credentials here.
export function catalogConnection(env=process.env){
 const url=env.LOCAL_LAB_SUPABASE_URL;
 const key=env.LOCAL_LAB_SUPABASE_PUBLISHABLE_KEY||env.LOCAL_LAB_SUPABASE_ANON_KEY;
 if(!url||!key)return null;
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/.test(parsed.hostname)||parsed.pathname!=='/'||parsed.port||parsed.search||parsed.hash||parsed.username||parsed.password)throw Error('Expected an existing HTTPS Supabase project URL');
 if(typeof key!=='string'||key.length>4096)throw Error('Expected a public catalog client key');
 const headers={apikey:key,Accept:'application/json'};
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)){
  let claims;
  try{if(key.split('.').length!==3)throw Error();claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());}catch{throw Error('Expected a publishable key or legacy anon JWT');}
  if(claims.role!=='anon')throw Error('Catalog requires a public client key, never an admin key');
  headers.Authorization='Bearer '+key;
 }
 return {url:new URL('/rest/v1/local_lab_model_catalog?select=id,digest,version,enabled&order=id&limit=21',parsed),headers};
}

async function boundedRows(response,signal){
 if(!response.ok){await response.body?.cancel();throw Error('Shared catalog HTTP '+response.status);}
 if(Number(response.headers.get('content-length'))>MAX_BYTES){await response.body?.cancel();throw Error('Shared catalog too large');}
 if(!response.body)throw Error('Shared catalog body missing');
 const reader=response.body.getReader();let bytes=0;const chunks=[];
 const cancel=()=>{void reader.cancel().catch(()=>{});};
 signal.addEventListener('abort',cancel,{once:true});
 try{
  signal.throwIfAborted();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw Error('Shared catalog too large');chunks.push(value);}
  signal.throwIfAborted();
 }finally{signal.removeEventListener('abort',cancel);await reader.cancel();reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function reviewedRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ROWS)throw Error('Shared catalog empty or row limit exceeded');
 const ids=new Set(),versions=new Set();const reviewed=[];
 for(const row of rows){
  if(!row||typeof row!=='object'||typeof row.id!=='string'||typeof row.digest!=='string'||typeof row.enabled!=='boolean'||typeof row.version!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(row.version)||ids.has(row.id))throw Error('Shared catalog schema or duplicate invalid');
  ids.add(row.id);versions.add(row.version);
  const local=catalog.find(c=>c.id===row.id&&c.digest===row.digest);
  if(!local)throw Error('Shared catalog contains unreviewed artifacts; local approval required');
  if(row.enabled)reviewed.push(local);
 }
 if(versions.size!==1||!reviewed.length)throw Error('Shared catalog release mixed or no enabled artifacts');
 return {catalog:reviewed,version:rows[0].version};
}

// Dependencies are injectable for offline tests. Production has one cache/in-flight GET,
// scoped to the exact connection; failed refreshes immediately use the built-in catalog.
export function createSharedCatalog({env=()=>process.env,fetchImpl=fetch,now=Date.now,timeoutMs=2500,ttlMs=60000}={}){
 let state;
 return async function(){
  let connection;
  try{connection=catalogConnection(env());}catch{return fallback('Invalid shared catalog configuration; use a project URL and public client key.');}
  if(!connection){state=undefined;return fallback('Shared catalog not configured; using reviewed built-in artifacts.');}
  const identity=JSON.stringify(connection);
  if(state?.identity!==identity)state={identity};
  const current=state;
  if(current.pending)return structuredClone(await current.pending);
  if(current.cached&&now()<current.until)return structuredClone(current.cached);
  current.pending=(async()=>{
   const controller=new AbortController();let timer;
   try{
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Shared catalog timed out'));},timeoutMs);});
    const operation=(async()=>{const response=await fetchImpl(connection.url,{method:'GET',headers:connection.headers,signal:controller.signal,redirect:'error'});return reviewedRows(await boundedRows(response,controller.signal));})();
    const result=await Promise.race([operation,deadline]);
    current.cached={catalog:result.catalog,source:{kind:'supabase',version:result.version,status:'synced',checkedAt:now(),scope:'Read-only reviewed public model metadata; private task and hardware filtering stays local'}};
   }catch(error){
    const message=/^Shared catalog /.test(error.message)?error.message:'Shared catalog unavailable or malformed';
    current.cached=fallback(message);
   }finally{clearTimeout(timer);current.until=now()+ttlMs;current.pending=undefined;}
   return current.cached;
  })();
  return structuredClone(await current.pending);
 };
}
export const sharedCatalog=createSharedCatalog();
