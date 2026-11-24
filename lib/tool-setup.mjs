import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access, mkdir, readFile, writeFile, unlink, lstat} from 'node:fs/promises';
import path from 'node:path';
import {runLocalProcess} from './local-process.mjs';
import {trainingModel,writeTrainingModelRecord} from './tool-artifacts.mjs';
const exec=promisify(execFile);
const versions={mlx:'0.32.4','mlx-lm':'0.32.2',transformers:'5.22.1'};
export async function trainingRuntimeReady(){
  try{
    const {stdout}=await exec(path.resolve('.venv/bin/python'),['-c','import importlib.metadata,json; print(json.dumps({p:importlib.metadata.version(p) for p in ["mlx","mlx-lm","transformers"]}))'],{timeout:15000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    return JSON.stringify(JSON.parse(stdout))===JSON.stringify(versions);
  }catch{return false;}
}
export async function setupAvailability(){
  const runtimeReady=await trainingRuntimeReady();let python=null;
  for(const candidate of ['/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12','/opt/homebrew/bin/python3.12']){
    try{const {stdout}=await exec(candidate,['-c','import sys; print(".".join(map(str,sys.version_info[:2])))'],{timeout:5000});if(stdout.trim()==='3.12'){python=candidate;break;}}catch{}
  }
  let cached=false;try{await Promise.all(Object.keys(trainingModel.files).map(name=>access(path.join(trainingModel.path,name))));cached=true;}catch{}
  return {runtimeReady,pythonAvailable:runtimeReady||Boolean(python),python,modelCached:cached};
}
export async function prepareTraining(signal,progress){
  const status=await setupAvailability();
  if(!status.pythonAvailable)throw Error('Local training needs Python 3.12 on this Mac. This first development slice cannot install Python automatically yet.');
  if(!status.runtimeReady){
    await progress('Installing the local learning runtime');
    const marker='.local-lab/training-setup.json';let pending;
    try{pending=JSON.parse(await readFile(marker,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    let exists=false;try{const info=await lstat('.venv');if(info.isSymbolicLink())throw Error('Training environment symlinks are not supported for automatic setup');exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(exists&&!(pending?.version==='training-setup-v1'&&pending?.path==='.venv'))throw Error('An incompatible pre-existing training environment was preserved. Use a separate development workspace.');
    await mkdir('.local-lab',{recursive:true});
    await writeFile(marker,JSON.stringify({version:'training-setup-v1',path:'.venv'}),{mode:0o600});
    // Only environments created by this app may be repaired/resumed after cancellation.
    await runLocalProcess(status.python,['-m','venv','.venv'],{signal,timeout:120000});
    await runLocalProcess(path.resolve('.venv/bin/python'),['-m','pip','install','--disable-pip-version-check','-r','requirements-training.txt'],{signal,timeout:10*60*1000,maxBuffer:8*1024*1024,env:{...process.env,PIP_NO_INPUT:'1',PIP_CACHE_DIR:path.resolve('.local-lab/pip-cache')}});
    if(!await trainingRuntimeReady())throw Error('Training runtime version verification failed');
    await unlink(marker);
  }
  if(!status.modelCached){
    await progress('Downloading the selected local model');
    await mkdir('.local-lab/finetune',{recursive:true});
    await runLocalProcess(path.resolve('.venv/bin/python'),['scripts/download-training-model.py'],{signal,timeout:20*60*1000,maxBuffer:8*1024*1024});
  }
  await progress('Verifying the downloaded model');
  signal.throwIfAborted();
  const model=await writeTrainingModelRecord();signal.throwIfAborted();return model;
}
