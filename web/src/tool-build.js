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
// A small assembly instrument: motion acknowledges real state changes, never elapsed time.
export function toolAssemblyView(){
  const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  const image=svg('svg',{viewBox:'0 0 128 116',focusable:'false'});
  const pieces=[],contacts=[];
  for(let i=0;i<3;i++){
    const layer=svg('g',{transform:`translate(0 ${(2-i)*23})`,'data-layer':i});
    const piece=svg('g',{class:'assembly-piece'});
    piece.append(svg('path',{d:'M18 31 64 53 110 31v8L64 61 18 39Z',class:'assembly-edge'}),svg('path',{d:'M64 9 110 31 64 53 18 31Z',class:'assembly-face'}));
    const dots=[svg('circle',{cx:48,cy:31,r:2.5}),svg('circle',{cx:64,cy:23,r:2.5}),svg('circle',{cx:80,cy:31,r:2.5})];
    for(const dot of dots){dot.setAttribute('class','assembly-contact');piece.append(dot);}
    layer.append(piece);image.append(layer);pieces.push({layer,piece});contacts.push(dots);
  }
  const seal=svg('g',{class:'assembly-seal'});seal.append(svg('path',{d:'m54 30 8 8 15-17',fill:'none','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));image.append(seal);
  const element=el('div',{class:'build-instrument','aria-hidden':'true','data-mode':'waiting'},image);
  let key='',effects=[];
  const cancel=()=>{for(const effect of effects)effect?.cancel();effects=[];};
  function update(mode,current){
    const active=mode==='active';const phase=active?Math.min(current?.phase??0,3):null;
    const next=active?`${phase}:${current?.progress?.completed??'uncounted'}/${current?.progress?.total??''}`:mode;
    if(next===key)return;key=next;cancel();element.dataset.mode=mode;
    if(active||mode==='ready')pieces.forEach(({layer},i)=>layer.dataset.state=mode==='ready'||i<phase?'settled':i===phase?'working':'future');
    else if(['waiting','idle'].includes(mode))pieces.forEach(({layer})=>layer.dataset.state='future');
    // This is a finite acknowledgement of a backend event, not an ongoing activity claim.
    if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||!active)return;
    const index=Math.min(phase,2),{piece}=pieces[index];
    const move=piece.animate?.([{transform:'translateY(-7px)',opacity:.55},{transform:'translateY(0)',opacity:1}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});effects.push(move);
    contacts[index].forEach((dot,i)=>effects.push(dot.animate?.([{opacity:.2,transform:'scale(.55)'},{opacity:1,transform:'scale(1)'}],{duration:250,delay:i*55,easing:'cubic-bezier(.22,1,.36,1)'})));
  }
  return {element,update,dispose:()=>{cancel();key='';element.dataset.mode='idle';}};
}
export function toolBuildView(api,{onBusy=()=>{},onCreated=()=>{},onOpen=()=>{},onSaved=()=>{},onEdit=()=>{},onShowSaved=()=>{}}={}){
  let generation=0,timer,jobId=null,taskId=null,body=null,context={},lastPhase=0,stopRequested=false,stopSending=false,finished=false,polling=false,announceKey='',lastJob=null;
  const heading=el('h1',{id:'build-title',tabindex:'-1'},'Starting on this Mac');
  const description=el('p',{class:'build-description'});
  const count=el('p',{class:'build-count','aria-live':'off'});
  const fill=el('span',{class:'build-phase-fill'});
  const track=el('div',{class:'build-phase-track',role:'progressbar','aria-label':'Current step progress','aria-valuemin':'0','aria-live':'off',hidden:true},fill);
  const feedback=el('div',{class:'build-feedback','data-motion':'idle'},count,track);
  const assembly=toolAssemblyView();
  const meter=el('div',{class:'build-work-meter'},assembly.element,feedback);
  let progressPhase=null,progressValue=null;
  function motion(mode,current=null){
    assembly.update(mode,current);
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
  const statusContent=el('div',{class:'build-status-content'},stepLabel,heading,description);
  const liveStatus=el('div',{class:'build-live-status'},statusContent,meter);
  let transitionKey='',statusSnapshot=null,transitionEffects=[],outgoing=null;
  const reducedMotion=()=>Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  function clearTransition(){for(const effect of transitionEffects)effect?.cancel();transitionEffects=[];outgoing?.remove();outgoing=null;}
  function changed(key,label){
    if(stepLabel.textContent!==label)stepLabel.textContent=label;
    const nextSnapshot=statusContent.cloneNode(true);
    if(key===transitionKey){statusSnapshot=nextSnapshot;return;}
    const previous=statusSnapshot;statusSnapshot=nextSnapshot;
    const interruptedOpacity=globalThis.getComputedStyle?Number(globalThis.getComputedStyle(statusContent).opacity):1;
    transitionKey=key;clearTransition();
    // Urgent feedback is immediate; buttons and focus never participate in the visual handoff.
    if(reducedMotion()||!previous||/^(stopping|connection|terminal)/.test(key))return;
    outgoing=previous;outgoing.classList.add('build-status-outgoing');outgoing.setAttribute('aria-hidden','true');outgoing.setAttribute('inert','');
    for(const node of outgoing.querySelectorAll('[id]'))node.removeAttribute('id');
    liveStatus.append(outgoing);
    const old=outgoing;
    const exit=old.animate?.([{opacity:Number.isFinite(interruptedOpacity)?interruptedOpacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-2px)'}],{duration:140,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
    const enter=statusContent.animate?.([{opacity:0,transform:'translateY(2px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)'});
    transitionEffects=[exit,enter];
    if(exit)exit.onfinish=()=>{old.remove();if(outgoing===old)outgoing=null;};else{old.remove();outgoing=null;}
  }
  const announcement=el('p',{class:'sr-only',role:'status','aria-live':'polite','aria-atomic':'true'});
  const task=el('p',{class:'build-task'});
  const fileContext=el('p',{class:'build-file-context'});
  const contextHeader=el('header',{class:'build-context'},task,fileContext);
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
  const controls=el('div',{class:'build-actions'},stop,open,retry,reconnect,edit,saved);
  const statusShell=el('section',{class:'build-status-shell','aria-label':'Tool creation status'},liveStatus,controls);
  const panel=el('section',{class:'tool-build-surface',hidden:true,'aria-labelledby':'build-title'},contextHeader,statusShell,announcement,allSteps,el('p',{class:'build-local-note'},'On this Mac. Your other tools stay unchanged.'),details);
  function announce(key,text){if(key!==announceKey){announceKey=key;announcement.textContent=text;}}
  function focusStart(){panel.scrollIntoView?.({block:'start'});stop.focus({preventScroll:true});}
  function showRecovery(message,unknown=false){
    motion('paused');clearTimeout(timer);heading.textContent='Connection interrupted';description.textContent=message;count.textContent='';changed('connection','Status unavailable');reconnect.hidden=unknown;saved.hidden=false;stop.hidden=unknown;stop.setAttribute('aria-disabled',unknown?'true':'false');
    announce('connection',unknown?'Could not confirm creation. Check saved tasks before creating another tool.':'Connection interrupted. The task may still be running on this Mac.');
    facts.textContent=JSON.stringify({jobId,taskId,lastJob},null,2);
    // Unknown creation acknowledgement must never become an automatic duplicate POST.
    if(unknown){finished=true;onBusy(false);saved.focus({preventScroll:true});}
  }
  function reset(input,info){
    generation++;clearTimeout(timer);jobId=taskId=null;body=input;context=info;lastPhase=0;stopRequested=stopSending=finished=polling=false;announceKey='';lastJob=null;
    panel.hidden=false;panel.dataset.state='working';motion('waiting');task.textContent=info.request||input?.request||'Sales reporting';fileContext.textContent=info.file?`${info.file} · On this Mac`:'On this Mac';
    heading.textContent='Starting your tool';description.textContent='Saving your request on this Mac before learning begins.';count.textContent='';changed('starting:'+generation,'Getting ready');
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
    stopRequested=true;motion('stopping');heading.textContent='Stopping…';description.textContent=jobId?'Waiting for the local process to stop safely.':'Waiting for the local queue to acknowledge the request, then stopping it.';count.textContent='';changed('stopping','Waiting for a safe stop');stop.textContent='Stopping…';stop.setAttribute('aria-disabled','true');announce('stopping','Stopping. Waiting for confirmation from this Mac.');void sendStop(generation).then(ok=>{if(ok)void poll(generation);});
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
      finished=true;panel.dataset.state='ready';motion('ready');count.textContent='';heading.textContent=outcome.title;description.textContent=stopRequested?'The run finished before Stop took effect, and your saved tool is ready to use.':outcome.description;changed('ready','Saved on this Mac');steps.querySelectorAll('li').forEach(node=>{node.dataset.state='complete';node.removeAttribute('aria-current');node.querySelector('.build-step-state').textContent='Done';});open.hidden=false;
    }else{
      finished=true;panel.dataset.state=job.status;motion(job.status==='cancelled'?'stopped':'failed');count.textContent='';
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
      if(stopRequested){motion('stopping');heading.textContent='Stopping…';description.textContent='Waiting for the local process to stop safely.';count.textContent='';changed('stopping','Waiting for a safe stop');}
      else{
        const current=buildProgress(job,lastPhase);lastPhase=current.phase;motion(job.status==='queued'?'waiting':job.status==='running'?'active':'paused',current);heading.textContent=current.title;description.textContent=current.description;count.textContent=current.count;changed(job.status==='queued'?'queued':`step:${current.phase}:${current.title}:${current.description}`,job.status==='queued'?'Waiting to start':`Step ${current.phase+1} of ${phases.length}`);
        steps.querySelectorAll('li').forEach((node,i)=>{node.dataset.state=job.status==='queued'?'waiting':i<lastPhase?'complete':i===lastPhase?'current':'waiting';if(job.status==='running'&&i===lastPhase)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');node.querySelector('.build-step-state').textContent=node.dataset.state==='current'?'Now':node.dataset.state==='complete'?'Done':'Next';});
        announce(`${job.status}:${current.phase}:${current.title}:${current.description}`,`${current.title}. ${current.description}`);
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
  function dispose(){generation++;clearTimeout(timer);clearTransition();statusSnapshot=null;transitionKey='';motion('idle');assembly.dispose();panel.hidden=true;finished=true;onBusy(false);facts.textContent='';}
  return {element:panel,start,resume,dispose,focus:()=>{panel.scrollIntoView?.({block:'start'});(finished?panel.querySelector('.build-actions button:not([hidden])'):stop)?.focus({preventScroll:true});},get active(){return !panel.hidden;}};
}
