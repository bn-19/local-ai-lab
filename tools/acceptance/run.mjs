#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {fixture,definition,request,verifyBytes,parseCSV,verifyDashboard,client,digest,waitJob,cancelOwned,localBase} from './core.mjs';

const {values}=parseArgs({options:{base:{type:'string'},'token-file':{type:'string'},csv:{type:'string'},report:{type:'string'},model:{type:'string'},'timeout-seconds':{type:'string',default:'600'},help:{type:'boolean'}}});
if(values.help){console.log('Node 22+: node tools/acceptance/run.mjs --base http://127.0.0.1:4173 --token-file /absolute/pairing-token --report /outside/repo/evidence.json [--csv /path/candy-data.csv] [--model ID] [--timeout-seconds 600]');process.exit(0);}
assert.ok(Number(process.versions.node.split('.')[0])>=22,'Node 22+ required');
assert.ok(values.base&&values['token-file']&&values.report,'Explicit --base, --token-file and --report required');
const base=localBase(values.base), timeoutMs=Number(values['timeout-seconds'])*1000;
assert.ok(Number.isFinite(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=3600000,'Timeout must be 1–3600 seconds');
// Exclusive creation prevents overwriting input/token files or previous evidence.
const output=await open(values.report,'wx',0o600);
const report={schemaVersion:1,evidenceLevel:'local-companion-api',status:'incomplete',startedAt:new Date().toISOString(),base,checks:[],nativeChecks:{status:'not_checked',owner:'Master Mac acceptance',requirements:['Exact packaged build/source identity','Native frontend readiness event','Native UI and file picker','Process ownership and launcher lifecycle']},optionalTuning:'Not requested or performed'};
let api,owned,token;
const abort=new AbortController();
const stop=()=>abort.abort(Error('Operator interrupted acceptance'));
process.on('SIGINT',stop);process.on('SIGTERM',stop);
const check=(requirement,evidence)=>report.checks.push({requirement,status:'passed',evidence});
try {
  token=(await readFile(values['token-file'],'utf8')).trim();
  assert.ok(token.length>=16&&!/\s/.test(token),'Invalid pairing-token file');
  api=client(base,token);
  const health=await api('/api/health');
  report.machine=health.machine;report.runtimes=health.runtimes;
  report.sourceIdentity={status:'unavailable',note:'Current health contract has no packaged build revision. Verify exact candidate on Mac.'};
  assert.equal(health.machine?.platform,'darwin','Must target a real Mac companion');assert.equal(health.machine?.arch,'arm64','Apple Silicon required');
  assert.equal(health.status,'ready','Companion setup required');assert.equal(health.runtimes?.terse?.ready,true);assert.equal(health.runtimes?.ollama?.ready,true);
  check('Authenticated machine and runtime inspection',{machine:health.machine,runtimes:health.runtimes});
  const recommendation=await api('/api/models/recommend',{request,inputKind:'csv',preferences:{priority:'balanced',allowDownload:false}});
  report.recommendation=recommendation;
  const selected=values.model?recommendation.candidates?.find(c=>c.id===values.model):recommendation.candidates?.find(c=>c.compatible&&c.installed);
  if(!selected?.compatible||!selected.installed){report.reason='No already installed compatible reviewed model';throw Error(report.reason);}
  const installed=health.models?.find(m=>m.id===selected.id&&digest(m.digest)===digest(selected.digest));
  assert.ok(installed&&digest(selected.digest),'Selected model digest not present in actual inventory');
  report.selectedModel={id:selected.id,digest:selected.digest};
  check('Installed compatible model and pinned digest',report.selectedModel);
  let bytes;
  if(values.csv)bytes=await readFile(values.csv);
  else {
    const response=await fetch(fixture.url,{redirect:'error',signal:AbortSignal.timeout(30000)});
    assert.ok(response.ok,'Public fixture fetch failed');bytes=Buffer.from(await response.arrayBuffer());
  }
  verifyBytes(bytes,fixture.sha256);const rows=parseCSV(bytes.toString('utf8'));
  report.dataset={...fixture,bytes:bytes.length,rows:rows.length,serverHash:'Not exposed by current API; hash verified before raw upload'};
  assert.equal(rows.length,85);
  check('Public fixture identity and verified upload bytes',report.dataset);
  const dataset=await api('/api/datasets',bytes,{'Content-Type':'text/csv','X-Filename':'candy-data.csv'});
  assert.match(dataset.id,/^[a-f0-9-]{36}$/);report.dataset.id=dataset.id;
  assert.equal(dataset.rows,rows.length);assert.equal(dataset.bytes,bytes.length);
  const created=await api('/api/tasks',{request,datasetId:dataset.id,...definition,modelId:selected.id});
  assert.match(created.jobId,/^[a-f0-9-]{36}$/);assert.match(created.taskId,/^[a-f0-9-]{36}$/);owned=created;report.created=created;
  const job=await waitJob(api,owned,{timeoutMs,signal:abort.signal});
  report.job=job;
  assert.equal(job.status,'ready','Created model job did not reach terminal success');
  const task=await api(`/api/tasks/${owned.taskId}`);
  assert.equal(task.id,owned.taskId);assert.equal(task.datasetId,dataset.id);assert.equal(task.status,'ready');
  assert.equal(task.model?.id,selected.id);assert.equal(digest(task.model?.digest),digest(selected.digest));
  assert.ok(task.plan&&typeof task.plan.explanation==='string'&&task.plan.explanation.length>0,'Missing actual validated model plan');
  assert.equal(task.plan.operation,definition.measure.operation);assert.equal(task.plan.groupColumn,definition.groupColumn);assert.equal(task.plan.dateColumn,null);
  assert.ok(task.measurement?.tokens>0&&Number.isFinite(task.measurement.elapsedMs)&&task.measurement.elapsedMs>0,'Missing actual inference measurements');
  report.modelOutput={validatedPlan:task.plan,measurement:task.measurement,rawText:'Not exposed by API',binding:task.model};
  check('Actual terminal model job output',report.modelOutput);
  report.calculations=[];
  for(const value of [null,'1','0']) {
    const filter=value===null?null:{column:definition.filterColumn,value};
    const dashboard=await api(`/api/tasks/${task.id}/dashboard`,{filter});
    assert.equal(dashboard.model?.id,selected.id);assert.equal(digest(dashboard.model?.digest),digest(selected.digest));
    const expected=verifyDashboard(dashboard,rows,definition,filter);
    report.calculations.push({filter,expected,actual:dashboard,tolerance:1e-6});
  }
  verifyDashboard(task.dashboard,rows);
  check('Independent CSV counts, means, ranking and category charts, all filters',{cases:report.calculations.length,tolerance:1e-6});
  const reopened=await api(`/api/tasks/${task.id}`);
  assert.equal(reopened.id,task.id);assert.equal(reopened.datasetId,dataset.id);
  for(const field of ['model','plan','dashboard','measure','groupColumn','filterColumn','measurement'])assert.ok(isDeepStrictEqual(reopened[field],task[field]),`Saved task changed: ${field}`);
  report.persistence={taskId:reopened.id,scope:'Separate API read; no companion or native app restart performed'};
  check('Reopen persisted task through API',report.persistence);
  report.transport={viaRelay:job.viaRelay??null,requestMessageId:job.requestMessageId??null,relayError:job.relayError??null,events:job.events??[],note:'Recorded fields only; queue/process ownership and Relay receipts are not independently observed by this runner.'};
  report.checks.push({requirement:'Transport/fallback evidence',status:'observed',evidence:report.transport},{requirement:'Packaged source identity and native checks',status:'not_checked',evidence:report.nativeChecks});
  report.status='passed';
} catch(error) {
  // Never serialize arbitrary server errors, stacks or local filesystem paths.
  report.status=report.created?'failed':'incomplete';
  report.reason??=error?.name==='AssertionError'?String(error.message).split('\n')[0]:'Acceptance could not complete; inspect setup/network and rerun';
  if(api&&owned)try {await cancelOwned(api,owned);report.cleanup='Only owned job inspected; cancellation requested only if still queued/running';}catch{report.cleanup='Owned job cancellation could not be confirmed; inspect created job ID';}
} finally {
  process.off('SIGINT',stop);process.off('SIGTERM',stop);
  report.completedAt=new Date().toISOString();
  let serialized=JSON.stringify(report,null,2)+'\n';
  if(token)serialized=serialized.split(token).join('[REDACTED]');
  try{await output.writeFile(serialized);}finally{await output.close();}
}
console.log(JSON.stringify({status:report.status,passedChecks:report.checks.filter(c=>c.status==='passed').length,observedChecks:report.checks.filter(c=>c.status==='observed').length,notChecked:report.checks.filter(c=>c.status==='not_checked').length,taskId:owned?.taskId??null}));
process.exitCode=report.status==='passed'?0:report.status==='incomplete'?2:1;
