import test from 'node:test';import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';import {savedToolView,toolBuilderView} from '../src/tools.js';
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
test('saved tool explicitly represents retained baseline and reruns its own saved ID',async()=>{
  const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;globalThis.Node=window.Node;
  try{const calls=[];let queued;
    const tool={id:'fixed-tool',request:'Sales reports',datasetId:'original-data',selected:'baseline',scope:'Whole-file reports',binding:{fingerprint:'fixed-binding'},evaluation:{baseline:{score:12},adapted:{score:11},total:15}};
    const view=savedToolView(tool,null,{post:async(route,body)=>{calls.push({route,body});return {jobId:'job',taskId:'fixed-tool'};}},{onJob:async job=>{queued=job;},onError:message=>assert.fail(message)});
    assert.match(view.textContent,/base model was retained/);assert.doesNotMatch(view.textContent,/Tuned weights saved/);
    view.querySelector('input').value='How much revenue did we earn?';view.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();
    assert.equal(calls[0].route,'/api/tools/fixed-tool/run');assert.equal(calls[0].body.datasetId,'original-data');assert.equal(queued.taskId,'fixed-tool');
  }finally{delete globalThis.document;delete globalThis.Node;}
});
test('changing learning choices invalidates reviewed download approval',async()=>{
  const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;globalThis.Node=window.Node;
  try{let posts=0;
    const columns=['InvoiceNo','StockCode','Quantity','UnitPrice'].map(name=>({name}));
    const view=toolBuilderView({post:async()=>{posts++;return {compatible:true,model:{repository:'reviewed',downloadGB:2.3},setup:{runtimeReady:true},action:'Download and learn',scope:'bounded',dataUse:'synthetic'};}},{getDataset:()=>({id:'csv',columns}),onJob:()=>assert.fail('not reviewed'),onError:message=>assert.fail(message)});
    view.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();
    view.querySelector('input').value='A changed task';view.querySelector('[data-action=start-learning]').dispatchEvent(new window.Event('click'));await flush();
    assert.equal(posts,1);assert.match(view.textContent,/choices changed/);
  }finally{delete globalThis.document;delete globalThis.Node;}
});
test('review makes file handling and real download requirements explicit before Create',async()=>{
 const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;globalThis.Node=window.Node;
 try{
  const view=toolBuilderView({post:async()=>({compatible:true,model:{repository:'pinned-model',downloadGB:2.3},setup:{runtimeReady:false,modelCached:false,downloadBytes:156084339},reasons:[]})},{getDataset:()=>({id:'sales',name:'My sales.csv',columns:['InvoiceNo','StockCode','Quantity','UnitPrice'].map(name=>({name}))}),onBuild:()=>{},onError:assert.fail});
  view.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();
  const approval=view.querySelector('.tool-approval');assert.equal(approval.hidden,false);assert.match(approval.textContent,/My sales.csv/);assert.match(approval.textContent,/2.3 GB/);assert.match(approval.textContent,/157 MB/);assert.match(approval.textContent,/calculations, not training/);assert.equal(view.querySelector('[data-action=start-learning]').disabled,false);assert.equal(approval.querySelector('details').hasAttribute('open'),false);assert.doesNotMatch(approval.textContent,/null/);
 }finally{delete globalThis.document;delete globalThis.Node;}
});
