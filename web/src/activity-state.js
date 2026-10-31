// Only project persisted, task-scoped evidence; never synthesize a workflow.
const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.slice(0, 1200) : '';
const status = value => ({running:'active',ready:'completed',complete:'completed',interrupted:'failed'}[value] || value || 'queued');
const eventKey = event => {
  if(event.id) return event.id;
  // Legacy event arrays can be capped by the companion. Indexes would shift;
  // opaque content keys remain stable without exposing an error body as an ID.
  const source=JSON.stringify([event.at,event.actor||event.role,event.phase||event.kind,event.summary,event.messageId]);
  let hash=14695981039346656037n;
  for(const char of source) hash=BigInt.asUintN(64,(hash^BigInt(char.codePointAt(0)))*1099511628211n);
  return hash.toString(16);
};
const stamp = value => Number.isFinite(value) ? value : null;
export function activityView(state = {}, taskId = null) {
  const allJobs = list(state.jobs);
  const jobs = allJobs.filter(job => taskId && job.taskId === taskId).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const task = list(state.tasks).find(task => task.id === taskId);
  const newest = [...jobs].reverse();
  const job = newest.find(job => job.status==='running') || newest.find(job => job.status==='queued') || newest[0];
  const rows = new Map();
  const evidence = [['Catalog', 'Built-in catalog']];
  const add = (id, agent, summary, state, at, details = []) => {
    if (!summary) return;
    rows.set(id, {id, agent, summary: text(summary), status:status(state), at:stamp(at), evidence:details});
  };
  if(taskId) evidence.push(['Task',taskId]);
  const selection = task?.selection;
  if(selection) {
    const source = selection.catalogSource;
    evidence[0][1] = source?.kind === 'supabase' && source.status === 'synced' && stamp(source.checkedAt)!==null ? 'Shared catalog (saved successful read)' : 'Built-in catalog';
    if(selection.catalogVersion||source?.version) evidence.push(['Catalog version',selection.catalogVersion||source.version]);
    if(stamp(source?.checkedAt)!==null) evidence.push(['Catalog checked',new Date(source.checkedAt).toISOString()]);
    if(selection.recommendationId) evidence.push(['Recommendation',selection.recommendationId]);
    list(selection.events).forEach(event=>add(`selection:${selection.recommendationId||taskId}:${eventKey(event)}`, 'System',event.summary,event.status,event.at));
    if(list(selection.reasons).length) evidence.push(['Selection rationale',selection.reasons.join('; ')]);
  }
  const model = task?.model;
  if(model) for(const [label,key] of [['Model','id'],['Digest','digest'],['Runtime','runtime']]) if(model[key]) evidence.push([label,model[key]]);
  for(const item of jobs) {
    const prefix = `job:${item.id}`;
    const details = [['Job',item.id],['Saved status',item.status]];
    if(item.startedAt && item.finishedAt >= item.startedAt) details.push(['Measured runtime',`${((item.finishedAt-item.startedAt)/1000).toFixed(1)} s`]);
    const events = list(item.events);
    events.forEach(event=>add(`${prefix}:${eventKey(event)}`,event.actor||'System',event.summary,event.status,event.at,details));
    // Older companions only save the latest job state. Do not fabricate earlier stages.
    if(!events.length || events.at(-1)?.status !== item.status) add(`${prefix}:state`,'System',item.stage||`Local job ${status(item.status)}`,item.status,item.finishedAt||item.startedAt||item.createdAt,details);
    for(const [key,label] of [['requestMessageId','Request sent'],['receivedMessageId','Request received'],['completionMessageId','Result sent'],['completionReceivedId','Result received']]) {
      if(item[key]) add(`${prefix}:${key}`,'System',label,'completed',null,[['Job',item.id],['Message',item[key]],['Transport',item.viaRelay?'Relay':'Not recorded']]);
    }
    if(item.viaRelay && item.requestMessageId && !item.receivedMessageId) add(`${prefix}:delivery`,'System','No recipient receipt recorded',['queued','running'].includes(item.status)?'queued':item.status==='ready'?'failed':item.status,null,[['Request',item.requestMessageId]]);
  }
  for(const loop of list(state.loops).filter(loop => taskId && loop.taskId===taskId)) {
    list(loop.events).forEach(event=>{
      const details=[['Run',loop.id]];
      for(const key of ['messageId','transport','from','to','choice']) if(event[key]) details.push([key,event[key]]);
      if(Number.isFinite(event.elapsedMs)) details.push(['Measured runtime',`${event.elapsedMs} ms`]);
      const matched = event.kind==='receipt' && list(loop.events).some(sent=>sent.kind==='handoff' && sent.messageId && sent.messageId===event.messageId && sent.to===event.role && sent.role===event.from && sent.transport===event.transport);
      const summary=event.kind==='transport_failure'?'Relay unavailable; no fallback receipt implied':event.kind==='receipt'?(matched?'Handoff received':'Receipt recorded; matching handoff unavailable'):event.summary;
      add(`loop:${loop.id}:${eventKey(event)}`,event.role||'System',summary,event.status||(event.kind==='training'?'active':'completed'),event.at,details);
    });
  }
  if(job) {
    evidence.push(['Latest job',job.id],['Saved job status',job.status]);
    if(job.startedAt && job.finishedAt >= job.startedAt) evidence.push(['Measured runtime',`${((job.finishedAt-job.startedAt)/1000).toFixed(1)} s`]);
  }
  const ordered = [...rows.values()];
  const current = job ? {summary:text(job.stage)||`Local job ${status(job.status)}`,status:status(job.status)} : null;
  const activeCount = allJobs.filter(job=>job.status==='running').length;
  const queuedCount = allJobs.filter(job=>job.status==='queued').length;
  return {taskId,jobId:job?.id,status:current?.status||(taskId?'No saved job':'No task selected'),current,rows:ordered,evidence,
    error:job?.error||job?.relayError? 'The saved job reports an error. Open the task controls to inspect it and retry when ready.' : null,
    device:`Device queue · ${activeCount} running · ${queuedCount} waiting`};
}

export function monitorView(state, now=Date.now(), rates={input:0.25,output:2}) {
  const jobs=[...(state.jobs||[])].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const job=jobs.find(j=>j.status==='running')||jobs.find(j=>j.status==='queued')||jobs[0];
  if(!job)return {job:null,steps:[],elapsed:null,eta:null,cost:null,covered:0,total:0};
  const failed=['failed','cancelled','interrupted'].includes(job.status),ready=job.status==='ready',running=job.status==='running';
  const step=(label,done,active)=>({label,state:done?'complete':active?(failed?'stopped':'active'):'upcoming'});
  const steps=[step('Queued',running||ready||Boolean(job.startedAt),job.status==='queued'&&(!job.viaRelay||Boolean(job.receivedMessageId)))];
  if(job.viaRelay)steps.push(step('Agent handoff',Boolean(job.receivedMessageId),!job.receivedMessageId&&!ready));
  steps.push(step('Local work',ready,running||failed),step('Result',ready,false));
  if(job.viaRelay)steps.push(step('Result received',Boolean(job.completionReceivedId),ready&&!job.completionReceivedId));
  const elapsed=job.startedAt?Math.max(0,((job.finishedAt||now)-job.startedAt)/1000):null;
  const history=jobs.filter(j=>j.id!==job.id&&j.kind===job.kind&&j.payload?.profile===job.payload?.profile&&j.status==='ready'&&j.startedAt&&j.finishedAt>j.startedAt).slice(0,10).map(j=>(j.finishedAt-j.startedAt)/1000).sort((a,b)=>a-b);
  const eta=running&&elapsed!==null&&history.length>=3?{low:Math.max(0,Math.round(history[0]-elapsed)),high:Math.max(0,Math.round(history.at(-1)-elapsed)),samples:history.length}:null;
  const relevant=job.taskId?jobs.filter(j=>j.taskId===job.taskId):[job];
  const measured=relevant.filter(j=>Number.isFinite(j.usage?.inputTokens)&&Number.isFinite(j.usage?.outputTokens));
  const validRates=[rates.input,rates.output].every(n=>Number.isFinite(n)&&n>=0);
  const cost=measured.length&&validRates?measured.reduce((sum,j)=>sum+(j.usage.inputTokens*rates.input+j.usage.outputTokens*rates.output)/1e6,0):null;
  return {job,steps,elapsed,eta,cost,covered:measured.length,total:relevant.length,history:jobs.slice(0,8)};
}
