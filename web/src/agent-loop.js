import {observeLocalActivity} from './api.js';
import {element as el} from './dashboard.js';
let taskId=null,api=null,start=null,panel=null,snapshot=null,signature='';
function render(){
 if(!panel||!taskId)return;
 const loop=[...(snapshot?.loops||[])].filter(l=>l.taskId===taskId).sort((a,b)=>b.startedAt-a.startedAt)[0];
 const job=(snapshot?.jobs||[]).find(j=>j.taskId===taskId&&j.kind==='agentloop'&&['queued','running'].includes(j.status));
 const next=JSON.stringify({loop,job:job?.id});if(next===signature)return;signature=next;
 const openDetails=[...panel.querySelectorAll('details')].map(d=>d.open);
 panel.hidden=false;
 panel.replaceChildren(el('summary',{},'Improve reporting model'),el('p',{},'Planner, evaluator and trainer use one local model and device. Recorded handoffs and measured results appear below.'),el('button',{class:'primary',type:'button',disabled:!!job,onClick:async()=>{try{const r=await api.post(`/api/tasks/${encodeURIComponent(taskId)}/agentloop`,{});await start(r.jobId);}catch(e){panel.append(el('p',{role:'alert'},e.message));}}},job?'Agent loop running':'Run agent improvement loop'));
 if(!loop)return;
 panel.append(el('p',{role:'status'},`${loop.status} · ${loop.stage||'Starting'}${loop.selected?' · Selected: '+loop.selected:''}`));
 for(const role of ['Planner','Evaluator','Trainer']){
  const events=(loop.events||[]).filter(e=>String(e.role||'').toLowerCase()===role.toLowerCase());
  panel.append(el('section',{class:'evaluation'},el('h3',{},role),...events.filter(e=>['decision','measurement','training','selection'].includes(e.kind)).map(e=>el('p',{},`${e.choice?e.choice+': ':''}${e.summary}`)),...(!events.length?[el('p',{class:'muted'},'Waiting for evidence')]:[])));
 }
 const handoffs=el('details',{},el('summary',{},'Handoffs and transport'));
 for(const sent of (loop.events||[]).filter(e=>e.kind==='handoff')){const receipt=loop.events.find(e=>e.kind==='receipt'&&sent.messageId&&e.messageId===sent.messageId&&e.from===sent.role&&e.role===sent.to&&e.transport===sent.transport);handoffs.append(el('p',{},`${sent.role} → ${sent.to}: ${sent.phase} · ${sent.transport||'relay'} · ${receipt?'received':'sent; receipt pending'} · ${sent.messageId}`));}
 panel.append(handoffs);
 const history=(snapshot?.loops||[]).filter(l=>l.taskId===taskId&&l.id!==loop.id);
 if(history.length)panel.append(el('details',{},el('summary',{},'Previous attempts'),...history.map(l=>el('p',{},`${l.id}: ${l.status}${l.selected?' · '+l.selected:''}${l.error?' · '+l.error:''}${l.trainer?.choice?' · Trainer: '+l.trainer.choice:''}`))));
 if(loop.transportFallback)panel.append(el('p',{class:'muted'},'Transport fallback: '+loop.transportFallback+' Local durable receipts are not Relay receipts.'));
 if(loop.error)panel.append(el('p',{role:'alert'},loop.error));
 [...panel.querySelectorAll('details')].forEach((d,i)=>{d.open=Boolean(openDetails[i]);});
 if(loop.candidate)panel.append(el('p',{},`Fresh test: current ${loop.candidate.baseline.score}/${loop.candidate.total}; candidate ${loop.candidate.adapted.score}/${loop.candidate.total}. No UI filter overrides were used for these scores.`));
}
export function showAgentLoop(id,client,onStart){
 taskId=id;api=client;start=onStart;signature='';
 if(!panel){panel=el('details',{class:'runtime-panel agent-loop-disclosure',id:'agent-loop-panel'});document.getElementById('job-panel').after(panel);}
 render();
}
export function hideAgentLoop(){taskId=null;signature='';if(panel){panel.hidden=true;panel.replaceChildren();}}
observeLocalActivity(event=>{if(event.type==='disconnected'){snapshot=null;hideAgentLoop();}else if(event.type==='state'){snapshot=event.state;render();}});
