import {element as el} from './dashboard.js';

const phases=['Checking the starting model','Learning from examples','Testing the result','Saving your tool'];
const terminal=new Set(['ready','failed','cancelled','interrupted']);
const scope='Whole-file revenue, average order value, order counts and product rankings. Profit needs cost data. Date, country and custom filters are not supported.';
export function buildProgress(job,previous=0){
  if(job.status==='queued')return {phase:0,title:'Waiting for this Mac',description:'Your task is saved in the local queue. It starts when the device is available.',count:''};
  let phase=previous,count='',title=phases[phase],description='Working on this Mac. You can stop safely.';
  // Worker log lines are diagnostics, never interface copy. Look back to the last known phase.
  for(const text of [...(job.events||[]).map(e=>e.summary),job.stage].filter(s=>typeof s==='string')){
    let match;
    if((match=text.match(/Evaluating unchanged base model:\s*(\d+)\/(\d+)/i))){phase=0;title=phases[0];description='Testing how the original model understands sales questions.';count=`${match[1]} of ${match[2]} checks`;}
    else if(/Evaluating the unchanged base model/i.test(text)){phase=0;title=phases[0];description='Testing how the original model understands sales questions.';count='';}
    else if((match=text.match(/Learning from local examples\s*·\s*(\d+) of (\d+)/i))){phase=1;title=phases[1];description='Adapting the model using local practice questions, not your CSV rows.';count=`${match[1]} of ${match[2]} learning steps`;}
    else if(/Adapting weights|Training task-specific|Learning from local examples/i.test(text)){phase=1;title=phases[1];description='Adapting the model using local practice questions, not your CSV rows.';count='';}
    else if((match=text.match(/Evaluating trained candidate:\s*(\d+)\/(\d+)/i))){phase=2;title=phases[2];description='Comparing the new version with the original, including important safety checks.';count=`${match[1]} of ${match[2]} checks`;}
    else if(/Evaluating the trained candidate/i.test(text)){phase=2;title=phases[2];description='Comparing the new version with the original, including important safety checks.';count='';}
    else if(/Checking saved weights|Training review complete/i.test(text)){phase=3;title=phases[3];description='Saving the tested model and task rules together on this Mac.';count='';}
    else if(/Downloading.*model/i.test(text)){phase=0;title='Downloading the starting model';description='Downloading the model you approved. Your CSV stays on this Mac.';count='';}
    else if(/Downloading|Installing|Preparing.*runtime/i.test(text)){phase=0;title='Preparing this Mac';description='Setting up the local learning components you approved.';count='';}
    else if(/Verifying.*model|Checking.*runtime/i.test(text)){phase=0;title=phases[0];description='Checking the local files before learning starts.';count='';}
  }
  const match=count.match(/^(\d+) of (\d+) /);
  const completed=match?Number(match[1]):null,total=match?Number(match[2]):null;
  const progress=Number.isSafeInteger(completed)&&Number.isSafeInteger(total)&&total>0&&completed>=0&&completed<=total?{completed,total}:null;
  if(count&&!progress)count='';
  return {phase,title,description,count,progress};
}
export function buildOutcome(tool){
  if(tool?.status!=='ready'||!tool.binding||!['adapter','base'].includes(tool.selected)&&tool.selected!=='baseline')return null;
  return {title:'Your tool is ready',description:tool.selected==='adapter'?'Your tool passed its checks and is ready to use.':'The tuned version did not pass all improvement checks, so your tool uses the original model.',scope};
}
export function toolBuildView(api,{onBusy=()=>{},onCreated=()=>{},onOpen=()=>{},onSaved=()=>{},onEdit=()=>{},onShowSaved=()=>{}}={}){
  let generation=0,timer,jobId=null,taskId=null,body=null,context={},lastPhase=0,stopRequested=false,stopSending=false,finished=false,polling=false,announceKey='',lastJob=null;
  const heading=el('h1',{id:'build-title',tabindex:'-1'},'Starting on this Mac');
  const description=el('p',{class:'build-description'});
  const count=el('p',{class:'build-count','aria-live':'off'});
  const fill=el('span',{class:'build-phase-fill'});
  const track=el('div',{class:'build-phase-track',role:'progressbar','aria-label':'Current step progress','aria-valuemin':'0','aria-live':'off',hidden:true},fill);
  const feedback=el('div',{class:'build-feedback','data-motion':'idle'},count,track);
  let progressPhase=null,progressValue=null;
  function motion(mode,current=null){
    const counted=mode==='active'&&current?.progress;
    const next=counted?'counted':mode;
    if(feedback.dataset.motion!==next)feedback.dataset.motion=next;
    track.hidden=!counted;
    feedback.setAttribute('aria-hidden',counted?'false':'true');
    if(counted){
      const {completed,total}=current.progress;
      track.setAttribute('aria-label',`${current.title}, this step only`);track.setAttribute('aria-valuemax',String(total));track.setAttribute('aria-valuenow',String(completed));track.setAttribute('aria-valuetext',`${current.count}, this step only`);
      const value=`${current.phase}:${completed}/${total}`;
      if(progressValue!==value){
        if(progressPhase!==current.phase)fill.style.transition='none';else fill.style.removeProperty('transition');
        fill.style.transform=`scaleX(${completed/total})`;progressPhase=current.phase;progressValue=value;
      }
    }else{
      for(const attr of ['aria-valuemax','aria-valuenow','aria-valuetext'])track.removeAttribute(attr);
      progressPhase=progressValue=null;fill.style.transition='none';fill.style.transform='scaleX(0)';
    }
  }
  const stepLabel=el('p',{class:'build-step-label'},'Getting ready');
  const liveStatus=el('header',{class:'build-live-status'},stepLabel,heading,description);
  let transitionKey='',transitionEffect=null;
  function changed(key,label){
    if(stepLabel.textContent!==label)stepLabel.textContent=label;
    if(key===transitionKey)return;
    transitionKey=key;transitionEffect?.cancel();
    if(!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
      transitionEffect=liveStatus.animate?.([{opacity:.35,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.22,1,.36,1)'});
    }
  }
  const announcement=el('p',{class:'sr-only',role:'status','aria-live':'polite','aria-atomic':'true'});
  const task=el('p',{class:'build-task'});
  const steps=el('ol',{class:'build-phases','aria-label':'All creation steps'},...phases.map((label,i)=>el('li',{},el('span',{class:'build-step-number','aria-hidden':'true'},String(i+1)),el('span',{},label),el('span',{class:'build-step-state'},'Next'))));
  const allSteps=el('details',{class:'build-steps-disclosure'},el('summary',{},'View all steps'),steps);
  const stop=el('button',{type:'button',class:'secondary','data-action':'stop-build'},'Stop');
  const open=el('button',{type:'button',class:'primary',hidden:true,'data-action':'open-tool'},'Open saved tool');
  const retry=el('button',{type:'button',class:'primary',hidden:true,'data-action':'retry-build'},'Try again');
  const reconnect=el('button',{type:'button',class:'primary',hidden:true,'data-action':'reconnect-build'},'Retry connection');
  const edit=el('button',{type:'button',class:'secondary',hidden:true,'data-action':'edit-build'},'Edit setup');
  const saved=el('button',{type:'button',class:'secondary',hidden:true},'View saved tasks');
  const facts=el('pre');
  const details=el('details',{class:'build-diagnostics'},el('summary',{},'Details'),facts);
  const panel=el('section',{class:'tool-build-surface',hidden:true,'aria-labelledby':'build-title'},task,liveStatus,feedback,announcement,el('div',{class:'build-actions'},stop,open,retry,reconnect,edit,saved),allSteps,el('p',{class:'build-local-note'},'On this Mac. Your other tools stay unchanged.'),details);
  function announce(key,text){if(key!==announceKey){announceKey=key;announcement.textContent=text;}}
  function focusStart(){panel.scrollIntoView?.({block:'start'});stop.focus({preventScroll:true});}
  function showRecovery(message,unknown=false){
    motion('paused');clearTimeout(timer);heading.textContent='Connection interrupted';changed('connection','Status unavailable');description.textContent=message;count.textContent='';reconnect.hidden=unknown;saved.hidden=false;stop.hidden=unknown;stop.setAttribute('aria-disabled',unknown?'true':'false');
    announce('connection',unknown?'Could not confirm creation. Check saved tasks before creating another tool.':'Connection interrupted. The task may still be running on this Mac.');
    facts.textContent=JSON.stringify({jobId,taskId,lastJob},null,2);
    // Unknown creation acknowledgement must never become an automatic duplicate POST.
    if(unknown){finished=true;onBusy(false);saved.focus({preventScroll:true});}
  }
  function reset(input,info){
    generation++;clearTimeout(timer);jobId=taskId=null;body=input;context=info;lastPhase=0;stopRequested=stopSending=finished=polling=false;announceKey='';lastJob=null;
    panel.hidden=false;panel.dataset.state='working';motion('waiting');task.textContent=`${info.request||input?.request||'Sales reporting'}${info.file?' · '+info.file:''}`;
    heading.textContent='Starting your tool';description.textContent='Saving your request on this Mac before learning begins.';changed('starting:'+generation,'Getting ready');count.textContent='';
    for(const button of [open,retry,reconnect,edit,saved])button.hidden=true;
    stop.hidden=false;stop.textContent='Stop';stop.setAttribute('aria-disabled','false');allSteps.open=false;steps.querySelectorAll('li').forEach(node=>{node.dataset.state='waiting';node.removeAttribute('aria-current');node.querySelector('.build-step-state').textContent='Next';});
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
    stopRequested=true;motion('stopping');heading.textContent='Stopping…';changed('stopping','Waiting for a safe stop');description.textContent=jobId?'Waiting for the local process to stop safely.':'Waiting for the local queue to acknowledge the request, then stopping it.';count.textContent='';stop.textContent='Stopping…';stop.setAttribute('aria-disabled','true');announce('stopping','Stopping. Waiting for confirmation from this Mac.');void sendStop(generation).then(ok=>{if(ok)void poll(generation);});
  }
  async function finish(job,g){
    if(g!==generation)return;
    motion('paused');
    let recovered=null;
    if(job.status!=='ready'){const tools=await api.get('/api/tools');if(g!==generation)return;recovered=tools.find(t=>t.id===taskId&&buildOutcome(t));}
    if(job.status==='ready'||recovered){
      let tool=recovered||job.result;
      if(!buildOutcome(tool))tool=(await api.get(`/api/tasks/${taskId}`)).toolResult;
      if(g!==generation)return;
      const outcome=buildOutcome(tool);if(!outcome)throw Error('The task finished without a verified saved tool.');
      finished=true;panel.dataset.state='ready';motion('ready');heading.textContent=outcome.title;description.textContent=stopRequested?'The run finished before Stop took effect, and your saved tool is ready to use.':outcome.description;changed('ready','Saved on this Mac');steps.querySelectorAll('li').forEach(node=>{node.dataset.state='complete';node.removeAttribute('aria-current');node.querySelector('.build-step-state').textContent='Done';});open.hidden=false;
    }else{
      finished=true;panel.dataset.state=job.status;motion(job.status==='cancelled'?'stopped':'failed');
      heading.textContent=job.status==='cancelled'?'Stopped':job.status==='interrupted'?'Creation was interrupted':'Your tool could not be created';
      description.textContent=job.status==='cancelled'?'This run stopped safely; your other tools are unchanged.':job.status==='interrupted'?'Your other tools are unchanged; review setup before trying again.':'No new tool was saved; review setup before trying again.';changed('terminal:'+job.status,'No new tool saved');steps.querySelectorAll('[data-state=current]').forEach(node=>{node.dataset.state='stopped';node.removeAttribute('aria-current');node.querySelector('.build-step-state').textContent='Stopped here';});
      retry.hidden=false;edit.hidden=false;
    }
    count.textContent='';stop.hidden=true;reconnect.hidden=true;saved.hidden=true;onBusy(false);
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
      if(stopRequested){motion('stopping');heading.textContent='Stopping…';changed('stopping','Waiting for a safe stop');description.textContent='Waiting for the local process to stop safely.';count.textContent='';}
      else{
        const current=buildProgress(job,lastPhase);lastPhase=current.phase;motion(job.status==='queued'?'waiting':job.status==='running'?'active':'paused',current);heading.textContent=current.title;description.textContent=current.description;count.textContent=current.count;changed(job.status==='queued'?'queued':`step:${current.phase}:${current.title}:${current.description}`,job.status==='queued'?'Waiting to start':`Step ${current.phase+1} of ${phases.length}`);
        steps.querySelectorAll('li').forEach((node,i)=>{node.dataset.state=job.status==='queued'?'waiting':i<lastPhase?'complete':i===lastPhase?'current':'waiting';if(job.status==='running'&&i===lastPhase)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');node.querySelector('.build-step-state').textContent=node.dataset.state==='current'?'Now':node.dataset.state==='complete'?'Done':'Next';});
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
  function dispose(){generation++;clearTimeout(timer);transitionEffect?.cancel();motion('idle');panel.hidden=true;finished=true;onBusy(false);facts.textContent='';}
  return {element:panel,start,resume,dispose,focus:()=>{panel.scrollIntoView?.({block:'start'});(finished?panel.querySelector('.build-actions button:not([hidden])'):stop)?.focus({preventScroll:true});},get active(){return !panel.hidden;}};
}
