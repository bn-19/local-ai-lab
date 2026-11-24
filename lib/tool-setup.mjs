import {access,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {runLocalProcess} from './local-process.mjs';
import {trainingModel,writeTrainingModelRecord} from './tool-artifacts.mjs';
import {managedRuntimeStatus,trainingPython,bootstrapTrainingRuntime,isolatedPythonEnv} from './managed-python.mjs';
export async function trainingRuntimeReady(options={}){try{await trainingPython(options);return true;}catch{return false;}}
export async function setupAvailability(){
  const status=await managedRuntimeStatus();
  let modelCached=false;try{await Promise.all(Object.keys(trainingModel.files).map(name=>access(path.join(trainingModel.path,name))));modelCached=true;}catch{}
  return {runtimeReady:status.ready,pythonAvailable:true,managedBootstrap:true,setupError:status.error??null,setupDownloadBytes:status.ready?0:status.spec.downloadBytes,modelCached};
}
export async function prepareTraining(signal,progress,{jobId='setup'}={}){
  const status=await setupAvailability();
  const setup=await bootstrapTrainingRuntime(signal,progress,{jobId});
  if(!status.modelCached){
    await progress('Downloading the selected local model');
    await mkdir('.local-lab/finetune',{recursive:true});
    await runLocalProcess(await trainingPython(),['-I','scripts/download-training-model.py'],{signal,timeout:20*60*1000,maxBuffer:8*1024*1024,env:isolatedPythonEnv(),marker:{path:'.local-lab/training-runtime-active.json',jobId}});
  }
  await progress('Verifying the downloaded model');signal.throwIfAborted();
  const model=await writeTrainingModelRecord();signal.throwIfAborted();
  return {...model,runtimeSetup:{identity:setup.spec.id,pythonVersion:setup.spec.python.version,pythonSHA256:setup.spec.python.sha256,downloadedBytes:setup.downloadedBytes,cacheReused:setup.cacheReused,receipt:setup.receipt}};
}
