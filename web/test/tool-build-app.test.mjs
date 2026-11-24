import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {parseHTML} from 'linkedom';
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
test('saved-task navigation cannot discard Stop before creation acknowledgement',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
 globalThis.document=document;globalThis.window=window;globalThis.Node=window.Node;window.HTMLElement.prototype.scrollIntoView=()=>{};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'';},set(value){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===value);}});
 const original=globalThis.fetch;let acknowledge,stopped=false,creates=0,cancels=0;
 const dataset={id:'csv',name:'sales.csv',rows:7,columns:['InvoiceNo','StockCode','Quantity','UnitPrice'].map(name=>({name,type:'INTEGER'}))};
 globalThis.fetch=async (url,options)=>{let result;
  if(url.endsWith('/api/health'))result={machine:{},models:[],runtimes:{}};
  else if(url.endsWith('/api/state'))result={tasks:[{id:'old',request:'Existing tool',status:'ready'}],jobs:[]};
  else if(url.endsWith('/api/datasets'))result=dataset;
  else if(url.endsWith('/api/tools/recommend'))result={compatible:true,model:{},setup:{runtimeReady:true,modelCached:true},reasons:[]};
  else if(url.endsWith('/api/tools')&&options?.method==='POST'){creates++;return new Promise(resolve=>acknowledge=()=>resolve(new Response(JSON.stringify({taskId:'new',jobId:'job'}),{headers:{'Content-Type':'application/json'}})));}
  else if(url.endsWith('/api/jobs/job/cancel')){cancels++;stopped=true;result={};}
  else if(url.endsWith('/api/jobs/job'))result={id:'job',taskId:'new',status:stopped?'cancelled':'running'};
  else if(url.endsWith('/api/tools'))result=[];
  else throw Error('Unexpected request '+url);
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 };
 const click=node=>node.dispatchEvent(new window.Event('click'));
 try{
  await import('../src/app.js');document.getElementById('pair-token').value='fixture';document.getElementById('pair-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();
  Object.defineProperty(document.getElementById('csv'),'files',{value:[{name:'sales.csv',size:111}]});document.getElementById('csv').dispatchEvent(new window.Event('change'));await flush();
  document.querySelector('.tool-builder form').dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();click(document.querySelector('[data-action=start-learning]'));await flush();
  assert.equal(document.getElementById('setup-workbench').hidden,true);assert.equal(document.querySelector('.tool-build-surface').hidden,false);click(document.querySelector('[data-action=stop-build]'));
  click(document.querySelector('[data-view=saved]'));await flush();click(document.querySelector('#saved-list button'));await flush();
  assert.equal(document.querySelector('.tool-build-surface').hidden,false);assert.match(document.querySelector('.tool-build-surface h1').textContent,/Stopping/);
  acknowledge();await flush();assert.equal(creates,1);assert.equal(cancels,1);assert.match(document.querySelector('.tool-build-surface').textContent,/This run stopped/);
 }finally{click(document.getElementById('disconnect'));globalThis.fetch=original;delete globalThis.document;delete globalThis.window;delete globalThis.Node;}
});
