import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {toolBuildView,buildProgress,buildOutcome} from '../src/tool-build.js';
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function dom(t){const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;globalThis.Node=window.Node;window.HTMLElement.prototype.scrollIntoView=()=>{};t.after(()=>{delete globalThis.document;delete globalThis.Node;});return {document,window,click:node=>node.dispatchEvent(new window.Event('click'))};}
const tool={id:'new-tool',status:'ready',selected:'adapter',binding:{fingerprint:'immutable'},evaluation:{}};
const created={taskId:tool.id,jobId:'build'};
test('phase copy hides raw logs and uses only real phase-local counts',()=>{
 assert.equal(buildProgress({status:'queued',stage:'raw'}).title,'Waiting for this Mac');
 const progress=buildProgress({status:'running',stage:'iter train_loss tok/s tokens',events:[{summary:'Learning from local examples · 10 of 120'}]});
 assert.equal(progress.count,'10 of 120 learning steps');assert.equal(progress.title,'Learn from examples');assert.doesNotMatch(progress.description,/train_loss/);
 assert.equal(buildProgress({status:'running',stage:'Evaluating trained candidate: 3/12'}).count,'3 of 12 checks');
 assert.match(buildOutcome({...tool,selected:'baseline'}).description,/kept the original model/);assert.equal(buildOutcome({status:'ready'}),null);
});
test('Create immediately exposes Stop even before acknowledgement, then waits for confirmed cancellation',async t=>{
 const {document,click}=dom(t);let accept,stopCalls=0,creates=0,busy=true;let status='running';
 const flow=toolBuildView({post:async route=>{if(route==='/api/tools'){creates++;return new Promise(r=>accept=r);}stopCalls++;status='cancelled';},get:async route=>route==='/api/tools'?[]:{status,stage:'raw'}},{onBusy:value=>busy=value});document.body.append(flow.element);
 const pending=flow.start({request:'sales'});assert.equal(flow.element.hidden,false);assert.match(flow.element.textContent,/Starting on this Mac/);const stop=flow.element.querySelector('[data-action=stop-build]');click(stop);assert.match(flow.element.textContent,/Stopping/);assert.equal(stopCalls,0);
 accept(created);await pending;await flush();assert.equal(stopCalls,1);assert.equal(creates,1);assert.equal(busy,false);assert.match(flow.element.textContent,/This run stopped/);assert.equal(flow.element.querySelector('[data-action=retry-build]').hidden,false);flow.dispose();
});
test('polls retain the same Stop node and announce phases rather than every iteration',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {document}=dom(t);let calls=0,opened;
 const jobs=[{status:'running',stage:'Learning from local examples · 1 of 120'},{status:'running',stage:'Learning from local examples · 10 of 120'},{status:'ready',result:tool}];
 const flow=toolBuildView({post:async()=>created,get:async()=>jobs[Math.min(calls++,2)]},{onOpen:id=>opened=id});document.body.append(flow.element);await flow.start({request:'sales'});
 const stop=flow.element.querySelector('[data-action=stop-build]'),live=flow.element.querySelector('[role=status]'),announcement=live.textContent;
 t.mock.timers.tick(1000);await flush();assert.equal(flow.element.querySelector('[data-action=stop-build]'),stop);assert.equal(live.textContent,announcement);assert.match(flow.element.textContent,/10 of 120 learning steps/);
 t.mock.timers.tick(1000);await flush();assert.equal(stop.hidden,true);assert.equal(flow.element.querySelector('[data-action=open-tool]').hidden,false);flow.element.querySelector('[data-action=open-tool]').click();assert.equal(opened,tool.id);flow.dispose();
});
test('lost creation acknowledgement never offers a duplicate creation retry',async t=>{
 const {document}=dom(t);let posts=0;
 const flow=toolBuildView({post:async()=>{posts++;throw Error('transport');}},{ });document.body.append(flow.element);await flow.start({request:'sales'});
 assert.equal(posts,1);assert.match(flow.element.textContent,/Check saved tasks before creating another/);assert.equal(flow.element.querySelector('[data-action=retry-build]').hidden,true);flow.dispose();
});
test('known-job reconnect reads its saved status without creating another tool',async t=>{
 const {document,click}=dom(t);let posts=0,gets=0;
 const flow=toolBuildView({post:async()=>{posts++;return created;},get:async()=>{gets++;if(gets===1)throw Error('offline');return {status:'ready',result:{...tool,selected:'baseline'}};}});document.body.append(flow.element);await flow.start({request:'sales'});
 assert.match(flow.element.textContent,/Connection interrupted/);click(flow.element.querySelector('[data-action=reconnect-build]'));await flush();assert.equal(posts,1);assert.match(flow.element.textContent,/kept the original model/);assert.equal(flow.element.dataset.state,'ready');flow.dispose();
});
test('failure and interrupted runs check for saved output and expose recovery without overwriting a prior tool',async t=>{
 const {document}=dom(t);for(const status of ['failed','interrupted']){
  const flow=toolBuildView({post:async()=>created,get:async route=>route==='/api/tools'?[{...tool,id:'older-tool'}]:{status,error:'raw private diagnostic'}});document.body.append(flow.element);await flow.start({request:'sales'});
  assert.equal(flow.element.querySelector('[data-action=edit-build]').hidden,false);assert.equal(flow.element.querySelector('[data-action=retry-build]').hidden,false);assert.match(flow.element.textContent,/existing tools are unchanged/);assert.equal(flow.element.querySelector('h1').textContent.includes('raw'),false);flow.dispose();
 }
});
