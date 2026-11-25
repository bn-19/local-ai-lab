import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {toolBuildView,buildProgress,buildOutcome} from '../src/tool-build.js';
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function dom(t){const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;globalThis.Node=window.Node;window.HTMLElement.prototype.scrollIntoView=()=>{};t.after(()=>{delete globalThis.document;delete globalThis.Node;});return {document,window,click:node=>node.dispatchEvent(new window.Event('click'))};}
const tool={id:'new-tool',status:'ready',selected:'adapter',binding:{fingerprint:'immutable'},evaluation:{}};
const created={taskId:tool.id,jobId:'build'};
test('phase copy hides raw logs and uses only real phase-local counts',()=>{
 assert.equal(buildProgress({status:'queued',stage:'raw'}).title,'Waiting for this Mac');
 const progress=buildProgress({status:'running',stage:'iter train_loss tok/s tokens',events:[{summary:'Learning from local examples · 10 of 120'}]});
 assert.equal(progress.count,'10 of 120 learning steps');assert.equal(progress.title,'Learning from examples');assert.doesNotMatch(progress.description,/train_loss/);
 assert.equal(buildProgress({status:'running',stage:'Evaluating trained candidate: 3/12'}).count,'3 of 12 checks');
 assert.match(buildOutcome({...tool,selected:'baseline'}).description,/uses the original model/);assert.equal(buildOutcome({status:'ready'}),null);
});
test('Create immediately exposes Stop even before acknowledgement, then waits for confirmed cancellation',async t=>{
 const {document,click}=dom(t);let accept,stopCalls=0,creates=0,busy=true;let status='running';
 const flow=toolBuildView({post:async route=>{if(route==='/api/tools'){creates++;return new Promise(r=>accept=r);}stopCalls++;status='cancelled';},get:async route=>route==='/api/tools'?[]:{status,stage:'raw'}},{onBusy:value=>busy=value});document.body.append(flow.element);
 const pending=flow.start({request:'sales'});assert.equal(flow.element.hidden,false);assert.match(flow.element.textContent,/Starting your tool/);const stop=flow.element.querySelector('[data-action=stop-build]');click(stop);assert.match(flow.element.textContent,/Stopping/);assert.equal(stopCalls,0);assert.equal(flow.element.querySelector('.build-feedback').dataset.motion,'stopping');
 accept(created);await pending;await flush();assert.equal(stopCalls,1);assert.equal(creates,1);assert.equal(busy,false);assert.equal(flow.element.querySelector('.build-feedback').dataset.motion,'stopped');assert.match(flow.element.textContent,/This run stopped/);assert.equal(flow.element.querySelector('[data-action=retry-build]').hidden,false);flow.dispose();
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
 assert.match(flow.element.textContent,/Connection interrupted/);assert.equal(flow.element.querySelector('.build-feedback').dataset.motion,'paused');click(flow.element.querySelector('[data-action=reconnect-build]'));await flush();assert.equal(posts,1);assert.match(flow.element.textContent,/uses the original model/);assert.equal(flow.element.dataset.state,'ready');assert.equal(flow.element.querySelector('.build-feedback').dataset.motion,'ready');flow.dispose();
});
test('failure and interrupted runs check for saved output and expose recovery without overwriting a prior tool',async t=>{
 const {document}=dom(t);for(const status of ['failed','interrupted']){
  const flow=toolBuildView({post:async()=>created,get:async route=>route==='/api/tools'?[{...tool,id:'older-tool'}]:{status,error:'raw private diagnostic'}});document.body.append(flow.element);await flow.start({request:'sales'});
  assert.equal(flow.element.querySelector('[data-action=edit-build]').hidden,false);assert.equal(flow.element.querySelector('[data-action=retry-build]').hidden,false);assert.match(flow.element.textContent,/other tools (are|stay) unchanged/);assert.equal(flow.element.querySelector('h1').textContent.includes('raw'),false);flow.dispose();
 }
});
test('waiting and active work differ; real phase counts keep the same motion nodes across polls',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {document}=dom(t);let index=0;
 const jobs=[{status:'queued'},{status:'running',stage:'Verifying the downloaded model'},{status:'running',stage:'Learning from local examples · 10 of 120'},{status:'running',stage:'Learning from local examples · 20 of 120'},{status:'running',stage:'Evaluating trained candidate: 1/12'}];
 const flow=toolBuildView({post:async()=>created,get:async()=>jobs[Math.min(index++,jobs.length-1)]});document.body.append(flow.element);await flow.start({request:'sales'});
 const feedback=flow.element.querySelector('.build-feedback'),track=flow.element.querySelector('[role=progressbar]'),fill=track.firstChild;
 assert.equal(feedback.dataset.motion,'waiting');assert.equal(track.hidden,true);assert.equal(flow.element.querySelector('[aria-current=step]'),null);
 t.mock.timers.tick(1000);await flush();assert.equal(feedback.dataset.motion,'active');assert.equal(track.hidden,true);
 t.mock.timers.tick(1000);await flush();assert.equal(feedback.dataset.motion,'counted');assert.equal(track.hidden,false);assert.equal(track.getAttribute('aria-valuenow'),'10');assert.equal(track.getAttribute('aria-valuemax'),'120');assert.equal(fill.style.transform,'scaleX(0.08333333333333333)');assert.match(track.getAttribute('aria-label'),/this step only/);
 t.mock.timers.tick(1000);await flush();assert.equal(flow.element.querySelector('.build-feedback'),feedback);assert.equal(track.firstChild,fill);assert.equal(track.getAttribute('aria-valuenow'),'20');assert.equal(fill.style.transform,'scaleX(0.16666666666666666)');
 t.mock.timers.tick(1000);await flush();assert.equal(track.getAttribute('aria-valuenow'),'1');assert.equal(track.getAttribute('aria-valuemax'),'12');assert.equal(fill.style.transition,'none','new phase resets immediately, never animating backwards as overall progress');
 flow.dispose();assert.equal(feedback.dataset.motion,'idle');assert.equal(track.hidden,true);
});
test('invalid worker counts never produce a progress value',()=>{
 const view=buildProgress({status:'running',stage:'Learning from local examples · 121 of 120'});assert.equal(view.progress,null);assert.equal(view.count,'');
});
test('reduced motion statically retains the status and real-count bar without animation',async()=>{
 const {readFile}=await import('node:fs/promises');const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
 const reduced=css.slice(css.lastIndexOf('@media(prefers-reduced-motion:reduce)'));
 assert.match(reduced,/build-phase-fill\s*\{ transition:none !important/);assert.doesNotMatch(css,/@keyframes build-(wait|work)/);
});
test('one live status hides the workflow, and transitions only when the state changes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {document,window}=dom(t);let animations=0,index=0;
 window.HTMLElement.prototype.animate=function(){animations++;return {cancel(){}};};
 const jobs=[{status:'running',stage:'Learning from local examples · 1 of 120'},{status:'running',stage:'Learning from local examples · 10 of 120'},{status:'running',stage:'Evaluating trained candidate: 1/12'},{status:'ready',result:tool}];
 const flow=toolBuildView({post:async()=>created,get:async()=>jobs[Math.min(index++,3)]});document.body.append(flow.element);await flow.start({request:'sales'});
 assert.equal(flow.element.querySelector('.build-step-label').textContent,'Step 2 of 4');assert.equal(flow.element.querySelector('h1').textContent,'Learning from examples');assert.equal(flow.element.querySelector('.build-steps-disclosure').hasAttribute('open'),false);assert.equal(flow.element.querySelector('.build-step-mark'),null);assert.equal(flow.element.querySelector('.build-work-arc'),null);
 const calls=animations;t.mock.timers.tick(1000);await flush();assert.equal(animations,calls,'count-only polls do not restart status motion');
 t.mock.timers.tick(1000);await flush();assert.equal(flow.element.querySelector('.build-step-label').textContent,'Step 3 of 4');assert.equal(animations,calls+1);
 t.mock.timers.tick(1000);await flush();assert.equal(flow.element.querySelector('h1').textContent,'Your tool is ready');assert.equal(flow.element.querySelector('.build-step-label').textContent,'Saved on this Mac');assert.equal(flow.element.querySelector('[data-action=open-tool]').hidden,false);flow.dispose();
});
test('reduced motion skips state transitions without changing the meaningful status',async t=>{
 const {document,window}=dom(t);const original=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});let animations=0;
 window.HTMLElement.prototype.animate=()=>{animations++;return {cancel(){}};};
 try{const flow=toolBuildView({post:async()=>created,get:async()=>({status:'ready',result:tool})});document.body.append(flow.element);await flow.start({request:'sales'});assert.equal(animations,0);assert.equal(flow.element.querySelector('h1').textContent,'Your tool is ready');flow.dispose();}finally{if(original)globalThis.matchMedia=original;else delete globalThis.matchMedia;}
});
