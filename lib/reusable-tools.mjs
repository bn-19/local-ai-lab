import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {state,save} from './actors.mjs';
import {health} from './health.mjs';
import {validateMapping,retailMapping,validateReportingPlan} from './live-reporting.mjs';
import {liveReport} from './data.mjs';
import {trainingSystem} from './finetune-data.mjs';
import {runFineTune} from './finetune.mjs';
import {toolTrainingData} from './tool-training-data.mjs';
import {trainingModel,bindToolArtifacts,verifyToolArtifacts,fingerprint} from './tool-artifacts.mjs';
import {prepareTraining,setupAvailability,trainingRuntimeReady} from './tool-setup.mjs';
import {runLocalProcess} from './local-process.mjs';
import {managedRuntimeStatus,trainingPython,isolatedPythonEnv,localPythonCommand} from './managed-python.mjs';

export const toolRecipeVersion='sales-reporting-tool-v2';
const exclusions=['POST','ADJUST'];
const scope='Whole-file sales revenue, average order value, order counts and product rankings. Refunds included unless explicitly excluded; POST/ADJUST excluded unless explicitly included. Profit needs cost data. No dates, countries or arbitrary filters.';
export function validateToolRequest(input){
  if(!input||typeof input.request!=='string'||input.request.trim().length<3||input.request.length>2000)throw Error('Describe the reporting tool in 3–2000 characters');
  if(Object.keys(input).some(k=>!['request','datasetId','mapping'].includes(k)))throw Error('Unsupported tool option');
  if(!/\b(sales|retail|revenue|orders?|invoices?|turnover|reporting)\b/i.test(input.request))throw Error('This first learning workflow supports sales reporting. Other task recipes are not available yet.');
  return input.request.trim();
}
export async function recommendTool(input){
  const request=validateToolRequest(input),s=await state(),dataset=s['dataset:'+input.datasetId];
  if(!dataset)throw Error('Choose a sales CSV first');
  const mapping=validateMapping(dataset,input.mapping??retailMapping);
  const {machine}=await health(),setup=await setupAvailability();
  const reasons=[];
  if(machine.platform!=='darwin'||machine.arch!=='arm64')reasons.push('Apple Silicon Mac required');
  if(machine.memoryGB<24)reasons.push('This learning recipe needs at least 24 GB system memory');
  if(machine.availableMemoryGB<8)reasons.push('Close other apps: at least 8 GB estimated available memory is required');
  if(machine.freeDiskGB<8)reasons.push('At least 8 GB free disk is required for training and setup');
  if(setup.setupError)reasons.push(setup.setupError);
  return {request,datasetId:dataset.id,mapping,compatible:reasons.length===0,reasons,scope,recipeVersion:toolRecipeVersion,
    model:{...trainingModel,files:undefined},machine,setup:{runtimeReady:setup.runtimeReady,modelCached:setup.modelCached,managedPython:true,downloadBytes:setup.setupDownloadBytes},
    selectionBasis:'One reviewed trainable sales-reporting recipe; selected by task, Apple Silicon, memory and disk checks. Not a best-model benchmark.',
    dataUse:'Learning uses authored synthetic questions, not your CSV rows. Your CSV is used only for local calculations.',
    action:setup.modelCached&&setup.runtimeReady?'Learn, compare and save tool':'Download setup, learn, compare and save tool'};
}
export async function createToolTask(input,enqueue){
  const recommendation=await recommendTool(input);
  if(!recommendation.compatible)throw Error(recommendation.reasons.join('. '));
  const task={id:randomUUID(),kind:'tool',request:recommendation.request,datasetId:recommendation.datasetId,mapping:recommendation.mapping,status:'queued',createdAt:Date.now(),selection:{reasons:[recommendation.selectionBasis],machine:recommendation.machine},model:{id:trainingModel.repository,revision:trainingModel.revision,runtime:'mlx'}};
  await save('task:'+task.id,task);
  const job=await enqueue('tool-build',task.id,{recipeVersion:toolRecipeVersion});return {taskId:task.id,jobId:job.id};
}
export async function buildTool(job,signal,progress){
  const task=(await state())['task:'+job.taskId];
  if(!task||job.payload.recipeVersion!==toolRecipeVersion)throw Error('Tool recipe unavailable');
  const model=await prepareTraining(signal,progress,{jobId:job.id});
  const result=await runFineTune(job,signal,progress,{data:toolTrainingData(),system:trainingSystem,version:toolRecipeVersion,requireCriticalGate:true});
  signal.throwIfAborted();await progress('Checking saved weights and task rules');
  const harness={version:toolRecipeVersion,system:trainingSystem,mapping:task.mapping,excludedProductCodes:exclusions,scope,runtimeVersions:result.runtimeVersions,runtimeIdentity:model.runtimeSetup.identity};
  const binding=await bindToolArtifacts(result,harness);
  if(model.fingerprint!==binding.base.fingerprint)throw Error('Base weights changed during learning');
  if(!result.gate)throw Error('Critical behavior checks were not recorded');
  const tool={id:task.id,name:'Sales reporting',request:task.request,datasetId:task.datasetId,status:'ready',createdAt:Date.now(),binding,selected:result.selected,evaluation:result,setup:model.runtimeSetup,scope};
  // No latest adapter lookup: each saved tool owns one exact immutable binding.
  signal.throwIfAborted();await save('tool:'+tool.id,tool);
  await save('task:'+task.id,{...task,status:'ready',toolResult:tool,completedAt:Date.now()});
  return tool;
}
export async function queueToolRun(id,input,enqueue){
  if(!input||Object.keys(input).some(k=>!['request','datasetId'].includes(k))||typeof input.request!=='string'||!input.request.trim()||input.request.length>2000)throw Error('Enter a supported reporting question');
  if(/\b(country|countries|region|regions|yesterday|today|week|month|quarter|year|date|dates|filter|january|february|march|april|june|july|august|september|october|november|december)\b|\b20\d{2}\b/i.test(input.request))throw Error('This saved tool supports whole-file reports only. Date, country and custom filters are not implemented; no calculation was run.');
  const s=await state(),tool=s['tool:'+id];if(tool?.status!=='ready')throw Error('Saved tool not found');
  const dataset=s['dataset:'+(input.datasetId??tool.datasetId)];if(!dataset)throw Error('CSV not found');
  validateMapping(dataset,tool.binding.harness.mapping);
  return enqueue('tool-run',id,{request:input.request.trim(),datasetId:dataset.id,bindingFingerprint:tool.binding.fingerprint});
}
export async function runTool(job,signal,progress){
  const s=await state(),tool=s['tool:'+job.taskId];
  if(!tool||tool.binding.fingerprint!==job.payload.bindingFingerprint)throw Error('Saved tool binding mismatch');
  const strict=Boolean(tool.binding.harness.runtimeIdentity);
  if(!await trainingRuntimeReady({allowLegacy:!strict}))throw Error('Saved tool requires its verified local MLX runtime');
  if(strict&&(await managedRuntimeStatus()).spec.id!==tool.binding.harness.runtimeIdentity)throw Error('Saved tool requires its exact original learning runtime; no replacement was used');
  await progress('Verifying your saved model');await verifyToolArtifacts(tool.binding);signal.throwIfAborted();
  const run=path.resolve('.local-lab/reports',job.id);await mkdir(run,{recursive:true});
  const input={model:path.resolve(tool.binding.base.path),adapter:tool.binding.adapter?path.resolve(tool.binding.adapter.path):null,system:tool.binding.harness.system,request:job.payload.request};
  await writeFile(path.join(run,'input.json'),JSON.stringify(input),{mode:0o600});
  await progress(tool.selected==='adapter'?'Running your saved tuned model':'Running the retained base model');
  const execution=localPythonCommand(await trainingPython({allowLegacy:!strict}),['-I','scripts/live-report-worker.py',run]);
  await runLocalProcess(execution.command,execution.args,{signal,timeout:120000,env:isolatedPythonEnv({HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}),marker:{path:'.local-lab/training-runtime-active.json',jobId:job.id}});
  const trial=JSON.parse(await readFile(path.join(run,'output.json'),'utf8'));validateReportingPlan(trial.plan);
  if(trial.loadedModelPath!==input.model||trial.loadedAdapterSHA256!==(tool.binding.adapter?.files['adapters.safetensors'].sha256??null))throw Error('Inference did not load the saved tool weights');
  // Detect accidental adapter substitution or writes during inference too.
  await verifyToolArtifacts(tool.binding);signal.throwIfAborted();
  const result={...trial,requiresConfirmation:true,request:job.payload.request,toolId:tool.id,jobId:job.id,datasetId:job.payload.datasetId,bindingFingerprint:tool.binding.fingerprint,baseRevision:tool.binding.base.revision,baseFingerprint:tool.binding.base.fingerprint,adapterSHA256:tool.binding.adapter?.files['adapters.safetensors'].sha256??null,harnessFingerprint:fingerprint(tool.binding.harness),selection:tool.selected,completedAt:Date.now()};
  await save('toolPreview:'+job.id,result);
  const task=(await state())['task:'+tool.id];await save('task:'+tool.id,{...task,toolPreview:result,toolRun:null});
  return result;
}
export async function queueToolCalculation(id,input,enqueue){
  if(!input||Object.keys(input).some(k=>!['reviewJobId','plan','confirmWholeFile'].includes(k))||input.confirmWholeFile!==true)throw Error('Confirm the whole-file report and its choices before calculating');
  const s=await state(),tool=s['tool:'+id],preview=s['toolPreview:'+input.reviewJobId];
  if(!tool||!preview||preview.toolId!==id||preview.bindingFingerprint!==tool.binding.fingerprint)throw Error('Saved tool review not found or changed');
  const plan=validateReportingPlan(input.plan??preview.plan);
  return enqueue('tool-calculate',id,{reviewJobId:input.reviewJobId,plan,bindingFingerprint:tool.binding.fingerprint,confirmWholeFile:true});
}
export async function calculateTool(job,signal,progress){
  const s=await state(),tool=s['tool:'+job.taskId],preview=s['toolPreview:'+job.payload.reviewJobId];
  if(!tool||!preview||preview.toolId!==tool.id||preview.bindingFingerprint!==tool.binding.fingerprint||job.payload.bindingFingerprint!==tool.binding.fingerprint||job.payload.confirmWholeFile!==true)throw Error('Confirmed saved-tool binding changed');
  signal.throwIfAborted();await progress('Calculating your confirmed whole-file report');
  const harness=tool.binding.harness,dataset=s['dataset:'+preview.datasetId],plan=validateReportingPlan(job.payload.plan);
  const calculated=await liveReport(dataset,validateMapping(dataset,harness.mapping),plan,harness.excludedProductCodes);
  signal.throwIfAborted();
  const result={...preview,...calculated,plan,modelPlan:preview.plan,requiresConfirmation:false,explicitWholeFileConfirmation:true,reviewJobId:preview.jobId,jobId:job.id,completedAt:Date.now()};
  await save('toolRun:'+job.id,result);
  const task=(await state())['task:'+tool.id];await save('task:'+tool.id,{...task,toolPreview:null,toolRun:result});return result;
}
