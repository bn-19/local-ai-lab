import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {LocalAPI} from '../src/api.js';
import {visionView} from '../src/vision.js';
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
test('photo setup is explicit, fixed actions queue jobs and disconnect clears private preview',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;globalThis.Node=window.Node;
 const calls=[];const api=new LocalAPI({origin:'http://127.0.0.1:4173',fetcher:async(url,options)=>{
 calls.push([url,options.method]);let result={};if(url.endsWith('/health'))result={machine:{},runtimes:{}};else if(url.endsWith('/state'))result={jobs:[]};else if(url.endsWith('/photos'))result={id:'photo-1'};else if(options.method==='POST')result={jobId:'job-1'};else result={installed:false,bytes:0,path:'/local/vision',retention:'Kept until removed'};
 return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 }});
 const panel=visionView(api);document.body.append(panel);
 try{assert.match(panel.textContent,/Missed and occluded candies make counts incomplete/);await api.pair('fixture');await flush();assert.equal(calls.filter(x=>x[1]==='POST').length,0,'pairing does not install or infer');
 const file=new File([Buffer.from([255,216,255,0,0,0,0,0,0,0,0,0,0,0,0,0])],'candy.jpg',{type:'image/jpeg'});await panel.uploadPhoto(file);assert.equal(panel.querySelector('img').hidden,false);assert.equal(panel.open,true);assert.match(panel.textContent,/not used/);
 const install=[...panel.querySelectorAll('button')].find(x=>x.textContent.startsWith('Install'));install.click();await flush();assert.ok(calls.some(x=>x[0].endsWith('/api/vision')&&x[1]==='POST'));api.disconnect();assert.equal(panel.querySelector('img').hidden,true);assert.equal(panel.querySelector('img').getAttribute('src'),null);assert.match(panel.textContent,/Connect your Mac/);
 }finally{api.disconnect();delete globalThis.document;delete globalThis.Node;}
});
