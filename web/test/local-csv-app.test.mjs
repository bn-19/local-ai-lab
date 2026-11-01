import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
test('ordinary CSV workflows share follow-up controls and never auto-enable demo experiments',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
 globalThis.document=document;globalThis.window=window;globalThis.Node=window.Node;window.HTMLElement.prototype.scrollIntoView=()=>{};
 const tasks=[{id:'factory',request:'Compare cycle time',dashboard:{kpis:[{label:'mean: cycle_minutes',value:12}],charts:[],source:{measure:{operation:'mean',column:'cycle_minutes'},groupColumn:'station'}}},{id:'legacy',request:'Historical preferences',dashboard:{kpis:[{label:'mean: winpercent',value:50}],charts:[],source:{measure:{operation:'mean',column:'winpercent'},groupColumn:'competitorname'}}}].map(t=>({...t,status:'ready'}));
 const original=globalThis.fetch;
 globalThis.fetch=async url=>new Response(JSON.stringify(url.endsWith('/health')?{machine:{},runtimes:{},models:[]}:url.endsWith('/state')?{tasks,jobs:[]}:tasks.find(t=>url.endsWith('/tasks/'+t.id))),{headers:{'Content-Type':'application/json'}});
 try{
  await import('../src/app.js');document.getElementById('pair-token').value='fixture';document.getElementById('pair-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await flush();
  document.querySelector('[data-view=saved]').dispatchEvent(new window.Event('click'));await flush();
  const buttons=[...document.querySelectorAll('#saved-list button')];
  for(const button of buttons){button.dispatchEvent(new window.Event('click'));await flush();assert.ok(document.getElementById('followup'));assert.equal(document.querySelector('[data-workflow=improve]'),null);assert.equal(document.querySelector('#agent-loop-panel'),null);assert.doesNotMatch(document.getElementById('dashboard').textContent,/Train candy|Synthetic benchmark|Average matchup win rate/);}
 }finally{globalThis.fetch=original;delete globalThis.document;delete globalThis.window;delete globalThis.Node;}
});
