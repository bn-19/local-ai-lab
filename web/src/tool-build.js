import {element as el} from './dashboard.js';

const phases=['Check the starting model','Learn from examples','Test the result','Save your tool'];
const terminal=new Set(['ready','failed','cancelled','interrupted']);
const scope='Whole-file revenue, average order value, order counts and product rankings. Profit needs cost data. Date, country and custom filters are not supported.';
export function buildProgress(job,previous=0){
  if(job.status==='queued')return {phase:0,title:'Waiting for this Mac',description:'Your task is saved in the local queue. It starts when the device is available.',count:''};
  let phase=previous,count='',title=phases[phase],description='Working on this Mac. You can stop safely.';
  // Worker log lines are diagnostics, never interface copy. Look back to the last known phase.
  for(const text of [...(job.events||[]).map(e=>e.summary),job.stage].filter(s=>typeof s==='string')){
    let match;
    if((match=text.match(/Evaluating unchanged base model:\s*(\d+)\/(\d+)/i))){phase=0;title='Check the starting model';description='Testing how the original model understands sales questions.';count=`${match[1]} of ${match[2]} checks`;}
    else if(/Evaluating the unchanged base model/i.test(text)){phase=0;title=phases[0];description='Testing how the original model understands sales questions.';count='';}
    else if((match=text.match(/Learning from local examples\s*·\s*(\d+) of (\d+)/i))){phase=1;title=phases[1];description='Adapting the model using local practice questions, not your CSV rows.';count=`${match[1]} of ${match[2]} learning steps`;}
    else if(/Adapting weights|Training task-specific|Learning from local examples/i.test(text)){phase=1;title=phases[1];description='Adapting the model using local practice questions, not your CSV rows.';count='';}
    else if((match=text.match(/Evaluating trained candidate:\s*(\d+)\/(\d+)/i))){phase=2;title=phases[2];description='Comparing the new version with the original, including important safety checks.';count=`${match[1]} of ${match[2]} checks`;}
    else if(/Evaluating the trained candidate/i.test(text)){phase=2;title=phases[2];description='Comparing the new version with the original, including important safety checks.';count='';}
    else if(/Checking saved weights|Training review complete/i.test(text)){phase=3;title=phases[3];description='Saving the tested model and task rules together on this Mac.';count='';}
    else if(/Downloading.*model/i.test(text)){phase=0;title='Download the starting model';description='Downloading the model you approved. Your CSV stays on this Mac.';count='';}
    else if(/Downloading|Installing|Preparing.*runtime/i.test(text)){phase=0;title='Prepare this Mac';description='Setting up the local learning components you approved.';count='';}
    else if(/Verifying.*model|Checking.*runtime/i.test(text)){phase=0;title=phases[0];description='Checking the local files before learning starts.';count='';}
  }
  return {phase,title,description,count};
}
export function buildOutcome(tool){
  if(tool?.status!=='ready'||!tool.binding||!['adapter','base'].includes(tool.selected)&&tool.selected!=='baseline')return null;
  return {title:'Your tool is ready',description:tool.selected==='adapter'?'The tuned version passed the checks and is saved on this Mac.':'We tested a tuned version and kept the original model because the new version did not pass all improvement checks.',scope};
}
export function toolBuildView(api,{onBusy=()=>{},onCreated=()=>{},onOpen=()=>{},onSaved=()=>{},onEdit=()=>{},onShowSaved=()=>{}}={}){
  let generation=0,timer,jobId=null,taskId=null,body=null,context={},lastPhase=0,stopRequested=false,stopSending=false,finished=false,polling=false,announceKey='',lastJob=null;
  const heading=el('h1',{id:'build-title',tabindex:'-1'},'Starting on this Mac');
  const description=el('p',{class:'build-description'});
  const count=el('p',{class:'build-count','aria-live':'off'});
  const announcement=el('p',{class:'sr-only',role:'status','aria-live':'polite','aria-atomic':'true'});
  const task=el('p',{class:'build-task'});
  const steps=el('ol',{class:'build-phases','aria-label':'Tool creation phases'},...phases.map(label=>el('li',{},el('span',{class:'build-step-mark','aria-hidden':'true'}),label)));
  const stop=el('button',{type:'button',class:'secondary','data-action':'stop-build'},'Stop');
  const open=el('button',{type:'button',class:'primary',hidden:true,'data-action':'open-tool'},'Open saved tool');
  const retry=el('button',{type:'button',class:'primary',hidden:true,'data-action':'retry-build'},'Try again');
  const reconnect=el('button',{type:'button',class:'primary',hidden:true,'data-action':'reconnect-build'},'Retry connection');
  const edit=el('button',{type:'button',class:'secondary',hidden:true,'data-action':'edit-build'},'Edit setup');
  const saved=el('button',{type:'button',class:'secondary',hidden:true},'View saved tasks');
  const facts=el('pre');
  const details=el('details',{class:'build-diagnostics'},el('summary',{},'Details'),facts);
  const panel=el('section',{class:'tool-build-surface',hidden:true,'aria-labelledby':'build-title'},el('p',{class:'eyebrow'},'CREATING YOUR TOOL'),heading,task,steps,description,count,announcement,el('div',{class:'build-actions'},stop,open,retry,reconnect,edit,saved),el('p',{class:'build-local-note'},'Runs on this Mac. Existing saved tools are kept separately.'),details);
  function announce(key,text){if(key!==announceKey){announceKey=key;announcement.textContent=text;}}
  function focusStart(){panel.scrollIntoView?.({block:'start'});stop.focus({preventScroll:true});}
  function showRecovery(message,unknown=false){
    clearTimeout(timer);heading.textContent='Connection interrupted';description.textContent=message;count.textContent='';reconnect.hidden=unknown;saved.hidden=false;stop.hidden=unknown;stop.setAttribute('aria-disabled',unknown?'true':'false');
    announce('connection',unknown?'Could not confirm creation. Check saved tasks before creating another tool.':'Connection interrupted. The task may still be running on this Mac.');
    facts.textContent=JSON.stringify({jobId,taskId,lastJob},null,2);
    // Unknown creation acknowledgement must never become an automatic duplicate POST.
    if(unknown){finished=true;onBusy(false);saved.focus({preventScroll:true});}
  }
  function reset(input,info){
    generation++;clearTimeout(timer);jobId=taskId=null;body=input;context=info;lastPhase=0;stopRequested=stopSending=finished=polling=false;announceKey='';lastJob=null;
    panel.hidden=false;panel.dataset.state='working';task.textContent=`${info.request||input?.request||'Sales reporting'}${info.file?' · '+info.file:''}`;
    heading.textContent='Starting on this Mac';description.textContent='Saving your request to the local queue. You can stop before learning begins.';count.textContent='';
    for(const button of [open,retry,reconnect,edit,saved])button.hidden=true;
    stop.hidden=false;stop.textContent='Stop';stop.setAttribute('aria-disabled','false');steps.hidden=false;steps.querySelectorAll('li').forEach((node,i)=>{node.dataset.state=i===0?'current':'waiting';node.removeAttribute('aria-current');});
    onBusy(true);announce('starting','Starting your tool on this Mac.');focusStart();return generation;
  }
  async function sendStop(g){
    if(!jobId||stopSending||finished||g!==generation)return;
    stopSending=true;
    try{await api.post(`/api/jobs/${jobId}/cancel`);if(g===generation){reconnect.hidden=true;return true;}}
    catch{if(g===generation)showRecovery('Could not confirm Stop. The task may still be running. Retry the connection to check and send Stop again.');return false;}
    finally{if(g===generation)stopSending=false;}
  }
  function requestStop(){
    if(finished||stop.getAttribute('aria-disabled')==='true')return;
    stopRequested=true;heading.textContent='Stopping…';description.textContent=jobId?'Waiting for the local process to stop safely.':'Waiting for the local queue to acknowledge the request, then stopping it.';count.textContent='';stop.textContent='Stopping…';stop.setAttribute('aria-disabled','true');announce('stopping','Stopping. Waiting for confirmation from this Mac.');void sendStop(generation).then(ok=>{if(ok)void poll(generation);});
  }
  async function finish(job,g){
    if(g!==generation)return;
    let recovered=null;
    if(job.status!=='ready'){const tools=await api.get('/api/tools');if(g!==generation)return;recovered=tools.find(t=>t.id===taskId&&buildOutcome(t));}
    if(job.status==='ready'||recovered){
      let tool=recovered||job.result;
      if(!buildOutcome(tool))tool=(await api.get(`/api/tasks/${taskId}`)).toolResult;
      if(g!==generation)return;
      const outcome=buildOutcome(tool);if(!outcome)throw Error('The task finished without a verified saved tool.');
      finished=true;panel.dataset.state='ready';heading.textContent=outcome.title;description.textContent=(stopRequested?'The run finished before Stop took effect. ':'')+outcome.description+' '+outcome.scope;open.hidden=false;
    }else{
      finished=true;panel.dataset.state=job.status;
      heading.textContent=job.status==='cancelled'?'Stopped':job.status==='interrupted'?'Creation was interrupted':'Your tool could not be created';
      description.textContent=job.status==='cancelled'?'This run stopped. Your existing saved tools are unchanged.':job.status==='interrupted'?'This run was interrupted before a new tool was saved. Your existing tools are unchanged. Review setup and try again.':'No new tool was saved by this run. Your existing tools are unchanged. Review setup, then try again.';
      retry.hidden=false;edit.hidden=false;
    }
    count.textContent='';steps.hidden=true;stop.hidden=true;reconnect.hidden=true;saved.hidden=true;onBusy(false);
    announce('terminal',`${heading.textContent}. ${description.textContent}`);
    (!open.hidden?open:retry).focus({preventScroll:true});
    Promise.resolve(onSaved()).catch(()=>{});
  }
  async function poll(g){
    if(g!==generation||finished||polling||!jobId)return;
    clearTimeout(timer);polling=true;
    try{
      const job=await api.get(`/api/jobs/${jobId}`);if(g!==generation)return;lastJob=job;
      facts.textContent=JSON.stringify({jobId,taskId,job},null,2);
      if(terminal.has(job.status)){await finish(job,g);return;}
      if(job.cancel&&!stopRequested){stopRequested=true;stop.textContent='Stopping…';stop.setAttribute('aria-disabled','true');}
      if(stopRequested){heading.textContent='Stopping…';description.textContent='Waiting for the local process to stop safely.';count.textContent='';}
      else{
        const current=buildProgress(job,lastPhase);lastPhase=current.phase;heading.textContent=current.title;description.textContent=current.description;count.textContent=current.count;
        steps.querySelectorAll('li').forEach((node,i)=>{node.dataset.state=i<lastPhase?'complete':i===lastPhase?'current':'waiting';if(i===lastPhase)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
        announce(`${job.status}:${current.phase}`,`${current.title}. ${current.description}`);
      }
      timer=setTimeout(()=>void poll(g),1000);
    }catch{if(g===generation)showRecovery('We cannot check the task right now. It may still be running on this Mac. Retry the connection to recover its saved status.');}
    finally{if(g===generation)polling=false;}
  }
  stop.addEventListener('click',requestStop);
  reconnect.addEventListener('click',()=>{reconnect.hidden=true;if(stopRequested){stop.setAttribute('aria-disabled','true');void sendStop(generation).then(ok=>{if(ok)void poll(generation);});}void poll(generation);});
  open.addEventListener('click',()=>onOpen(taskId));
  retry.addEventListener('click',()=>void start(body,context));
  edit.addEventListener('click',()=>{dispose();onEdit();});saved.addEventListener('click',onShowSaved);
  async function start(input,info={}){
    if(!panel.hidden&&!finished)return;
    const g=reset(input,info);
    try{const created=await api.post('/api/tools',input);if(g!==generation)return;jobId=created.jobId;taskId=created.taskId;onCreated(created);if(stopRequested&&!await sendStop(g))return;await poll(g);}
    catch{if(g===generation)showRecovery('We could not confirm whether the request reached this Mac. Check saved tasks before creating another tool.',true);}
  }
  function resume(job,info,input){const g=reset(input,info);jobId=job.id;taskId=job.taskId;onCreated({taskId,jobId});void poll(g);}
  function dispose(){generation++;clearTimeout(timer);panel.hidden=true;finished=true;onBusy(false);facts.textContent='';}
  return {element:panel,start,resume,dispose,focus:()=>{panel.scrollIntoView?.({block:'start'});(finished?panel.querySelector('.build-actions button:not([hidden])'):stop)?.focus({preventScroll:true});},get active(){return !panel.hidden;}};
}
