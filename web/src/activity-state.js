// Project only persisted evidence into display rows. Never invent agent progress.
export function activityView(state) {
  const jobs = [...(state.jobs || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const job = jobs.find(j => j.status === 'running') || jobs.find(j => j.status === 'queued') || jobs[0];
  if (!job) return { status: 'Ready', rows: [], evidence: [] };
  const terminal = ['failed', 'cancelled', 'interrupted'].includes(job.status);
  const rows = [];
  const evidence = [['Job', job.id]];
  if (job.viaRelay) {
    rows.push({ agent: 'Planner', status: job.requestMessageId ? 'Request sent' : terminal ? 'Request stopped' : 'Sending request' });
    rows.push({ agent: 'Evaluator', status: job.receivedMessageId ? 'Request received' : terminal ? 'No delivery confirmed' : 'Waiting for delivery' });
    for (const [label, key] of [['Request', 'requestMessageId'], ['Received', 'receivedMessageId'], ['Completion', 'completionMessageId'], ['Acknowledged', 'completionReceivedId']]) {
      if (job[key]) evidence.push([label, job[key]]);
    }
  }
  const worker = job.kind === 'install' ? 'Model download' : job.kind === 'deferred' ? 'Local worker' : 'Local model';
  rows.push({ agent: worker, status: job.stage || job.status });
  if (job.completionMessageId) rows.push({ agent: 'Evaluator', status: 'Result sent' });
  if (job.completionReceivedId) rows.push({ agent: 'Planner', status: 'Result received' });
  const status = job.status === 'ready' ? 'Latest job complete' : job.status === 'running' ? 'Working' : job.status === 'queued' ? 'Queued' : job.status;
  return { status, rows, evidence, error: job.error || job.relayError || null, jobId: job.id };
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
