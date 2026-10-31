import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalog,catalogVersion,recommendModels} from '../lib/model-catalog.mjs';
import {createSharedCatalog,catalogConnection} from '../lib/shared-catalog.mjs';
const env={LOCAL_LAB_SUPABASE_URL:'https://example.supabase.co',LOCAL_LAB_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const rows=()=>catalog.map(({id,digest})=>({id,digest,version:'release-2',enabled:true}));
const json=value=>new Response(JSON.stringify(value));
const client=(fetchImpl,options={})=>createSharedCatalog({env:()=>env,fetchImpl,...options});
test('absent/invalid config makes no network request and rejects admin keys',async()=>{
 for(const config of [{},{...env,LOCAL_LAB_SUPABASE_URL:'https://example.supabase.co/?private=1'},{...env,LOCAL_LAB_SUPABASE_PUBLISHABLE_KEY:'sb_secret_private'}]){
  const result=await createSharedCatalog({env:()=>config,fetchImpl:()=>assert.fail('network')})();
  assert.equal(result.source.kind,'built-in');assert.equal(result.catalog.length,2);
 }
 const jwt='e30.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';
 assert.throws(()=>catalogConnection({...env,LOCAL_LAB_SUPABASE_PUBLISHABLE_KEY:jwt}));
});
test('public key headers distinguish publishable keys and anon JWT',()=>{
 assert.equal(catalogConnection(env).headers.Authorization,undefined);
 const jwt='e30.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.signature';
 assert.equal(catalogConnection({...env,LOCAL_LAB_SUPABASE_PUBLISHABLE_KEY:jwt}).headers.Authorization,'Bearer '+jwt);
});
test('successful catalog uses only local metadata; recommendation and private filtering remain local',async()=>{
 let requests=0;
 const shared=await client(async(url,options)=>{
  requests++;assert.equal(url.search,'?select=id,digest,version,enabled&order=id&limit=21');assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,'error');
  return json(rows().map(r=>({...r,command:'untrusted',source:'https://evil.example'})));
 })();
 const recommendation=recommendModels({request:'PRIVATE write code',inputKind:'code'}, {catalog:shared.catalog,machine:{platform:'darwin',arch:'arm64',memoryGB:24,availableMemoryGB:16,freeDiskGB:50},runtimes:{ollama:{ready:true}}});
 assert.equal(shared.source.version,'release-2');assert.equal(shared.source.kind,'supabase');assert.equal(recommendation.selected.id,'qwen2.5-coder:1.5b');assert.equal(recommendation.selected.command,undefined);assert.equal(recommendation.selected.source,catalog[1].source);assert.equal(requests,1);
});
test('malformed, unreviewed, duplicate, mixed, disabled and excessive rows fall back',async()=>{
 const cases=[null,[],[null],rows().concat(rows()[0]),rows().map((r,i)=>({...r,version:i?'other':r.version})),rows().map(r=>({...r,enabled:false})),rows().map(r=>({...r,digest:'0'.repeat(64)})),rows().map(r=>({...r,enabled:'true'})),Array(21).fill(rows()[0]),rows().map(r=>({...r,version:''}))];
 for(const value of cases)assert.equal((await client(async()=>json(value))()).source.kind,'built-in');
 assert.equal((await client(async()=>new Response('{'))()).source.kind,'built-in');
});
test('bounds bytes while streaming, cancels oversize body and rejects declared oversize',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(17000));},cancel(){cancelled=true;}});
 assert.equal((await client(async()=>new Response(stream))()).source.kind,'built-in');assert.equal(cancelled,true);
 assert.equal((await client(async()=>new Response('[]',{headers:{'content-length':'17000'}}))()).source.kind,'built-in');
});
test('offline, rate limit, timeout and stalled response body fall back',async()=>{
 for(const fetchImpl of [async()=>{throw Error('secret must not escape');},async()=>new Response('',{status:429}),()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(){}}))]){
  const result=await client(fetchImpl,{timeoutMs:15})();assert.equal(result.source.kind,'built-in');assert.ok(!result.source.reason.includes('secret'));
 }
});
test('concurrent calls coalesce; cache expires, failures replace success, connection changes invalidate',async()=>{
 let count=0,clock=100,config={...env};
 const read=createSharedCatalog({env:()=>config,now:()=>clock,ttlMs:60,fetchImpl:async()=>{count++;return count===2?new Response('',{status:503}):json(rows());}});
 const [a,b]=await Promise.all([read(),read()]);assert.equal(count,1);assert.deepEqual(a,b);
 a.catalog[0].id='mutated';assert.equal((await read()).catalog[0].id,catalog[0].id);
 clock+=61;assert.equal((await read()).source.kind,'built-in');assert.equal(count,2);await read();assert.equal(count,2);
 config={...env,LOCAL_LAB_SUPABASE_URL:'https://other.supabase.co'};assert.equal((await read()).source.kind,'supabase');assert.equal(count,3);
});
test('SQL seed matches the locally reviewed catalog exactly',async()=>{
 const sql=await readFile(new URL('../supabase/catalog/001_catalog.sql',import.meta.url),'utf8');
 for(const model of catalog)assert.ok(sql.includes(`('${model.id}','${model.digest}','${catalogVersion}',true)`));
});
