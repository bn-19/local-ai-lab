import { LocalAPI, selectActivityTask } from './api.js';
import { element as el, chartView, number, sampleDashboard, measureColumns } from './dashboard.js';
const $ = id => document.getElementById(id);
const api = new LocalAPI();
let health=null, dataset=null, currentTask=null, activeJob=null, timer=null, sample=false, busy=false, pairing=false, epoch=0, taskLoad=0;
const views=['workspace','saved','activity','connection'];
function notify(message, error=false) { $('notice').textContent=message; $('notice').className=error?'error':''; $('notice').hidden=false; }
function view(name) {
  views.forEach(v=>$(v+'-view').hidden=v!==name);
  document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('main').focus({preventScroll:true});
  $('page-name').textContent={workspace:'Workspace',saved:'Saved tasks',activity:'Monitor',connection:'Connect your Mac'}[name];
}
function updateConnection() {
  $('connection-badge').textContent=api.connected?'● Connected to your Mac':'○ Not connected';
  $('connection-badge').className='badge'+(api.connected?' connected':'');
  $('csv').disabled=!api.connected || busy;
  $('create-button').textContent=api.connected?(dataset?.kind==='document'?'Read document →':'Create dashboard →'):'Connect your Mac ↗';
  $('create-button').disabled=busy;
  $('disconnect').disabled=!api.connected;
  $('retry-connection').disabled=!api.connected;
  $('pair-form').hidden=api.connected;
  $('rail-device').hidden=!api.connected;
  $('rail-device').textContent=health?.machine?.chip || '';
  $('connection-link').textContent=api.connected?'Connection ↗':'Connect your Mac ↗';
  $('readiness').hidden=true;
}
async function pair(token) {
  if(pairing)return;
  pairing=true;
  const submit=$('pair-form').querySelector('button');submit.disabled=true;
  try {
  const generation=++epoch;
  health=await api.pair(token);
  if(generation!==epoch)return;
  $('pair-token').value='';
  updateConnection(); renderRuntime(); await refreshSavedCount();
  $('connection-detail').textContent='Connected directly to your Mac. Your files are processed by the local companion.';
  $('notice').hidden=true;view('workspace');
  } finally {pairing=false;submit.disabled=false;}
}
function disconnect() {
  epoch++;api.disconnect();clearTimeout(timer);health=null;dataset=null;currentTask=null;activeJob=null;sample=false;busy=false;
  $('csv').value='';$('pair-token').value='';$('task').value='';$('saved-count').textContent='0';
  for(const id of ['profile','runtime-panel','job-panel','dashboard']) {$(id).hidden=true;$(id).replaceChildren();}
  $('setup-workbench').hidden=false;$('workspace-heading').hidden=false;$('edit-setup').hidden=true;
  $('saved-list').replaceChildren();$('activity-list')?.replaceChildren();updateConnection();
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
  panel.replaceChildren(el('div',{class:'runtime-row'},el('h2',{},rec?.id || 'Model unavailable'),el('button',{class:'secondary',disabled:!runtime?.ready || !rec || busy || installed,onClick:()=>run(install)},installed?'Installed':runtime?.ready?`Install · ${rec.downloadGB} GB`:'Ollama required')));
  const setupErrors=Object.values(health.runtimes).map(r=>r.error).filter(Boolean);
  if(setupErrors.length)panel.append(el('details',{},el('summary',{},'Setup'),setupErrors.map(error=>el('p',{},error))));
  panel.append(el('details',{},el('summary',{},'Model details'),el('dl',{},el('dt',{},'Memory'),el('dd',{},`${number(health.machine.memoryGB)} GB`),el('dt',{},'Free disk'),el('dd',{},`${number(health.machine.freeDiskGB)} GB`),el('dt',{},'Selection'),el('dd',{},rec?.reason||'Unavailable'))));
}
async function install() {
  if(busy)throw new Error('Wait for the current local job to finish.');
  const result=await api.post('/api/models/install',{model:health.recommendation.id});
  await watchJob(result.jobId,null);
}
function selectField(id,label,options,placeholder) {
  const select=el('select',{id,required:!placeholder},placeholder?el('option',{value:''},placeholder):el('option',{value:''},'Choose a column'),options.map(o=>el('option',{value:o.value??o},o.label??o)));
  return el('label',{},label,select);
}
function renderProfile() {
  const cols=dataset.columns.map(c=>c.name);
  const numeric=measureColumns(dataset.columns);
  const panel=$('profile');panel.hidden=false;
  panel.replaceChildren(el('div',{class:'clarifications'},el('h3',{},dataset.name),el('span',{class:'dataset-count'},`${number(dataset.rows)} rows`),el('div',{class:'fields'},selectField('operation','Measure',[{value:'sum',label:'Sum of a column'},{value:'mean',label:'Average of a column'},{value:'count',label:'Count rows'},{value:'product_sum',label:'Sum of two multiplied columns'}]),selectField('measure-column','Value',numeric),selectField('measure-column2','Multiply by',numeric),selectField('date-column','Date column',cols,'No date column'),selectField('group-column','Compare groups by',cols),selectField('filter-column','Filter dashboard by',cols,'No filter'),selectField('negative-policy','Negative values',[{value:'include',label:'Include all values'},{value:'exclude',label:'Exclude negative measures'}]))));
  const options=el('details',{class:'field-options'},el('summary',{},'Options'),el('div',{class:'fields'},['date-column','filter-column','negative-policy'].map(id=>$(id).parentElement)));
  const includeText=el('input',{type:'checkbox',id:'include-text-columns'});
  includeText.addEventListener('change',()=>{
    for(const id of ['measure-column','measure-column2']) {
      const select=$(id), previous=select.value;
      const names=measureColumns(dataset.columns,includeText.checked);
      select.replaceChildren(el('option',{value:''},'Choose a column'),names.map(name=>el('option',{value:name},name)));
      select.value=names.includes(previous)?previous:'';
    }
  });
  options.append(el('label',{class:'checkbox-field'},includeText,'Include text columns'));
  panel.querySelector('.clarifications').append(options);
  // Defaults only for the operation, never infer a user's measure from column names.
  $('operation').value='sum';$('negative-policy').value='include';
  const measureFields=()=>{const op=$('operation').value;$('measure-column').required=op!=='count';$('measure-column').parentElement.hidden=op==='count';$('measure-column2').required=op==='product_sum';$('measure-column2').parentElement.hidden=op!=='product_sum';};
  $('operation').addEventListener('change',measureFields);measureFields();
}
async function importCSV() {
  const file=$('csv').files[0];if(!file)return;
  if(file.size===0)throw new Error('This file is empty. Choose another file.');
  dataset=null;$('profile').hidden=true;$('profile').replaceChildren();
  const generation=epoch;busy=true;updateConnection();notify(`Importing ${file.name}…`);
  try {const result=await api.upload(file);if(generation!==epoch)return;dataset=result;if(dataset.kind==='document'){$('profile').hidden=false;$('profile').replaceChildren(el('h3',{},dataset.name));}else renderProfile();$('notice').hidden=true;}
  finally{if(generation===epoch){busy=false;updateConnection();}}
}
async function createTask(event) {
  event.preventDefault();if(busy)throw new Error('Wait for the current local operation to finish.');if(!api.connected){view('connection');return;}
  if(!dataset)throw new Error('Choose a file first.');
  if(!$('task').value.trim())throw new Error('Describe what you want to understand.');
  if(dataset.kind==='document'){const result=await api.post('/api/tasks',{documentId:dataset.id,request:$('task').value.trim()});currentTask=result.taskId;selectActivityTask(currentTask);sample=false;await watchJob(result.jobId);return;}
  const operation=$('operation').value;
  if(!$('group-column').value || (operation!=='count'&&!$('measure-column').value) || (operation==='product_sum'&&!$('measure-column2').value))throw new Error('Choose the measure and group columns before continuing.');
  const result=await api.post('/api/tasks',{request:$('task').value.trim(),datasetId:dataset.id,measure:{operation,column:$('measure-column').value||undefined,column2:operation==='product_sum'?$('measure-column2').value:undefined},dateColumn:$('date-column').value||null,groupColumn:$('group-column').value,filterColumn:$('filter-column').value||null,negativePolicy:$('negative-policy').value,reuseRecipe:false});
  sample=false;currentTask=result.taskId;selectActivityTask(currentTask);await watchJob(result.jobId);
}
async function watchJob(id,taskId=currentTask) {
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
          if(job.taskId || taskId)await loadTask(job.taskId||taskId);
          health=await api.get('/api/health');renderRuntime();await refreshSavedCount();
          $('notice').hidden=true;panel.hidden=true;
        }else notify(job.error || `Job ${job.status}. You can retry from your saved task.`,job.status!=='cancelled');
      }else timer=setTimeout(poll,1000);
    }catch(error){busy=false;updateConnection();panel.append(el('p',{},'Connection interrupted. The local job may still be running. Reconnect and check Activity before starting another.'));notify(error.message,true);}
  };
  await poll();
}
async function watchEvaluation(taskId,initialJobId) {
  clearTimeout(timer);busy=true;updateConnection();renderRuntime();
  const generation=epoch;let polling=false;
  const poll=async()=>{
    if(generation!==epoch || polling)return;polling=true;
    try {
      const task=await api.get(`/api/tasks/${encodeURIComponent(taskId)}`);
      const state=await api.get('/api/state');if(generation!==epoch)return;
      const evaluation=task.evaluation;
      const active=state.jobs?.filter(j=>j.taskId===taskId&&['queued','running'].includes(j.status)).at(-1);
      const jobId=active?.id||initialJobId;activeJob=jobId;
      const panel=$('job-panel');panel.hidden=false;
      panel.replaceChildren(el('div',{class:'runtime-row'},el('div',{},el('h2',{},'Evaluating your setup'),el('p',{},`${evaluation?.stage||'Starting'} · ${active?.stage||'Checking measured results'}`)),el('button',{class:'secondary',disabled:!active,onClick:()=>run(async()=>{await api.post(`/api/jobs/${encodeURIComponent(jobId)}/cancel`);notify('Evaluation cancellation requested.');})},'Cancel evaluation')));
      if(evaluation&&['complete','failed','cancelled'].includes(evaluation.stage)){
        busy=false;activeJob=null;updateConnection();renderRuntime();await loadTask(taskId);
        notify(evaluation.stage==='complete'?'Evaluation finished. The measured comparison is below.':evaluation.error||`Evaluation ${evaluation.stage}.`,evaluation.stage!=='complete');
      }else timer=setTimeout(poll,1000);
    }catch(error){busy=false;updateConnection();notify(error.message,true);}finally{polling=false;}
  };
  await poll();
}
async function loadTask(id) {
  const generation=epoch, load=++taskLoad;const task=await api.get(`/api/tasks/${encodeURIComponent(id)}`);if(generation!==epoch||load!==taskLoad)return;
  $('dashboard').replaceChildren();$('dashboard').hidden=true;
  currentTask=task.id;selectActivityTask(currentTask);sample=false;
  if(task.documentResult){renderDocument(task);return;}
  if(task.dashboard)renderDashboard(task.dashboard,task.evaluation,'',task.fineTune,task.liveReport);else notify(task.error||`Saved task is ${task.status}.`);
}
function renderDocument(task) {
  const panel=$('dashboard');panel.hidden=false;$('setup-workbench').hidden=true;$('workspace-heading').hidden=true;$('edit-setup').hidden=false;
  const result=task.documentResult;
  panel.replaceChildren(el('h2',{id:'dashboard-title'},result.name),el('h3',{},task.request),...result.parts.map(part=>el('section',{class:'document-answer'},result.parts.length>1?el('h3',{},`Excerpt ${part.part} of ${result.parts.length}`):null,el('p',{},part.answer))));
  const form=el('form',{class:'followup'},el('input',{required:true,maxlength:2000,'aria-label':'Document question',placeholder:'Ask a follow-up'}),el('button',{type:'submit',class:'primary',disabled:busy},'Ask'));
  form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const result=await api.post(`/api/tasks/${encodeURIComponent(task.id)}/followup`,{request:form.querySelector('input').value.trim()});currentTask=result.taskId;selectActivityTask(currentTask);await watchJob(result.jobId);});});
  panel.append(form,el('details',{class:'source-note'},el('summary',{},'Source'),el('p',{},`${result.characters} characters · ${result.model} · Read locally. Excerpts are answered independently; no whole-document aggregation.`)));
}
function renderDashboard(data,evaluation=null,filterValue='',fineTune=null,liveReport=null) {
  const candy=data.source?.measure?.column==='winpercent'&&data.source?.groupColumn==='competitorname';
  const focusResult=$('setup-workbench').contains(document.activeElement);
  $('setup-workbench').hidden=true;$('workspace-heading').hidden=true;$('edit-setup').hidden=false;
  const panel=$('dashboard');
  const reportOpen=Boolean(liveReport)||Boolean(panel.querySelector('[data-workflow=report]')?.open);
  const improveOpen=Boolean(panel.querySelector('[data-workflow=improve]')?.open);
  panel.hidden=false;panel.replaceChildren();
  const tools=el('div',{class:'dashboard-tools'});
  const filter=data.filters?.[0];
  if(filter){const select=el('select',{id:'dashboard-filter','aria-label':`Filter by ${filter.column}`},el('option',{value:''},'All groups'),filter.values.map(v=>el('option',{value:v},v)));select.value=filterValue;
    select.addEventListener('change',()=>run(async()=>{const value=select.value;if(sample){renderDashboard(sampleDashboard(value),null,value);return;}select.disabled=true;try {const updated=await api.post(`/api/tasks/${encodeURIComponent(currentTask)}/dashboard`,{filter:value?{column:filter.column,value}:null});renderDashboard(updated,evaluation,value,fineTune,liveReport);}finally{select.disabled=false;}}));tools.append(el('label',{for:'dashboard-filter'},filter.column),select);}
  panel.append(el('div',{class:'dashboard-heading'},el('div',{},sample?el('span',{class:'badge'},'Fictional data'):null,el('h2',{id:'dashboard-title',tabindex:'-1'},sample?'Sample dashboard':data.source?.name||'Dashboard')),tools));
  if(focusResult)$('dashboard-title').focus({preventScroll:true});
  panel.append(el('div',{class:'kpis'},(data.kpis||[]).map(k=>el('div',{class:'kpi'},el('small',{},k.label),el('strong',{},number(k.value))))));
  panel.append(el('div',{class:'charts'},(data.charts||[]).map(chartView)));
  const source=data.source||{};
  const measure=typeof source.measure==='string'?source.measure:source.measure?`${{sum:'Sum of',mean:'Average of',count:'Count of rows',product_sum:'Sum of'}[source.measure.operation]||source.measure.operation} ${source.measure.operation==='count'?'':source.measure.column||''}${source.measure.column2?' × '+source.measure.column2:''}`:'Measure not reported';
  panel.append(el('details',{class:'source-note'},el('summary',{},'Source and measure'),el('p',{},`${number(source.filteredRows??source.rows)} of ${number(source.rows)} rows · ${measure} · Negative values: ${source.negativePolicy||'as supplied'}. ${sample?'Fictional data included with this preview. No model was run.':`Model: ${data.model?.id||'not reported'} · Configuration: ${data.configuration||'not reported'}.`}`)));
  if(sample)return;
  const followup=el('form',{class:'followup'},el('label',{class:'sr-only',for:'followup'},'Ask a follow-up'),el('input',{id:'followup',required:true,maxlength:2000,placeholder:'What else would you like to understand?'}),el('button',{class:'primary',type:'submit',disabled:busy},'Ask a follow-up →'));
  followup.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const result=await api.post(`/api/tasks/${encodeURIComponent(currentTask)}/followup`,{request:$('followup').value.trim()});currentTask=result.taskId;selectActivityTask(currentTask);await watchJob(result.jobId);});});if(!candy)panel.append(followup);
  const evalPanel=el('section',{class:'evaluation'},el('h3',{},'Reporting evaluation'),el('button',{class:'secondary',disabled:busy,onClick:()=>run(async()=>{const result=await api.post(`/api/tasks/${encodeURIComponent(currentTask)}/evaluate`);await watchEvaluation(currentTask,result.jobId);})},evaluation?'Run evaluation again':'Run reporting experiment'));
  evalPanel.append(el('dl',{},el('dt',{},'Data'),el('dd',{},'Synthetic benchmark'),el('dt',{},'Changes'),el('dd',{},'Prompt only')));
  evalPanel.append(el('details',{},el('summary',{},'Business rules used in this experiment'),el('p',{},'Revenue includes returns and excludes POST/ADJUST entries. Average order value divides net merchandise revenue by distinct order IDs, including return orders. Product rankings use net revenue. Profit needs cost data. Explicit question overrides take precedence. These are authored demo rules.')));
  if(evaluation){
    if(!evaluation.benchmark)evalPanel.append(el('p',{class:'muted'},'Saved results below are from the previous operation-selection check. Run the reporting experiment to measure the new business-rule benchmark.'));
    const score=rows=>{const final=(rows||[]).filter(r=>r.split==='final');return final.length?`${final.filter(r=>r.passed).length} / ${final.length} held-out checks passed`:'Not measured yet';};
    evalPanel.append(el('p',{class:'muted'},`Baseline: ${score(evaluation.baseline)}. Candidate: ${score(evaluation.tuned)}. Selected configuration: ${evaluation.selected||'comparison in progress'}.`),el('details',{},el('summary',{},'View measured evaluation results'),el('pre',{},JSON.stringify(evaluation,null,2))));
    if(evaluation.benchmark){
      const examples=el('details',{},el('summary',{},'Compare answers on unseen questions'));
      for(const row of (evaluation.baseline||[]).filter(r=>r.split==='final')){
        const candidate=(evaluation.tuned||[]).find(r=>r.id===row.id);
        examples.append(el('div',{class:'source-note'},el('h4',{},row.request),el('p',{},`Baseline: ${row.passed?'passed':row.failure}. Candidate: ${candidate?(candidate.passed?'passed':candidate.failure):'pending'}.`),el('p',{},`Expected answer: ${JSON.stringify(row.expectedAnswer)} · Baseline answer: ${JSON.stringify(row.answer)} · Candidate answer: ${candidate?JSON.stringify(candidate.answer):'pending'}`)));
      }
      evalPanel.append(examples);
    }
  }

  const trainingPanel=el('section',{class:'evaluation'},el('h3',{},candy?'Train candy-reporting adapter':'Train reporting adapter'),el('dl',{},el('dt',{},'Data'),el('dd',{},'Synthetic benchmark'),el('dt',{},'Time limit'),el('dd',{},'16 minutes'),el('dt',{},'Requires'),el('dd',{},'MLX model setup')),el('button',{class:'secondary',disabled:busy,onClick:()=>run(async()=>{const result=await api.post(`/api/tasks/${encodeURIComponent(currentTask)}/finetune`,{});await watchJob(result.jobId);})},'Run weight fine-tuning'));
  if(fineTune)trainingPanel.append(el('p',{},`Untuned: ${fineTune.baseline.score}/${fineTune.total}. Adapter: ${fineTune.adapted.score}/${fineTune.total}. Selected: ${fineTune.selected}. Training and evaluation: ${Math.round(fineTune.elapsedSeconds)} seconds.`),el('p',{class:'muted'},'Experimental reporting adapter; not applied to the CSV dashboard planner.'),el('details',{},el('summary',{},'Weights and measured results'),el('pre',{},JSON.stringify(fineTune,null,2))));
  const reportPanel=el('section',{class:'evaluation'},el('h3',{},candy?'Candy report':'Retail report'),el('details',{},el('summary',{},'Supported data and rules'),el('p',{},candy?'FiveThirtyEight · 85 entries including coin comparison items · CC BY 4.0. Win rate measures head-to-head preferences. Sugar and price are relative percentiles, not grams or dollars. Questions can select chocolate or fruity entries; the dashboard filter above does not change this report.':'Whole-file retail reports: revenue, average order value, order count, or top products. No date or country filters. Default columns: InvoiceNo, StockCode, Quantity, UnitPrice. Rows missing these fields are excluded. Retail policy excludes POST, ADJUST, DOT, D, M, C2, BANK CHARGES, AMAZONFEE, B and CRUK. Samples and unrecognized codes remain included.')));
  const reportForm=el('form',{class:'followup'},el('input',{id:'adapter-question',required:true,maxlength:2000,placeholder:candy?'Which chocolate candies are most popular?':'What is our average order value?','aria-label':'Fine-tuned reporting question'}),el('button',{class:'primary',type:'submit',disabled:busy},'Run trained adapter'));
  reportForm.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const result=await api.post(`/api/tasks/${encodeURIComponent(currentTask)}/report`,{request:$('adapter-question').value.trim(),...(candy?{subset:$('candy-subset').value}:{})});await watchJob(result.jobId);});});
  if(candy){const subset=el('select',{id:'candy-subset','aria-label':'Confirmed candy filter'},...['all','chocolate','fruity'].map(value=>el('option',{value},value==='all'?'All entries':value==='chocolate'?'Chocolate only':'Fruity only')));subset.value=liveReport?.confirmedSubset||'all';reportPanel.append(el('label',{for:'candy-subset'},'Confirm the candy selection'),subset,el('p',{class:'muted'},'This selector controls the filter. Natural-language filter recognition is experimental.'));}
  reportPanel.append(reportForm);
  if(candy){
    const prompts=['Which chocolate candies are most popular?','Compare chocolate and non-chocolate average popularity.','Rank the cheapest fruity candies.','How many grams of sugar are in each candy?'];
    reportPanel.append(el('div',{class:'dashboard-tools'},...prompts.map(request=>el('button',{class:'secondary',disabled:busy,onClick:()=>{$('adapter-question').value=request;$('candy-subset').value=request.startsWith('Which chocolate')?'chocolate':request.includes('fruity')?'fruity':'all';reportForm.requestSubmit();}},request))));
    reportPanel.append(el('a',{href:'https://github.com/fivethirtyeight/data/tree/master/candy-power-ranking',target:'_blank',rel:'noopener'},'Dataset source and definitions'));
  }
  if(liveReport)reportPanel.append(el('h4',{},liveReport.request),el('p',{},liveReport.clarification||`${liveReport.plan.metric||liveReport.plan.operation}: ${typeof liveReport.answer==='number'?number(liveReport.answer):liveReport.answer===null?'No matching data':'Top products listed below'}`),el('p',{class:'muted'},candy?`Measure: ${liveReport.plan.measure}. Selection: ${liveReport.plan.subset}. ${liveReport.unit||'Clarification required'}. Source: ${liveReport.sourceRows??data.source.rows} entries. Calculated from the real CSV using the candy model plan.`:`Returns: ${liveReport.plan.returns}. Scope: ${liveReport.plan.scope}. ${liveReport.clarification?'No calculation run.':`${liveReport.includedRows} included rows of ${liveReport.sourceRows}.`} Uses the trained adapter; calculations run locally.`),el('details',{},el('summary',{},'Source, policy and model evidence'),el('pre',{},JSON.stringify(liveReport,null,2))));
  if(candy&&liveReport?.confirmedSubset&&liveReport.modelPlan?.subset!==liveReport.plan.subset)reportPanel.append(el('p',{class:'muted'},`Confirmed filter applied: ${liveReport.plan.subset}. The model originally selected ${liveReport.modelPlan.subset}.`));
  if(Array.isArray(liveReport?.answer)){if(candy)reportPanel.append(chartView({title:liveReport.unit,kind:'bar',points:liveReport.answer}));else reportPanel.append(el('ol',{},...liveReport.answer.map(row=>el('li',{},`${row.product}: ${number(row.revenue)}`))));}
  panel.append(el('details',{class:'workflow-disclosure','data-workflow':'report',open:reportOpen},el('summary',{},candy?'Candy report':'Retail report'),reportPanel),el('details',{class:'workflow-disclosure','data-workflow':'improve',open:improveOpen},el('summary',{},'Improve model'),...(candy?[]:[evalPanel]),trainingPanel));
}
async function refreshSavedCount(){const generation=epoch;const state=await api.get('/api/state');if(generation===epoch)$('saved-count').textContent=String(state.tasks?.length||0);return state;}
async function renderSaved() {
  const panel=$('saved-list');panel.replaceChildren(el('p',{class:'empty'},api.connected?'Loading saved tasks…':'Connect your Mac'));
  if(!api.connected)return;const state=await refreshSavedCount();panel.replaceChildren();
  if(!state.tasks?.length)panel.append(el('p',{class:'empty'},'No saved tasks'));
  for(const task of state.tasks||[])panel.append(el('div',{class:'task-row'},el('div',{},el('h3',{},task.request||task.id),el('p',{},`${task.status} · ${task.id}`)),el('button',{class:'secondary',onClick:()=>run(async()=>{await loadTask(task.id);view('workspace');$('dashboard').scrollIntoView({block:'start'});})},'Open task')));
}
async function renderActivity() { /* Live monitor is owned by the activity observer. */ }
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view(button.dataset.view);run(async()=>{if(button.dataset.view==='saved')await renderSaved();if(button.dataset.view==='activity')await renderActivity();});}));
$('connection-link').addEventListener('click',()=>view('connection'));
$('edit-setup').addEventListener('click',()=>{$('setup-workbench').hidden=false;$('workspace-heading').hidden=false;$('edit-setup').hidden=true;$('task').focus();});
$('task-form').addEventListener('submit',event=>run(()=>createTask(event)));
$('csv').addEventListener('change',()=>run(importCSV));
$('sample-button').addEventListener('click',()=>{taskLoad++;sample=true;selectActivityTask(null);renderDashboard(sampleDashboard());$('dashboard').scrollIntoView({block:'start',behavior:'smooth'});});
$('pair-form').addEventListener('submit',event=>{event.preventDefault();run(()=>pair($('pair-token').value));});
$('retry-connection').addEventListener('click',()=>run(async()=>{health=await api.get('/api/health');updateConnection();renderRuntime();notify('Your local companion is reachable.');}));
$('disconnect').addEventListener('click',disconnect);
window.addEventListener('pagehide',disconnect);
updateConnection();
// Both hosted and same-origin pages require explicit token pairing.

// Store only the visual preference; pairing and task data remain in memory.
const halloweenSwitch=$('halloween-mode');
function setHalloweenMode(enabled) {
  document.documentElement.dataset.theme=enabled?'halloween':'default';
  halloweenSwitch.checked=enabled;
  document.querySelector('meta[name="theme-color"]').content=enabled?'#221c29':'#f7f7f2';
}
try {setHalloweenMode(localStorage.getItem('local-lab-halloween')==='true');} catch {setHalloweenMode(false);}
halloweenSwitch.addEventListener('change',()=>{
  setHalloweenMode(halloweenSwitch.checked);
  try {localStorage.setItem('local-lab-halloween',String(halloweenSwitch.checked));} catch { /* Theme still works without storage. */ }
});
