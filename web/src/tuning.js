// Autonomous tuner panel: one tuning run rendered from saved state only. Executor, judge and
// proposer appear as a conversation because that is how the rounds actually hand off; nothing
// here is simulated. Rounds arrive through the shared activity poll, so a restart mid-run
// reattaches by id.
import {observeLocalActivity} from './api.js';
import {element as el} from './dashboard.js';
let tuningId=null,api=null,panel=null,snapshot=null,signature='',actions=null,latest=null,recipes=null;
const pct=v=>Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
const secs=ms=>Number.isFinite(ms)?(ms<1000?ms+' ms':(ms/1000).toFixed(1)+' s'):'—';
const pretty=s=>String(s??'').replace(/_/g,' ');
function current(){
  const fromState=(snapshot?.tunings||[]).find(t=>t.id===tuningId);
  if(fromState&&(!latest||JSON.stringify(fromState)!==JSON.stringify(latest)))latest=fromState;
  return latest;
}
// Rounds as the hand-offs that produced them: proposer → executor → judge, repeated.
function feed(t){
  const items=[];
  for(const r of t.rounds||[]){
    if(r.round>0)items.push({role:'Proposer',text:`${r.change}. ${r.rationale||''}`.trim(),via:'Agent Relay · Planner → Evaluator'});
    items.push({role:'Executor',text:`Trained round ${r.round} in ${secs(r.elapsedMs)} · development accuracy ${pct(r.development_accuracy)} · train ${pct(r.train_accuracy)}`});
    const top=r.development_confusions?.[0];
    items.push({role:'Judge',promoted:r.promoted,text:`Held-out ${pct(r.heldout_accuracy)} · ${r.promoted?'promoted to best':'kept the previous best'}${top?` · most confused: ${pretty(top.true)} read as ${pretty(top.predicted)} (${top.count})`:''}`});
  }
  const proposerStage=/^(Proposer|Waiting|Queued)/.test(t.stage||'');
  if(t.status==='running')items.push({role:proposerStage?'Proposer':'Executor',text:t.stage||'Working',pending:true});
  if(t.status==='failed')items.push({role:(t.rounds||[]).length?'Proposer':'Executor',text:`Failed: ${t.error||'no error recorded'}`,error:true});
  if(t.status==='cancelled')items.push({role:'Judge',text:'Run cancelled. The best round so far is kept.',error:true});
  return items;
}
function benchmarkTable(recipe){
  const b=recipe?.benchmark;if(!b)return null;
  const rows=[['Accuracy',c=>pct(c.accuracy)],['Per crop',c=>c.perCropMs<1?c.perCropMs+' ms':Math.round(c.perCropMs)+' ms'],['Cost per 1,000 crops',c=>'$'+c.usdPer1000.toFixed(2)],['Photo leaves laptop',c=>c.leavesLaptop?'yes':'no']];
  return el('section',{class:'evaluation'},el('h3',{},'What a tuned head buys you: same held-out crops, local versus GPT'),
    el('table',{class:'compare'},el('thead',{},el('tr',{},el('th',{},''),...b.columns.map(c=>el('th',{},c.id==='local'?c.label+' (reference run)':c.label)))),el('tbody',{},...rows.map(([label,fn])=>el('tr',{},el('td',{},label),...b.columns.map(c=>el('td',{},fn(c))))))),
    el('p',{class:'muted'},`Reference run measured ${b.measuredAt} on ${b.crops} held-out crops with the recipe's strongest config, not this run's numbers. ${b.note}`));
}
function render(){
  if(!panel||!tuningId)return;
  const t=current();
  const next=JSON.stringify([t,recipes?.length]);if(next===signature)return;signature=next;
  const openDetails=[...panel.querySelectorAll('details')].map(d=>d.open);
  panel.hidden=false;
  if(!t){panel.replaceChildren(el('h2',{},'Autonomous tuner'),el('p',{role:'status'},'Loading tuning run…'));return;}
  const running=t.status==='running';
  const head=el('div',{class:'runtime-row'},el('div',{},el('h2',{},`Autonomous tuner · ${t.recipe}`),el('p',{role:'status'},`${t.status} · ${t.stage||''} · round ${t.rounds?.length||0} of ${t.maxRounds}`)),
    el('div',{class:'dashboard-tools'},running?el('button',{type:'button',class:'secondary',onClick:async()=>{try{await api.post(`/api/tuning/${encodeURIComponent(t.id)}/cancel`);}catch(e){panel.append(el('p',{role:'alert'},e.message));}}},'Cancel tuning'):null));
  panel.replaceChildren(head);
  if(t.request)panel.append(el('p',{},el('strong',{},'Task: '),t.request));
  panel.append(el('p',{class:'muted'},`${t.backbone||'Recipe'} · ${t.counts?`${t.counts.train} train / ${t.counts.development} development / ${t.counts.heldout} held-out crops`:'splits reported after the first round'} · every round is a durable Terse job; kill the companion and restart, and the run continues from the next round.`));
  const first=t.rounds?.[0],best=t.best;
  if(first)panel.append(el('div',{class:'climb'},el('div',{},el('small',{},'Baseline held-out'),el('strong',{},pct(first.heldout_accuracy))),el('span',{class:'arrow','aria-hidden':'true'},'→'),el('div',{},el('small',{},`Best held-out · round ${best?.round??'—'}`),el('strong',{},pct(best?.heldout_accuracy)))));
  if(t.rounds?.length)panel.append(el('table',{class:'rounds'},el('thead',{},el('tr',{},...['Round','Change','Development','Held-out','Time','Judge'].map(h=>el('th',{},h)))),
    el('tbody',{},...t.rounds.map(r=>el('tr',{},el('td',{},String(r.round)),el('td',{},r.change),el('td',{},pct(r.development_accuracy)),el('td',{},pct(r.heldout_accuracy)),el('td',{},secs(r.elapsedMs)),el('td',{},r.promoted?el('span',{class:'promote'},'Promoted'):'kept best'))))));
  panel.append(el('h3',{},'Agents'),el('ol',{class:'tune-feed','aria-label':'Tuning hand-offs'},...feed(t).map(item=>el('li',{class:'bubble','data-role':item.role,'data-pending':item.pending?'':null,'data-error':item.error?'':null,role:item.error?'alert':null},el('strong',{},item.role,item.via?el('span',{class:'via'},item.via):null),item.text,item.promoted?el('span',{class:'promote'},'Promoted'):null))));
  if(t.status==='failed')panel.append(el('p',{class:'muted'},'The rounds above are saved. Fix the cause and start a new run; a kill mid-run would resume, but a failed proposer step does not retry itself.'));
  if(t.status==='complete'&&best?.checkpoint)panel.append(el('p',{class:'muted'},`Best checkpoint saved locally at ${best.checkpoint}`));
  const table=benchmarkTable((recipes||[]).find(r=>r.id===t.recipe));
  if(table&&best)panel.append(table);
  if(t.lastProposal)panel.append(el('details',{},el('summary',{},'Last proposal as returned by the local model'),el('pre',{},JSON.stringify(t.lastProposal,null,2))));
  panel.append(el('details',{},el('summary',{},'Saved tuning record'),el('pre',{},JSON.stringify({...t,rounds:undefined},null,2))));
  [...panel.querySelectorAll('details')].forEach((d,i)=>{d.open=Boolean(openDetails[i]);});
  actions?.onChange?.(t);
}
export async function showTuning(id,client,handlers={}){
  tuningId=id;api=client;actions=handlers;signature='';latest=null;
  if(!panel){panel=document.getElementById('tuning-panel');}
  render();
  try{
    if(!recipes)recipes=await api.get('/api/tuning/recipes');
    const t=await api.get(`/api/tuning/${encodeURIComponent(id)}`);
    if(tuningId===id){latest=t;signature='';render();}
  }catch(e){if(tuningId===id)panel.append(el('p',{role:'alert'},e.message));}
}
export function hideTuning(){tuningId=null;actions=null;latest=null;signature='';if(panel){panel.hidden=true;panel.replaceChildren();}}
export function currentTuning(){return tuningId?current():null;}
observeLocalActivity(event=>{if(event.type==='disconnected'){snapshot=null;recipes=null;hideTuning();}else if(event.type==='state'){snapshot=event.state;render();}});
