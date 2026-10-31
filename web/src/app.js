import { LocalAPI } from './api.js';
import { element as el, chartView, number, sampleDashboard } from './dashboard.js';
const $ = id => document.getElementById(id);
const api = new LocalAPI();
let health=null, dataset=null, currentTask=null, activeJob=null, timer=null, sample=false, busy=false, epoch=0;
const views=['workspace','saved','activity','connection'];
function notify(message, error=false) { $('notice').textContent=message; $('notice').className=error?'error':''; $('notice').hidden=false; }
function view(name) {
  views.forEach(v=>$(v+'-view').hidden=v!==name);
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $('page-name').textContent={workspace:'New task',saved:'Saved tasks',activity:'Activity',connection:'Connect your Mac'}[name];
}
function updateConnection() {
  $('connection-badge').textContent=api.connected?'● Connected to your Mac':'○ Not connected';
  $('connection-badge').className='badge'+(api.connected?' connected':'');
  $('csv').disabled=!api.connected || busy;
  $('create-button').textContent=api.connected?'Create my dashboard →':'Connect your Mac ↗';
  $('create-button').disabled=busy;
  $('disconnect').disabled=!api.connected;
  $('retry-connection').disabled=!api.connected;
  $('pair-form').hidden=api.connected;
  $('rail-device').textContent=health?.machine?.chip || 'Runs on your computer';
  $('readiness').replaceChildren(el('span',{class:'status-dot'}),el('div',{},el('strong',{},api.connected?'Your Mac is connected':'Local companion required'),el('p',{},api.connected?`${number(health.machine.memoryGB)} GB memory · ${number(health.machine.freeDiskGB)} GB disk available`:'Pair explicitly to run tasks on your Mac.')));
}
async function pair(token) {
  const generation=++epoch;
  health=await api.pair(token);
  if(generation!==epoch)return;
  $('pair-token').value='';
  updateConnection(); renderRuntime(); await refreshSavedCount();
  $('connection-detail').textContent='Connected directly to your Mac. Your files are processed by the local companion.';
  notify('Connected. Choose a CSV to create your dashboard.');view('workspace');
}
function disconnect() {
  epoch++;api.disconnect();clearTimeout(timer);health=null;dataset=null;currentTask=null;activeJob=null;sample=false;busy=false;
  $('csv').value='';$('pair-token').value='';$('task').value='';$('saved-count').textContent='0';
  for(const id of ['profile','runtime-panel','job-panel','dashboard']) {$(id).hidden=true;$(id).replaceChildren();}
  $('saved-list').replaceChildren();$('activity-list').replaceChildren();updateConnection();
  $('connection-detail').textContent='Disconnected. Token and private results cleared from this page.';
  notify('Disconnected. Running local jobs continue; reconnect to inspect or cancel them.');
}
async function run(action) {
  try {await action();}catch(error){notify(error.message,true);}
}
function renderRuntime() {
  if(!health)return;
  const rec=health.recommendation, installed=health.models?.find(m=>m.id===rec?.id);
  const runtime=health.runtimes.ollama;
  const panel=$('runtime-panel');panel.hidden=false;
  panel.replaceChildren(el('div',{class:'runtime-row'},el('div',{},el('p',{class:'eyebrow'},'YOUR LOCAL SETUP'),el('h2',{},rec?.id || 'Model recommendation unavailable'),el('p',{},rec?.reason || 'The companion will recommend a supported model.'),el('p',{},installed?'Installed on your Mac':rec?`Estimated download: ${rec.downloadGB} GB. Installation starts only when you approve.`:'Check companion setup.')),el('button',{class:'primary',disabled:!runtime?.ready || !rec || busy || installed,onClick:()=>run(install)},installed?'Installed':runtime?.ready?'Install recommended model':'Ollama required')));
  panel.append(el('p',{},`Model runtime: ${runtime?.ready?'ready':'not available'}. Saved job state: ${health.runtimes.terse?.ready?'ready':'Terse unavailable'}. Agent handoffs: ${health.runtimes.relay?.ready?'connected':health.runtimes.relay?.error || 'Relay not configured'}.`));
}
async function install() {
  const result=await api.post('/api/models/install',{model:health.recommendation.id});
  await watchJob(result.jobId);
}
function selectField(id,label,options,placeholder) {
  const select=el('select',{id,required:!placeholder},placeholder?el('option',{value:''},placeholder):el('option',{value:''},'Choose a column'),options.map(o=>el('option',{value:o.value??o},o.label??o)));
  return el('label',{},label,select);
}
function renderProfile() {
  const cols=dataset.columns.map(c=>c.name);
  const panel=$('profile');panel.hidden=false;
  panel.replaceChildren(el('div',{class:'clarifications'},el('h3',{},dataset.name),el('p',{},`${number(dataset.rows)} rows · ${number(dataset.columns.length)} columns · imported in ${number(dataset.importMs/1000)}s. Confirm what the dashboard should measure.`),el('div',{class:'fields'},selectField('operation','Measure',[{value:'sum',label:'Sum of a column'},{value:'mean',label:'Average of a column'},{value:'count',label:'Count rows'},{value:'product_sum',label:'Sum of two multiplied columns'}]),selectField('measure-column','Numeric column',cols),selectField('measure-column2','Second numeric column',cols,'Only for multiplication'),selectField('date-column','Date column',cols,'No date column'),selectField('group-column','Compare groups by',cols),selectField('filter-column','Filter dashboard by',cols,'No filter'),selectField('negative-policy','Negative values',[{value:'include',label:'Include all values'},{value:'exclude',label:'Exclude negative measures'}]))));
  // Defaults only for the operation, never infer a user's measure from column names.
  $('operation').value='sum';$('negative-policy').value='include';
  $('operation').addEventListener('change',()=>{$('measure-column').required=$('operation').value!=='count';$('measure-column2').required=$('operation').value==='product_sum';});
}
async function importCSV() {
  const file=$('csv').files[0];if(!file)return;
  if(!file.name.toLowerCase().endsWith('.csv'))throw new Error('Choose a CSV file.');
  if(file.size===0)throw new Error('This file is empty. Choose a CSV with a header and data rows.');
  const generation=epoch;busy=true;updateConnection();notify(`Importing ${file.name} directly to your Mac. Large files may take a moment.`);
  try {const result=await api.upload(file);if(generation!==epoch)return;dataset=result;renderProfile();notify(`${number(dataset.rows)} rows imported locally. Confirm the columns below.`);}
  finally{if(generation===epoch){busy=false;updateConnection();}}
}
async function createTask(event) {
  event.preventDefault();if(!api.connected){view('connection');return;}
  if(!dataset)throw new Error('Choose a CSV before creating your dashboard.');
  if(!$('task').value.trim())throw new Error('Describe what you want to understand.');
  const operation=$('operation').value;
  if(!$('group-column').value || (operation!=='count'&&!$('measure-column').value) || (operation==='product_sum'&&!$('measure-column2').value))throw new Error('Choose the measure and group columns before continuing.');
  const result=await api.post('/api/tasks',{request:$('task').value.trim(),datasetId:dataset.id,measure:{operation,column:$('measure-column').value||undefined,column2:operation==='product_sum'?$('measure-column2').value:undefined},dateColumn:$('date-column').value||null,groupColumn:$('group-column').value,filterColumn:$('filter-column').value||null,negativePolicy:$('negative-policy').value,reuseRecipe:true});
  sample=false;currentTask=result.taskId;await watchJob(result.jobId);
}
async function watchJob(id) {
  clearTimeout(timer);activeJob=id;busy=true;updateConnection();renderRuntime();
  const generation=epoch;const panel=$('job-panel');panel.hidden=false;
  const poll=async()=>{
    if(generation!==epoch)return;
    try {
      const job=await api.get(`/api/jobs/${encodeURIComponent(id)}`);if(generation!==epoch)return;
      panel.replaceChildren(el('div',{class:'runtime-row'},el('div',{},el('h2',{},job.stage||'Local job'),el('p',{},`${job.status} · Job ${job.id}`)),el('button',{class:'secondary',disabled:!['queued','running'].includes(job.status),onClick:()=>run(async()=>{await api.post(`/api/jobs/${encodeURIComponent(id)}/cancel`);notify('Cancellation requested. Waiting for the companion to stop safely.');})},'Cancel job')));
      if(job.progress?.total>0)panel.append(el('progress',{max:job.progress.total,value:job.progress.completed,'aria-label':'Job progress'}));
      if(['ready','failed','cancelled','interrupted'].includes(job.status)){
        busy=false;activeJob=null;updateConnection();
        if(job.error)panel.append(el('p',{},job.error));
        if(job.status==='ready') {
          if(job.taskId || currentTask)await loadTask(job.taskId||currentTask);
          health=await api.get('/api/health');renderRuntime();await refreshSavedCount();
          notify('Local job completed. Results are saved by your companion.');
        }else notify(job.error || `Job ${job.status}. You can retry from your saved task.`,job.status!=='cancelled');
      }else timer=setTimeout(poll,1000);
    }catch(error){busy=false;updateConnection();panel.append(el('p',{},'Connection interrupted. The local job may still be running. Reconnect and check Activity before starting another.'));notify(error.message,true);}
  };
  await poll();
}
async function loadTask(id) {
  const task=await api.get(`/api/tasks/${encodeURIComponent(id)}`);currentTask=task.id;sample=false;
  if(task.dashboard)renderDashboard(task.dashboard,task.evaluation);else notify(task.error||`Saved task is ${task.status}.`);
}
function renderDashboard(data,evaluation=null,filterValue='') {
  const panel=$('dashboard');panel.hidden=false;panel.replaceChildren();
  const tools=el('div',{class:'dashboard-tools'});
  const filter=data.filters?.[0];
  if(filter){const select=el('select',{id:'dashboard-filter','aria-label':`Filter by ${filter.column}`},el('option',{value:''},'All groups'),filter.values.map(v=>el('option',{value:v},v)));select.value=filterValue;
    select.addEventListener('change',()=>run(async()=>{const value=select.value;if(sample){renderDashboard(sampleDashboard(value),null,value);return;}select.disabled=true;try {const updated=await api.post(`/api/tasks/${encodeURIComponent(currentTask)}/dashboard`,{filter:value?{column:filter.column,value}:null});renderDashboard(updated,evaluation,value);}finally{select.disabled=false;}}));tools.append(el('label',{for:'dashboard-filter'},filter.column),select);}
  panel.append(el('div',{class:'dashboard-heading'},el('div',{},el('span',{class:'badge'+(sample?'':' connected')},sample?'Sample · fictional data':'Calculated on your Mac'),el('h2',{id:'dashboard-title'},sample?'A clearer picture of your sales':'Your data, made useful'),el('p',{},data.source?.name||'Local dataset')),tools));
  panel.append(el('div',{class:'kpis'},(data.kpis||[]).map(k=>el('div',{class:'kpi'},el('small',{},k.label),el('strong',{},number(k.value))))));
  panel.append(el('div',{class:'charts'},(data.charts||[]).map(chartView)));
  const source=data.source||{};
  panel.append(el('p',{class:'source-note'},`${number(source.filteredRows??source.rows)} of ${number(source.rows)} rows · ${typeof source.measure==='string'?source.measure:JSON.stringify(source.measure)} · Negative values: ${source.negativePolicy||'as supplied'}. ${sample?'Fictional data included with this preview. No model was run.':`Model: ${data.model?.id||'not reported'} · Configuration: ${data.configuration||'not reported'}.`}`));
  if(sample){panel.append(el('p',{class:'sample-caption'},'Explore the filter and chart values. Connect your Mac to create this from your own CSV.'));return;}
  const followup=el('form',{class:'followup'},el('label',{class:'sr-only',for:'followup'},'Ask a follow-up'),el('input',{id:'followup',required:true,maxlength:2000,placeholder:'What else would you like to understand?'}),el('button',{class:'primary',type:'submit',disabled:busy},'Ask a follow-up →'));
  followup.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const result=await api.post(`/api/tasks/${encodeURIComponent(currentTask)}/followup`,{request:$('followup').value.trim()});currentTask=result.taskId;await watchJob(result.jobId);});});panel.append(followup);
  const evalPanel=el('section',{class:'evaluation'},el('h3',{},'Check and improve this setup'),el('p',{class:'muted'},'Compare real baseline results with one bounded configuration improvement. This changes settings, not model weights.'),el('button',{class:'secondary',disabled:busy,onClick:()=>run(async()=>{const result=await api.post(`/api/tasks/${encodeURIComponent(currentTask)}/evaluate`);await watchJob(result.jobId);})},evaluation?'Run evaluation again':'Evaluate this setup'));
  if(evaluation)evalPanel.append(el('details',{},el('summary',{},'View measured evaluation results'),el('pre',{},JSON.stringify(evaluation,null,2))));
  else evalPanel.append(el('p',{class:'muted'},'No measured comparison yet.'));
  panel.append(evalPanel);
}
async function refreshSavedCount(){const state=await api.get('/api/state');$('saved-count').textContent=String(state.tasks?.length||0);return state;}
async function renderSaved() {
  const panel=$('saved-list');panel.replaceChildren(el('p',{class:'empty'},api.connected?'Loading saved tasks…':'Connect your Mac to see its saved tasks.'));
  if(!api.connected)return;const state=await refreshSavedCount();panel.replaceChildren();
  if(!state.tasks?.length)panel.append(el('p',{class:'empty'},'Your first completed task will appear here. Start with a CSV in the workspace.'));
  for(const task of state.tasks||[])panel.append(el('div',{class:'task-row'},el('div',{},el('h3',{},task.request||task.id),el('p',{},`${task.status} · ${task.id}`)),el('button',{class:'secondary',onClick:()=>run(async()=>{await loadTask(task.id);view('workspace');$('dashboard').scrollIntoView({block:'start'});})},'Open task')));
}
async function renderActivity() {
  const panel=$('activity-list');panel.replaceChildren(el('p',{class:'empty'},api.connected?'Loading actual job states…':'Connect your Mac to see real jobs and handoffs. No activity is simulated.'));
  if(!api.connected)return;const state=await api.get('/api/state');panel.replaceChildren();
  panel.append(el('div',{class:'activity-item'},el('strong',{},'Integration readiness'),el('p',{},`Terse: ${health.runtimes.terse?.ready?'ready':'unavailable'}. Agent Relay: ${health.runtimes.relay?.ready?'connected':health.runtimes.relay?.error||'not configured'}.`)));
  if(!state.jobs?.length)panel.append(el('p',{class:'empty'},'No local jobs yet.'));
  for(const job of [...(state.jobs||[])].reverse())panel.append(el('div',{class:'activity-item'},el('strong',{},`${job.stage||job.kind||'Job'} · ${job.status}`),el('p',{},job.id),job.error?el('p',{},job.error):null,['queued','running'].includes(job.status)?el('button',{onClick:()=>run(async()=>{view('workspace');await watchJob(job.id);})},'View progress'):null));
  if(state.activity?.length)panel.append(el('details',{},el('summary',{},'Actual handoffs'),el('pre',{},JSON.stringify(state.activity,null,2))));
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view(button.dataset.view);run(async()=>{if(button.dataset.view==='saved')await renderSaved();if(button.dataset.view==='activity')await renderActivity();});}));
document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{$('task').value=button.dataset.prompt;$('task').focus();}));
$('connection-link').addEventListener('click',()=>view('connection'));
$('task-form').addEventListener('submit',event=>run(()=>createTask(event)));
$('csv').addEventListener('change',()=>run(importCSV));
$('sample-button').addEventListener('click',()=>{sample=true;renderDashboard(sampleDashboard());$('dashboard').scrollIntoView({block:'start',behavior:'smooth'});});
$('pair-form').addEventListener('submit',event=>{event.preventDefault();run(()=>pair($('pair-token').value));});
$('retry-connection').addEventListener('click',()=>run(async()=>{health=await api.get('/api/health');updateConnection();renderRuntime();notify('Your local companion is reachable.');}));
$('disconnect').addEventListener('click',disconnect);
window.addEventListener('pagehide',()=>{api.disconnect();clearTimeout(timer);});
updateConnection();
// Same-origin health is safe to probe. Hosted pages never probe loopback before explicit pairing.
if(api.sameOrigin)run(()=>pair(''));
