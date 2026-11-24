import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile,writeFile,lstat,rm,rename} from 'node:fs/promises';
import path from 'node:path';
import {privateDirectory,verifiedDownload,hashFile,validateDownloadPin} from './verified-download.mjs';
import {runLocalProcess} from './local-process.mjs';
import {ownedPath} from './tool-artifacts.mjs';
const exec=promisify(execFile);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function trainingRuntimeSpec(){
  const python=JSON.parse(await readFile(new URL('../installer/python-runtime.json',import.meta.url),'utf8'));
  const wheels=JSON.parse(await readFile(new URL('../installer/training-wheels.lock.json',import.meta.url),'utf8'));
  validateDownloadPin(python);
  if(python.version!=='3.12.16'||!/^[a-f0-9]{64}$/.test(python.executableSHA256)||wheels.schemaVersion!==1||wheels.platform!=='darwin-arm64'||wheels.python!=='3.12'||!Array.isArray(wheels.packages)||wheels.packages.length<3||wheels.packages.length>100)throw Error('Unreviewed training runtime specification');
  const names=new Set();let bytes=python.sizeBytes;
  for(const item of wheels.packages){
    validateDownloadPin(item);
    if(new URL(item.url).hostname!=='files.pythonhosted.org'||!/^[A-Za-z0-9_.+-]+\.whl$/.test(item.filename)||decodeURIComponent(new URL(item.url).pathname.split('/').at(-1))!==item.filename||!/^[A-Za-z0-9_.-]+$/.test(item.name)||!/^[A-Za-z0-9_.+!-]+$/.test(item.version)||names.has(item.name))throw Error('Unreviewed training wheel');
    names.add(item.name);bytes+=item.sizeBytes;
  }
  if(bytes>1024**3)throw Error('Learning setup exceeds the reviewed download budget');
  const id=digest({python,wheels});
  return {python,wheels,id,downloadBytes:bytes,root:path.resolve('.local-lab/training-runtime',id),executable:path.resolve('.local-lab/training-runtime',id,'python/bin/python3.12')};
}
export function isolatedPythonEnv(extra={}){
  const env={...process.env,...extra,PYTHONDONTWRITEBYTECODE:'1',TOKENIZERS_PARALLELISM:'false',PIP_CONFIG_FILE:'/dev/null'};
  for(const key of ['PYTHONPATH','PYTHONHOME','PYTHONUSERBASE','PYTHONEXECUTABLE','__PYVENV_LAUNCHER__','VIRTUAL_ENV','CONDA_PREFIX','DYLD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES'])delete env[key];
  return env;
}
export function localPythonCommand(python,args){
  if(process.platform!=='darwin')throw Error('Local learning execution requires macOS network isolation');
  return {command:'/usr/bin/sandbox-exec',args:['-p','(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*") (remote unix-socket))',python,...args]};
}
const probeScript='import sys,json,platform,importlib.metadata,site; print(json.dumps({"version":".".join(map(str,sys.version_info[:3])),"executable":sys.executable,"prefix":sys.prefix,"basePrefix":sys.base_prefix,"paths":sys.path,"machine":platform.machine(),"isolated":sys.flags.isolated,"userSite":site.ENABLE_USER_SITE,"packages":{d.metadata["Name"].lower().replace("_","-"):d.version for d in importlib.metadata.distributions()}}))';
function validateProbe(probe,spec,{packages=true}={}){
  if(probe.version!==spec.python.version||probe.machine!=='arm64'||probe.prefix!==path.join(spec.root,'python')||probe.basePrefix!==probe.prefix||probe.executable!==spec.executable||probe.isolated!==1||probe.userSite!==false)throw Error('Learning runtime did not start in its app-owned isolated Python');
  if(!Array.isArray(probe.paths)||probe.paths.some(p=>!p.startsWith(probe.prefix+path.sep)))throw Error('Learning runtime imported paths outside its app-owned Python');
  if(packages)for(const item of spec.wheels.packages)if(probe.packages[item.name.toLowerCase().replaceAll('_','-')]!==item.version)throw Error('Learning runtime package mismatch: '+item.name);
  return probe;
}
async function probeRuntime(spec,options){
  const {stdout}=await exec(spec.executable,['-I','-c',probeScript],{env:isolatedPythonEnv(),timeout:15000,maxBuffer:256*1024});
  return validateProbe(JSON.parse(stdout),spec,options);
}
async function regularJSON(file){const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Runtime record must be a regular file');return JSON.parse(await readFile(file,'utf8'));}
async function ownerCheck(spec){
  const info=await lstat(spec.root);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Managed runtime must be a real app-owned directory');
  await ownedPath(spec.root);
  let owner;try{owner=await regularJSON(path.join(spec.root,'owner.json'));}catch(error){if(error.code==='ENOENT')throw Error('Unknown runtime directory preserved; ownership record is missing');throw error;}
  if(owner.schemaVersion!==1||owner.identity!==spec.id)throw Error('Unknown runtime directory preserved; setup cannot replace it');
}
export async function managedRuntimeStatus(){
  const spec=await trainingRuntimeSpec();
  try{
    await ownerCheck(spec);
    const receipt=await regularJSON(path.join(spec.root,'receipt.json'));
    if(receipt.identity!==spec.id||receipt.pythonSHA256!==spec.python.sha256)throw Error('Learning setup receipt does not match the reviewed runtime');
    await ownedPath(spec.executable);
    if((await hashFile(spec.executable)).sha256!==spec.python.executableSHA256)throw Error('App-owned Python executable failed verification');
    const probe=await probeRuntime(spec);return {ready:true,spec,probe,receipt};
  }catch(error){if(error.code==='ENOENT')return {ready:false,spec};return {ready:false,spec,error:error.message};}
}
export async function trainingPython({allowLegacy=false}={}){
  const status=await managedRuntimeStatus();if(status.ready)return status.spec.executable;
  if(status.error)throw Error(status.error);
  if(allowLegacy){
    // Compatibility for previously saved development tools, never global Python.
    const legacy=path.resolve('.venv/bin/python');
    try{const {stdout}=await exec(legacy,['-I','-c','import importlib.metadata,json;print(json.dumps([importlib.metadata.version(p) for p in ["mlx","mlx-lm","transformers"]]))'],{env:isolatedPythonEnv(),timeout:15000});if(JSON.stringify(JSON.parse(stdout))===JSON.stringify(['0.32.4','0.32.2','5.22.1']))return legacy;}catch{}
  }
  throw Error('Download the local learning setup before using this tool');
}
const pythonLinks={
  'python/bin/2to3':'2to3-3.12','python/bin/idle3':'idle3.12','python/bin/pydoc3':'pydoc3.12',
  'python/bin/python':'python3.12','python/bin/python3':'python3.12','python/bin/python3-config':'python3.12-config',
  'python/lib/pkgconfig/python3-embed.pc':'python-3.12-embed.pc','python/lib/pkgconfig/python3.pc':'python-3.12.pc',
  'python/share/man/man1/python.1':'python3.12.1','python/share/man/man1/python3.1':'python3.12.1',
};
export function validatePythonLayout(listing,verbose){
  const entries=listing.trim().split('\n');const seen=new Set();
  for(const name of entries){
    if(!/^python\/[A-Za-z0-9_.+@/-]+$/.test(name)||name.split('/').includes('..')||name.includes('//')||seen.has(name))throw Error('Unsafe Python archive path');seen.add(name);
  }
  if(!seen.has('python/bin/python3.12'))throw Error('Python executable missing from archive');
  const lines=verbose.trim().split('\n');if(lines.length!==entries.length)throw Error('Python archive listing mismatch');
  for(const line of lines){
    if(['-','d'].includes(line[0]))continue;
    if(line[0]!=='l')throw Error('Unsafe special Python archive entry');
    const matched=Object.entries(pythonLinks).some(([name,target])=>line.endsWith(' '+name+' -> '+target));
    if(!matched)throw Error('Unsafe Python archive link');
  }
}
export async function bootstrapTrainingRuntime(signal,progress,{jobId='setup'}={}){
  if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Local learning setup currently supports Apple Silicon macOS');
  try{await lstat('.local-lab/training-runtime-active.json');throw Error('An interrupted learning setup is recorded. Its process cleanup must be confirmed before retrying.');}catch(error){if(error.code!=='ENOENT')throw error;}
  const current=await managedRuntimeStatus();if(current.ready)return {...current,cacheReused:true,downloadedBytes:0};
  if(current.error)throw Error(current.error);
  const spec=current.spec;const downloads=await privateDirectory(path.join('.local-lab/downloads/training',spec.id));
  await privateDirectory('.local-lab/training-runtime');
  let downloadedBytes=0,cacheFiles=0;
  await progress('Downloading your private learning setup');
  const archive=await verifiedDownload(spec.python,path.join(downloads,spec.python.filename),{signal});downloadedBytes+=archive.downloadedBytes;cacheFiles+=Number(archive.cacheReused);
  const wheelDir=await privateDirectory(path.join(downloads,'wheels'));
  for(let i=0;i<spec.wheels.packages.length;i++){
    signal.throwIfAborted();await progress(`Downloading learning components · ${i+1} of ${spec.wheels.packages.length}`);
    const item=spec.wheels.packages[i],result=await verifiedDownload(item,path.join(wheelDir,item.filename),{signal});downloadedBytes+=result.downloadedBytes;cacheFiles+=Number(result.cacheReused);
  }
  signal.throwIfAborted();await progress('Verifying and installing local Python');
  const [listing,verbose]=await Promise.all([
    exec('/usr/bin/tar',['-tzf',archive.path],{signal,timeout:30000,maxBuffer:8*1024*1024}),
    exec('/usr/bin/tar',['-tvzf',archive.path],{signal,timeout:30000,maxBuffer:8*1024*1024,env:{...process.env,LC_ALL:'C'}}),
  ]);validatePythonLayout(listing.stdout,verbose.stdout);
  // A cancelled install is never exposed as ready. Only this exact owned,
  // incomplete version directory may be recreated; verified downloads survive.
  try{
    await ownerCheck(spec);
    try{await lstat(path.join(spec.root,'receipt.json'));throw Error('Completed runtime exists but failed verification; it was preserved');}catch(error){if(error.code!=='ENOENT')throw error;}
    await rm(spec.root,{recursive:true});
  }catch(error){if(error.code!=='ENOENT')throw error;}
  await privateDirectory(spec.root);
  await writeFile(path.join(spec.root,'owner.json'),JSON.stringify({schemaVersion:1,identity:spec.id}),{mode:0o600,flag:'wx'});
  await exec('/usr/bin/tar',['-xzf',archive.path,'--no-same-owner','-C',spec.root],{signal,timeout:30000});
  if((await hashFile(spec.executable)).sha256!==spec.python.executableSHA256)throw Error('Extracted Python executable checksum mismatch');
  await probeRuntime(spec,{packages:false});
  const requirements=spec.wheels.packages.map(item=>`${item.name}==${item.version} --hash=sha256:${item.sha256}`).join('\n')+'\n';
  const lock=path.join(spec.root,'requirements.lock');await writeFile(lock,requirements,{mode:0o600});
  const marker={path:'.local-lab/training-runtime-active.json',jobId};
  await progress('Installing verified learning components');
  await runLocalProcess(spec.executable,['-I','-m','pip','--isolated','--disable-pip-version-check','--no-cache-dir','install','--prefix',path.join(spec.root,'python'),'--no-index','--no-deps','--only-binary=:all:','--require-hashes','--find-links',wheelDir,'-r',lock],{signal,timeout:10*60*1000,maxBuffer:8*1024*1024,env:isolatedPythonEnv(),marker});
  await runLocalProcess(spec.executable,['-I','-m','pip','--isolated','--disable-pip-version-check','--no-cache-dir','check'],{signal,timeout:30000,env:isolatedPythonEnv(),marker});
  const probe=await probeRuntime(spec);await progress('Starting your local learning engine');
  const startup=localPythonCommand(spec.executable,['-I','-c','import mlx.core as mx; from mlx_lm import load; import transformers; x=mx.array([1.0,2.0]); mx.eval(x+x); print("Local MLX engine started")']);
  await runLocalProcess(startup.command,startup.args,{signal,timeout:60000,env:isolatedPythonEnv(),marker});
  const receipt={schemaVersion:1,identity:spec.id,pythonSHA256:spec.python.sha256,pythonExecutableSHA256:spec.python.executableSHA256,pythonSource:spec.python.source,wheelCount:spec.wheels.packages.length,downloadedBytes,verifiedCacheFiles:cacheFiles,probe,mlxStartupVerified:true,completedAt:new Date().toISOString()};
  signal.throwIfAborted();await writeFile(path.join(spec.root,'receipt.pending.json'),JSON.stringify(receipt,null,2),{mode:0o600});await rename(path.join(spec.root,'receipt.pending.json'),path.join(spec.root,'receipt.json'));
  return {ready:true,spec,probe,receipt,cacheReused:downloadedBytes===0,downloadedBytes};
}
