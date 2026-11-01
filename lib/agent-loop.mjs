import path from 'node:path';
import {state,save} from './actors.mjs';
import {generate} from './model.mjs';
import {inferLiveReport} from './live-reporting.mjs';
import {runFineTune} from './finetune.mjs';
import {agentHandoff,receiveHandoff,relayStatus} from './relay.mjs';
import {loopDevelopment,loopTrainingData} from './candy-loop-data.mjs';
export function selectCandidate(baseline,candidate,total){
 if(!Number.isInteger(total)||total<1||![baseline,candidate].every(v=>Number.isInteger(v)&&v>=0&&v<=total))throw Error('Invalid evaluation scores');
 return candidate>baseline?'candidate':'current';
}
export async function runAgentLoop(job,signal,progress){
 let loop={id:job.id,taskId:job.taskId,status:'running',stage:'Planner',events:[],startedAt:Date.now(),baselineJobId:job.payload.baselineJobId,architecture:'Three separately prompted local role contexts sharing Qwen3 and one serialized Device queue; Relay transports handoffs.'};
 const persist=()=>save('loop:'+job.id,loop);
 const event=async(role,kind,data)=>{signal.throwIfAborted();loop.stage=role;loop.events.push({role,kind,...data,at:Date.now()});await persist();await progress(role+': '+(data.summary??kind));};
 let cloudHealthy=Boolean(relayStatus.enabled&&relayStatus.ready&&!job.payload.cloudBackoff);
 loop.transportMode=cloudHealthy?'relay':'local-durable';
 if(!cloudHealthy)loop.architecture='Separately prompted local role contexts sharing one serialized Device queue; handoffs are saved locally.';
 async function handoff(from,to,phase,score){
  signal.throwIfAborted();
  if(cloudHealthy){
   try{
    const messageId=await agentHandoff({loopId:job.id,from,to,phase,score});
    await event(from,'send',{to,phase,messageId,transport:'relay',summary:`Sent ${phase} to ${to}; verifying receipt`});
    for(let i=0;i<100;i++){
     signal.throwIfAborted();let receipt=(await state())['handoff:'+messageId];
     if(!receipt&&i%10===0){receipt=await receiveHandoff(messageId,to);if(receipt)await save('handoff:'+messageId,receipt);}
     if(receipt){await event(from,'handoff',{to,phase,messageId,transport:'relay',summary:`Relay handoff to ${to}`});await event(to,'receipt',{from,messageId,transport:'relay',summary:`Received ${phase} through Relay`});return;}
     await new Promise(r=>setTimeout(r,100));
    }
    throw Error('Relay receipt unavailable within deadline');
   }catch(e){
    if(signal.aborted)throw e;
    cloudHealthy=false;loop.transportFallback=e.message;
    await event('System','transport_failure',{summary:'Relay unavailable; subsequent handoffs use the local durable store. '+e.message});
   }
  }
  const messageId='local:'+job.id+':'+phase;
  await save('handoff:'+messageId,{loopId:job.id,from,to,phase,score,transport:'local-durable',createdAt:Date.now()});
  const receipt=(await state())['handoff:'+messageId];
  if(receipt?.to!==to)throw Error('Local durable handoff was not persisted');
  await event(from,'handoff',{to,phase,messageId,transport:'local-durable',summary:`Local durable handoff to ${to}`});
  await event(to,'receipt',{from,messageId,transport:'local-durable',summary:`Received ${phase} locally (not a Relay receipt)`});
 }

 async function decide(role,input,choices){
  const schema={type:'object',additionalProperties:false,required:['choice','reason'],properties:{choice:{type:'string',enum:choices},reason:{type:'string'}}};
  const trial=await generate(`You are the ${role} agent for a bounded local candy-model improvement experiment. Make a decision from the allowed choices based on the supplied evidence. Return a brief user-facing reason, not a chain of thought. Never invent scores. No tools or commands.`,input,schema,signal);
  if(!choices.includes(trial.value.choice)||typeof trial.value.reason!=='string'||trial.value.reason.length>2000)throw Error('Invalid '+role+' decision');
  await event(role,'decision',{...trial.value,summary:trial.value.reason,elapsedMs:trial.elapsedMs});return trial.value;
 }
 try{
  await persist();
  const existing=await state(),baseline=existing['fineTune:'+job.payload.baselineJobId];
  if(!baseline||baseline.profile!=='candy'||baseline.selected!=='adapter')throw Error('A selected candy adapter is required');
  if(!existing['selectedAdapter:candy'])await save('selectedAdapter:candy',{jobId:job.payload.baselineJobId,selectedAt:Date.now(),reason:'Current adapter at loop start'});
  const planner=await decide('Planner',{goal:'Improve raw candy question interpretation without relying on the UI filter override.',knownIssue:'Inline chocolate/fruity wording was sometimes ignored in the live demo.',availableChecks:loopDevelopment.map(c=>c.id)},['audit_filters','audit_units']);
  loop.planner=planner;await persist();
  await handoff('planner','evaluator','development-audit');
  const development=[];
  const ordered=[...loopDevelopment].sort((a,b)=>planner.choice==='audit_units'?Number(b.expected.operation==='clarify')-Number(a.expected.operation==='clarify'):Number(a.expected.operation==='clarify')-Number(b.expected.operation==='clarify'));
  for(const [index,c] of ordered.entries()){
   signal.throwIfAborted();await progress(`Evaluator: checking ${index+1}/${ordered.length}`);
   let plan,error;try{plan=(await inferLiveReport({...job,id:job.id+'-dev-'+index,payload:{request:c.request}},baseline,signal)).plan;}catch(e){if(signal.aborted)throw e;error=e.message;}
   const passed=!!plan&&Object.keys(c.expected).every(k=>plan[k]===c.expected[k]);
   development.push({...c,plan,error,passed});
  }
  loop.development=development;await event('Evaluator','measurement',{score:development.filter(c=>c.passed).length,total:development.length,failures:development.filter(c=>!c.passed),summary:`${development.filter(c=>c.passed).length}/${development.length} raw development plans correct`});
  const failures=development.filter(c=>!c.passed);
  const evaluator=await decide('Evaluator',{score:development.length-failures.length,total:development.length,failures,rule:'Recommend training when there are measured errors. Keep the current adapter when there are none.'},['train','keep']);
  loop.evaluator=evaluator;
  if(evaluator.choice==='keep'||!failures.length){await handoff('evaluator','planner','no-training-needed');await event('Planner','selection',{selected:'current',summary:'No justified training; current model retained.'});loop.status='complete';loop.selected='current';loop.completedAt=Date.now();await persist();return loop;}
  await handoff('evaluator','trainer','training-request',{passed:development.length-failures.length,total:development.length});
  const data=loopTrainingData('inline_filters');
  const coverage=failures.map(f=>({id:f.id,covered:data.train.some(c=>c.request===f.request&&JSON.stringify(c.expected)===JSON.stringify(f.expected))}));
  if(!coverage.some(c=>c.covered)){
   await event('Trainer','selection',{selected:'current',summary:'No reviewed training recipe covers the failures; no weights changed.'});
   await handoff('trainer','planner','no-matching-recipe');loop.status='complete';loop.selected='current';loop.completedAt=Date.now();await persist();return loop;
  }
  const trainer=await decide('Trainer',{assignment:'Evaluator has requested one justified training candidate. The capability checker verified matching reviewed examples. Choose the compute budget for training this NEW recipe; do not invent prior runs.',currentAdapter:{jobId:job.payload.baselineJobId,recipe:'previous candy adapter'},candidateRecipe:'NEW inline-filter reinforcement plus rehearsal, not yet trained in this loop',coverage,choices:{short_pilot:'60 steps, less compute; use for a small focused repair.',standard_pilot:'120 steps, more examples seen; use when more learning is justified.'},failures},['short_pilot','standard_pilot']);
  loop.trainer=trainer;loop.training={recipe:'inline_filters',budget:trainer.choice,iterations:trainer.choice==='short_pilot'?60:120,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length]))};
  await event('Trainer','training',{summary:`Training one candidate: ${loop.training.iterations} steps; ${data.train.length} examples`});
  const result=await runFineTune({...job,payload:{profile:'candy'}},signal,stage=>progress('Trainer / Evaluator: '+stage),{data,version:'candy-agent-loop-v2',iterations:loop.training.iterations,resumeAdapter:baseline.adapterPath,baselineAdapter:path.dirname(baseline.adapterPath)});
  loop.candidate=result;await save('fineTune:'+job.id,result);
  await handoff('trainer','evaluator','candidate-ready',{baseline:result.baseline.score,candidate:result.adapted.score,total:result.total});
  await event('Evaluator','measurement',{baseline:result.baseline.score,candidate:result.adapted.score,total:result.total,summary:`Fresh test: current ${result.baseline.score}/${result.total}; candidate ${result.adapted.score}/${result.total}`});
  const review=await decide('Evaluator',{baseline:result.baseline.score,candidate:result.adapted.score,total:result.total,rule:'Recommend promote only for strictly higher exact-plan accuracy. On ties or regressions recommend keep.'},['promote','keep']);
  loop.review=review;
  const selected=selectCandidate(result.baseline.score,result.adapted.score,result.total);
  loop.selected=selected;
  // Independent exact-score gate, not the evaluator's persuasive wording, controls promotion.
  if(selected==='candidate'){
   const current=(await state())['task:'+job.taskId];
   await save('task:'+job.taskId,{...current,fineTune:result});
   await save('selectedAdapter:candy',{jobId:job.id,selectedAt:Date.now(),reason:'Strict improvement on fresh raw-plan tests'});
  }
  await handoff('evaluator','planner','selection',{baseline:result.baseline.score,candidate:result.adapted.score,total:result.total});
  await event('Planner','selection',{selected,summary:selected==='candidate'?'Candidate selected by strict measured-improvement gate.':'Current adapter retained by measured-improvement gate.'});
  loop.status='complete';loop.completedAt=Date.now();await persist();return loop;
 }catch(e){loop.status=signal.aborted?'cancelled':'failed';loop.error=e.message;loop.completedAt=Date.now();await persist();throw e;}
}
