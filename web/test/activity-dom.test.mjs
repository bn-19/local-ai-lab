import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {LocalAPI,selectActivityTask} from '../src/api.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});

test('actual Activity DOM retains disclosure identity, scopes tasks and clears on disconnect',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;globalThis.Node=window.Node;
  let state={tasks:[{id:'a',model:{id:'model-a'}}],jobs:[{id:'j',taskId:'a',status:'running',stage:'Reading',events:[{id:'e',at:10,status:'running',summary:'Reading section 2 of 4'}]}]};
  let fail=false;
  const api=new LocalAPI({origin:'https://example.test',fetcher:async url=>{
    if(url.endsWith('/api/health'))return response({machine:{},runtimes:{}});
    if(fail)throw new TypeError('offline');
    return response(state);
  }});
  try{
    await import('../src/activity.js');selectActivityTask('a');await api.pair('fixture-only');await flush();
    const panel=document.getElementById('live-activity');
    const disclosure=panel.querySelector('.activity-timeline details');
    const summary=disclosure.querySelector('summary');disclosure.setAttribute('open','');
    assert.match(panel.textContent,/Reading section 2 of 4/);
    assert.equal(panel.querySelectorAll('.activity-timeline li').length,1);
    t.mock.timers.tick(1000);await flush();
    assert.equal(panel.querySelector('.activity-timeline details'),disclosure);
    assert.equal(disclosure.querySelector('summary'),summary,'focused control is not replaced');
    assert.ok(disclosure.hasAttribute('open'));
    state.jobs[0]={...state.jobs[0],status:'ready',stage:'Result saved',finishedAt:100};
    t.mock.timers.tick(1000);await flush();
    assert.equal(panel.querySelector('.activity-timeline details'),disclosure);
    assert.match(panel.textContent,/completed/);
    selectActivityTask('b');assert.ok(!panel.textContent.includes('Reading section 2'));
    selectActivityTask('a');assert.match(panel.textContent,/Reading section 2/);
    fail=true;t.mock.timers.tick(4000);await flush();assert.match(panel.textContent,/Updates unavailable/);
    fail=false;t.mock.timers.tick(4000);await flush();assert.ok(!panel.textContent.includes('Updates unavailable'));
    state.jobs[0].events.push({id:'unsafe',summary:'<img src=x onerror=alert(1)>',status:'completed',at:11});
    t.mock.timers.tick(4000);await flush();assert.equal(panel.querySelector('img'),null);assert.match(panel.textContent,/<img src=x/);
    api.disconnect();assert.equal(panel.textContent,'');assert.ok(panel.hidden);assert.equal(api.token,'');
    assert.ok(!document.getElementById('monitor-panel').textContent.includes('Reading'));
    await api.pair('fixture-only');selectActivityTask('a');await flush();assert.match(panel.textContent,/Result saved/);
    assert.equal(state.jobs.length,1,'reconnect does not submit work');
    const retained=panel.querySelector('.activity-timeline details');retained.setAttribute('open','');
    state.jobs[0].events.pop();t.mock.timers.tick(4000);await flush();
    assert.equal(panel.querySelector('.activity-timeline details'),retained);
    assert.ok(retained.hasAttribute('open'));assert.ok(!panel.textContent.includes('<img src=x'));
  }finally{api.disconnect();delete globalThis.document;delete globalThis.window;delete globalThis.Node;}
});
