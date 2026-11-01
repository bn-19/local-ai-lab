import {readFile,writeFile,mkdir,mkdtemp,rename,rm,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify,parseArgs,isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {assertPortsFree} from './processes.mjs';
const exec=promisify(execFile);
const mutable=['.local-lab','.durable-actors','node_modules','web/node_modules'];
function dependencyIdentity(bytes){const value=JSON.parse(bytes);delete value.version;if(value.packages?.[''])delete value.packages[''].version;return value;}
async function exists(p){try{return await lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}

// Source-only update: dependency/runtime changes need a separate installer.
// Never remove the previous source, user data, weights or unknown user files.
export async function updateRuntime({runtime,bundle},{afterTransfer=async()=>{},signal}={}) {
 runtime=path.resolve(runtime);bundle=path.resolve(bundle);
 const rootStat=await lstat(runtime);
 if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw Error('Runtime must be an existing real directory');
 if(await exists(path.join(runtime,'.local-lab/launcher/session.json')))throw Error('Stop Local Lab before updating');
 try {const old=JSON.parse(await readFile(path.join(runtime,'.local-lab/executor.json'),'utf8'));try{process.kill(old.pid,0);throw Error('Previous executor may still be alive; stop it before updating');}catch(e){if(e.code!=='ESRCH')throw e;}}catch(e){if(e.code!=='ENOENT')throw e;}
 await assertPortsFree([4173,11435,7100]);
 const metadata=path.join(runtime,'.local-lab/installer/release-manifest.json');
 const previous=await readFile(metadata);
 const manifest=JSON.parse(await readFile(path.join(bundle,'release-manifest.json'),'utf8'));
 if(manifest.schemaVersion!==1||! /^[a-f0-9]{40}$/.test(manifest.source?.commit)||! /^[a-f0-9]{64}$/.test(manifest.source?.sha256))throw Error('Invalid source manifest');
 const archive=path.join(bundle,'source.tar.gz');
 if(createHash('sha256').update(await readFile(archive)).digest('hex')!==manifest.source.sha256)throw Error('Source hash mismatch');
 const common=path.join(bundle,'installer/macos/common.sh');
 await exec('/bin/bash',['-c','. "$1"; check_archive "$2"; check_layout "$2" source','check',common,archive]);
 const stage=await mkdtemp(path.join(path.dirname(runtime),'.local-lab-source-update-'));
 const backup=runtime+'.source-backup-'+randomUUID();
 const moved=[];let backedUp=false,committed=false,rollbackFailed=false;
 try {
  await exec('/usr/bin/tar',['-xzf',archive,'-C',stage,'--strip-components','1']);
  for(const f of ['package-lock.json','web/package-lock.json','installer/runtime-pins.json']){
   let same=false;try{same=isDeepStrictEqual(dependencyIdentity(await readFile(path.join(runtime,f))),dependencyIdentity(await readFile(path.join(stage,f))));}catch{}
   if(!same)throw Error('Dependency or runtime changes require a full installation; existing runtime was preserved');
  }
  // Build before moving any installed data; only trusted packaged build code runs.
  await exec(process.execPath,[path.join(stage,'web/scripts/build.mjs')],{cwd:stage,timeout:60000,signal,env:{...process.env,VERCEL_GIT_COMMIT_SHA:manifest.source.commit}});
  for(const relative of mutable){const s=await exists(path.join(runtime,relative));if(s&&(!s.isDirectory()||s.isSymbolicLink()))throw Error('Mutable runtime directories must be real directories');}
  signal?.throwIfAborted();
  await rename(runtime,backup);backedUp=true;
  for(const relative of mutable)if(await exists(path.join(backup,relative))){
   await mkdir(path.dirname(path.join(stage,relative)),{recursive:true});
   await rename(path.join(backup,relative),path.join(stage,relative));moved.push(relative);signal?.throwIfAborted();
  }
  await afterTransfer();
  await writeFile(path.join(stage,'.local-lab/installer/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  for(const f of ['Start.command','Stop.command'])await writeFile(path.join(stage,f),await readFile(path.join(bundle,f)),{mode:0o700});
  await writeFile(path.join(backup,'previous-release-manifest.json'),previous,{mode:0o600});
  signal?.throwIfAborted();
  await rename(stage,runtime);committed=true;
  return {sourceCommit:manifest.source.commit,backup};
 } catch(error) {
  if(backedUp&&!committed)try{
   for(const relative of moved.reverse())await rename(path.join(stage,relative),path.join(backup,relative));
   await writeFile(path.join(backup,'.local-lab/installer/release-manifest.json'),previous,{mode:0o600});
   await rename(backup,runtime);
  }catch{rollbackFailed=true;throw Error('Source update stopped; recovery folders were retained beside Runtime. Do not remove them.');}
  throw error;
 }finally{if(!committed&&!rollbackFailed)await rm(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&await realpath(process.argv[1]).catch(()=>null)===await realpath(fileURLToPath(import.meta.url))){
 const controller=new AbortController();
 const cancel=()=>controller.abort(Error('Source update cancelled'));
 process.on('SIGTERM',cancel);process.on('SIGINT',cancel);
 try{const {values}=parseArgs({options:{runtime:{type:'string'},bundle:{type:'string'}}});if(!values.runtime||!values.bundle)throw Error('Expected --runtime and --bundle');const result=await updateRuntime(values,{signal:controller.signal});console.log('Local runtime source updated; saved work and weights preserved. Previous source: '+result.backup);}
 catch(error){console.error(error.message);process.exitCode=1;}
 finally{process.off('SIGTERM',cancel);process.off('SIGINT',cancel);}
}
