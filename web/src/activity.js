import { observeLocalActivity } from './api.js';
import { activityView, monitorView } from './activity-state.js';
import { element as el } from './dashboard.js';
const panel = document.getElementById('live-activity');
let signature = '';
let announcement;
let content;
let rows;
let receipts;
let evidence;
function reset() {
  signature = '';
  panel.replaceChildren();
  panel.hidden = true;
  announcement = null;
  content = null;
  rows = receipts = evidence = null;
}
observeLocalActivity(event => {
  if (event.type === 'disconnected') { reset(); return; }
  if (!announcement) {
    announcement = el('span', { class: 'live-status', role: 'status', 'aria-live': 'polite' });
    rows = el('ol', { class: 'agent-events' });
    evidence = el('dl');
    receipts = el('details', {}, el('summary', {}, 'Handoff details'), evidence);
    content = el('div', {}, rows, receipts);
    panel.replaceChildren(el('div', { class: 'live-heading' }, el('h2', { id: 'live-activity-title' }, 'Device activity'), announcement), content);
    panel.hidden = false;
  }
  if (event.type === 'connected') { announcement.textContent = 'Connecting to activity'; return; }
  if (event.type === 'error') {
    announcement.dataset.state = 'error';
    announcement.textContent = 'Updates unavailable · retrying';
    return;
  }
  const view = activityView(event.state);
  const next = JSON.stringify(view);
  if (next === signature && announcement.dataset.state !== 'error') return;
  signature = next;
  announcement.dataset.state = view.error ? 'error' : 'ready';
  announcement.textContent = view.error ? `${view.status}: ${view.error}` : view.status;
  rows.hidden = !view.rows.length;
  rows.replaceChildren(...view.rows.map(row => el('li', {}, el('strong', {}, row.agent), el('span', {}, row.status))));
  receipts.hidden = !view.evidence.length;
  evidence.replaceChildren(...view.evidence.flatMap(([label, value]) => [el('dt', {}, label), el('dd', {}, value)]));
});
window.addEventListener('pagehide', reset);

// A single subscription feeds the monitor; controls and disclosures retain identity.
const monitor=document.getElementById('monitor-panel');
const monitorStatus=el('p',{role:'status','aria-live':'polite'},'Connect your Mac');
const stepList=el('ol',{class:'monitor-steps','aria-label':'Job steps'});
const elapsedValue=el('strong',{},'Unavailable');
const etaValue=el('strong',{},'Learning timing');
const costValue=el('strong',{},'Awaiting usage');
const coverage=el('p',{class:'monitor-coverage'});
const rateInput=el('input',{type:'number',min:0,step:'0.01',value:'0.25',id:'cloud-input-rate'});
const rateOutput=el('input',{type:'number',min:0,step:'0.01',value:'2',id:'cloud-output-rate'});
const preset=el('select',{id:'cloud-model'},el('option',{value:'gpt5mini'},'GPT-5 mini'),el('option',{value:'custom'},'Custom rates'));
const historyList=el('div');
monitor.append(monitorStatus,stepList,el('div',{class:'monitor-metrics'},el('div',{},el('span',{},'Elapsed'),elapsedValue),el('div',{},el('span',{},'ETA'),etaValue),el('div',{},el('span',{},'Cloud API avoided · est.'),costValue)),coverage,el('details',{},el('summary',{},'Cost assumptions'),el('div',{class:'fields'},el('label',{for:'cloud-model'},'Compare with',preset),el('label',{for:'cloud-input-rate'},'Input · USD / 1M tokens',rateInput),el('label',{for:'cloud-output-rate'},'Output · USD / 1M tokens',rateOutput)),el('p',{},'Local token counts are a proxy for cloud usage. Updated after each measured call. Excludes electricity, hardware, caching, tools and training. This is an API-fee estimate, not net savings or an equivalent-quality claim.'),el('a',{href:'https://developers.openai.com/api/docs/models/gpt-5-mini',target:'_blank',rel:'noopener'},'GPT-5 mini rates · checked Oct 31, 2026')),el('details',{},el('summary',{},'Recent jobs'),historyList));
let monitorState=null;
let stepSignature='',historySignature='';
function duration(seconds){if(seconds===null)return 'Unavailable';return seconds<60?`${Math.floor(seconds)}s`:`${Math.floor(seconds/60)}m ${Math.floor(seconds%60)}s`;}
function updateMonitor(){
  if(!monitorState)return;
  const rates={input:rateInput.value===''?NaN:rateInput.valueAsNumber,output:rateOutput.value===''?NaN:rateOutput.valueAsNumber};
  const view=monitorView(monitorState,Date.now(),rates);
  monitorStatus.textContent=view.job?`${view.job.stage||view.job.kind} · ${view.job.status}`:'No jobs yet';
  const signature=JSON.stringify([view.job?.id,view.steps]);
  if(signature!==stepSignature){stepSignature=signature;stepList.replaceChildren(...view.steps.map(step=>el('li',{'data-state':step.state,'aria-current':step.state==='active'?'step':null},el('span',{class:'step-marker','aria-hidden':'true'}),el('span',{},step.label),el('span',{class:'sr-only'},step.state))));}
  elapsedValue.textContent=duration(view.elapsed);
  etaValue.textContent=view.job?.status==='ready'?'Complete':view.job?.status==='queued'?'Waiting for device':view.job&&['failed','cancelled','interrupted'].includes(view.job.status)?'Stopped':view.eta?(view.eta.high===0?'Taking longer than usual':`${duration(view.eta.low)}–${duration(view.eta.high)}`):'Learning timing';
  etaValue.title=view.eta?`Range from ${view.eta.samples} completed jobs of this kind; task sizes may differ`:'Available after three timed runs of this job kind';
  costValue.textContent=view.cost===null?'Awaiting usage':view.cost>0&&view.cost<0.0001?'< $0.0001':`$${view.cost.toFixed(4)}`;
  coverage.textContent=view.covered?`${view.covered}/${view.total} jobs measured for this task`:'Token usage not available yet';
  const nextHistory=JSON.stringify(view.history?.map(j=>[j.id,j.status,j.stage]));
  if(nextHistory!==historySignature){historySignature=nextHistory;historyList.replaceChildren(...(view.history||[]).map(j=>el('div',{class:'activity-item'},el('strong',{},j.stage||j.kind),el('span',{},` · ${j.status}`))));}
}
preset.addEventListener('change',()=>{if(preset.value==='gpt5mini'){rateInput.value='0.25';rateOutput.value='2';}updateMonitor();});
for(const input of [rateInput,rateOutput])input.addEventListener('input',()=>{preset.value='custom';updateMonitor();});
observeLocalActivity(event=>{
  if(event.type==='state'){monitorState=event.state;updateMonitor();}
  if(event.type==='error'){stepSignature='';monitorStatus.textContent='Updates unavailable · retrying';stepList.querySelectorAll('[data-state="active"]').forEach(node=>node.dataset.state='stale');}
  if(event.type==='disconnected'){monitorState=null;stepSignature=historySignature='';stepList.replaceChildren();historyList.replaceChildren();monitorStatus.textContent='Connect your Mac';elapsedValue.textContent=etaValue.textContent=costValue.textContent='Unavailable';coverage.textContent='';}
});
