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
  let resolveA,delayA=false;
  const tasks=[{id:'a',request:'Task A',status:'ready',documentResult:{name:'Document A',parts:[{answer:'Result A'}],characters:10,model:'m'}},{id:'b',request:'Task B',status:'failed'}];
  globalThis.fetch=async url=>{
    if(url.endsWith('/api/health'))return response({machine:{},runtimes:{ollama:{ready:true}}});
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
  }finally{
    click(document.getElementById('disconnect'));globalThis.fetch=originalFetch;
    delete globalThis.document;delete globalThis.window;delete globalThis.Node;
  }
});
