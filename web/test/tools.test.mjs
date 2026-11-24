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
    const view=toolBuilderView({post:async()=>{posts++;return {compatible:true,model:{repository:'reviewed',downloadGB:2.3},setup:{},action:'Download and learn',scope:'bounded',dataUse:'synthetic'};}},{getDataset:()=>({id:'csv',columns}),onJob:()=>assert.fail('not reviewed'),onError:message=>assert.fail(message)});
    view.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();
    view.querySelector('input').value='A changed task';view.querySelector('button.primary').dispatchEvent(new window.Event('click'));await flush();
    assert.equal(posts,1);assert.match(view.textContent,/choices changed/);
  }finally{delete globalThis.document;delete globalThis.Node;}
});
