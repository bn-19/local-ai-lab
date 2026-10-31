import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('saved-task buttons scope Activity, clear old results and fence slow loads',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;globalThis.Node=window.Node;
  window.HTMLElement.prototype.scrollIntoView=()=>{};
  // LinkeDOM intentionally omits the browser select.value setter.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'';},set(value){for(const option of this.querySelectorAll('option')){if(option.value===value)option.setAttribute('selected','');else option.removeAttribute('selected');}}});
  const originalFetch=globalThis.fetch;
  let resolveA,delayA=false;const posts=[];let generated=0;let delayState=false;const pendingState=[];
  const tasks=[{id:'a',request:'Task A',status:'ready',documentResult:{name:'Document A',parts:[{answer:'Result A'}],characters:10,model:'m'}},{id:'b',request:'Task B',status:'failed'}];
  globalThis.fetch=async (url,options)=>{
    if(options?.method==='POST'){const body=JSON.parse(options.body||'{}');posts.push({url,body});if(url.endsWith('/api/models/recommend'))return response({selected:{id:'coder',digest:'abc'},runtime:{ready:true},machine:{},requirements:{kind:'code'},candidates:[],catalogSource:{kind:'built-in'},selectionBasis:'fixture'});if(url.endsWith('/api/tasks')||url.endsWith('/followup')){generated++;return response({taskId:'new-'+generated,jobId:'job-'+generated});}}
    if(url.includes('/api/jobs/job-'))return response({id:'job-'+generated,taskId:'new-'+generated,status:'ready'});
    if(url.includes('/api/tasks/new-'))return response({id:'new-'+generated,request:'Write a function',model:{id:'coder'},textResult:{answer:'function sum(a,b) { return a+b; }'}});
    if(url.endsWith('/api/health'))return response({machine:{},models:[{id:'coder',digest:'abc'}],runtimes:{ollama:{ready:true}}});
    if(url.endsWith('/api/state')&&delayState)return new Promise(resolve=>pendingState.push(()=>resolve(response({tasks,jobs:[]}))));
    if(url.endsWith('/api/state'))return response({tasks,jobs:tasks.map(task=>({id:task.id,taskId:task.id,status:task.status}))});
    if(url.endsWith('/api/tasks/a')&&delayA)return new Promise(resolve=>{resolveA=()=>resolve(response(tasks[0]));});
    if(url.endsWith('/api/tasks/a'))return response(tasks[0]);
    if(url.endsWith('/api/tasks/b'))return response(tasks[1]);
    throw Error('Unexpected API request '+url);
  };
  const click=node=>node.dispatchEvent(new window.Event('click'));
  try{
    await import('../src/app.js');await import('../src/activity.js');
    document.getElementById('pair-token').value='fixture';
    document.getElementById('pair-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();
    click(document.querySelector('[data-view="saved"]'));await flush();
    const buttons=document.querySelectorAll('#saved-list button');click(buttons[0]);await flush();
    assert.match(document.getElementById('dashboard').textContent,/Result A/);
    assert.match(document.getElementById('live-activity').textContent,/completed/);
    click(buttons[1]);await flush();
    assert.equal(document.getElementById('dashboard').textContent,'');
    assert.match(document.getElementById('live-activity').textContent,/failed/);
    delayA=true;click(buttons[0]);await flush();click(buttons[1]);await flush();resolveA();await flush();
    assert.equal(document.getElementById('dashboard').textContent,'');
    assert.match(document.getElementById('live-activity').textContent,/failed/);
    click(buttons[0]);await flush();click(document.getElementById('sample-button'));resolveA();await flush();assert.match(document.getElementById('live-activity').textContent,/No task selected/);
    document.getElementById('task').value='Write a function';
    const submit=()=>document.getElementById('task-form').dispatchEvent(new window.Event('submit',{cancelable:true}));
    submit();await flush();assert.equal(posts.at(-1).url.endsWith('/api/models/recommend'),true);assert.equal(generated,0,'review does not execute a task');
    assert.match(document.getElementById('runtime-panel').textContent,/Built-in catalog/);
    submit();await flush();assert.equal(generated,1);assert.equal(posts.at(-1).body.modelId,'coder');
    assert.match(document.getElementById('dashboard').textContent,/function sum/);
    const followup=document.querySelector('#dashboard form');followup.querySelector('input').value='Explain it';followup.dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();
    assert.equal(generated,2);assert.ok(posts.at(-1).url.endsWith('/api/tasks/new-1/followup'));
    assert.match(document.getElementById('dashboard').textContent,/function sum/);
    click(document.getElementById('disconnect'));delayState=true;document.getElementById('pair-token').value='fixture';document.getElementById('pair-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();
    assert.match(document.getElementById('connection-badge').textContent,/Connected to/);
    click(document.querySelector('[data-view="saved"]'));await flush();
    delayState=false;for(const resolve of pendingState.splice(0))resolve();await flush();
    assert.equal(document.getElementById('saved-view').hidden,false,'finishing pairing must not override the user navigation');
    click(document.querySelector('#saved-list button'));await flush();resolveA();await flush();assert.match(document.getElementById('dashboard').textContent,/Result A/);
  }finally{
    click(document.getElementById('disconnect'));globalThis.fetch=originalFetch;
    delete globalThis.document;delete globalThis.window;delete globalThis.Node;
  }
});
