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
