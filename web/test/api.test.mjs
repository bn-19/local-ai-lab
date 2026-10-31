import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalAPI, LOOPBACK } from '../src/api.js';
import { sampleDashboard } from '../src/dashboard.js';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('hosted adapter sends nothing before explicit pairing, then only direct authenticated loopback',async()=>{
 const calls=[];const api=new LocalAPI({origin:'https://example.vercel.app',fetcher:async(url,options)=>{calls.push({url,options});return response({machine:{},runtimes:{}});}});
 await assert.rejects(()=>api.get('/api/state'),/Connect/);assert.equal(calls.length,0);
 await api.pair(' scoped-token ');assert.equal(calls[0].url,LOOPBACK+'/api/health');assert.equal(calls[0].options.headers.Authorization,'Bearer scoped-token');assert.equal(calls[0].options.targetAddressSpace,'loopback');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
 api.disconnect();assert.equal(api.token,'');await assert.rejects(()=>api.get('/api/state'),/Connect/);
});
test('failed pairing clears credentials and reports server errors',async()=>{
 const api=new LocalAPI({origin:'https://example.vercel.app',fetcher:async()=>response({error:'Origin not allowed'},403)});
 await assert.rejects(()=>api.pair('token'),/Origin not allowed/);assert.equal(api.token,'');assert.equal(api.connected,false);
});
test('upload keeps raw CSV on fixed local endpoint and encodes filename',async()=>{
 let call;const api=new LocalAPI({origin:LOOPBACK,fetcher:async(url,options)=>{call={url,options};return response({id:'data-1'});}});
 api.token='local-test-token';const file=new File(['a,b\n1,2\n'],'a b.csv');await api.upload(file);assert.equal(call.url,LOOPBACK+'/api/datasets');assert.equal(call.options.body,file);assert.equal(call.options.headers['X-Filename'],'a%20b.csv');
 await assert.rejects(()=>api.get('//evil.example/api/state'),/Unsupported/);
});
test('sample filter recalculates all metrics and both charts',()=>{
 const all=sampleDashboard(),garden=sampleDashboard('Garden');assert.equal(all.kpis[0].value,72400);assert.equal(garden.kpis[0].value,19800);assert.equal(garden.source.filteredRows,6);assert.equal(garden.charts[0].points.length,6);assert.deepEqual(garden.charts[1].points,[{label:'Garden',value:19800}]);
});

test('fetch uses the browser global receiver required by native Window.fetch',async()=>{
 const api=new LocalAPI({origin:'https://example.vercel.app',fetcher:async function(){assert.equal(this,globalThis);return response({machine:{},runtimes:{}});}});
 await api.pair('test-token');assert.equal(api.connected,true);api.disconnect();
});

test('document upload uses the local file endpoint and keeps content out of JSON',async()=>{
 const calls=[];const api=new LocalAPI({origin:'http://127.0.0.1:4173',fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'doc',kind:'document'}),{headers:{'Content-Type':'application/json'}});}});
 api.token='test';const file=new Blob(['private text']);Object.defineProperty(file,'name',{value:'notes.md'});
 await api.upload(file);
 assert.ok(calls[0].url.endsWith('/api/files'));assert.equal(calls[0].options.body,file);assert.equal(calls[0].options.headers['Content-Type'],'application/octet-stream');
 api.disconnect();
});
