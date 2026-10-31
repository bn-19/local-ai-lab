import {models as installedModels} from './model.mjs';
import {lstat,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
export async function directoryBytes(root){
 try{const info=await lstat(root);if(info.isSymbolicLink())return 0;if(!info.isDirectory())return info.size;let total=0;for(const name of await readdir(root))total+=await directoryBytes(path.join(root,name));return total;}catch(e){if(e.code==='ENOENT')return 0;throw e;}
}
export function downloadSeconds(bytes,mbps){if(!Number.isFinite(bytes)||bytes<0||!Number.isFinite(mbps)||mbps<=0)throw Error('Invalid download estimate');return Math.ceil(bytes*8/(mbps*1000000));}
export async function modelInventory(records){
 const base=path.resolve('.local-lab');
 const ollamaBytes=await directoryBytes(path.join(base,'models','blobs'));
 const mlxBytes=await directoryBytes(path.join(base,'models','qwen3-4b-mlx'));
 const saved=Object.entries(records).filter(([k])=>k.startsWith('fineTune:'));
 const selected={};for(const [key,v]of saved)if(v.selected==='adapter')selected[v.profile??'retail']=key.slice(9);
 for(const [key,v]of Object.entries(records))if(key.startsWith('selectedAdapter:'))selected[key.slice(16)]=v.jobId;
 const reports=Object.entries(records).filter(([k])=>k.startsWith('report:')).map(([,v])=>v);
 const adapters=[];
 for(const [key,v]of saved){
  const file=path.resolve(v.adapterPath??'');if(!file.startsWith(path.join(base,'finetune')+path.sep))continue;
  let bytes=0;try{bytes=(await lstat(file)).size;}catch(e){if(e.code!=='ENOENT')throw e;}
  const profile=v.profile??'retail';
  const used=reports.filter(r=>r.adapterSHA256===v.adapterSHA256).map(r=>r.completedAt||0);
  adapters.push({id:key.slice(9),name:profile==='candy'?'Candy reporting adapter':'Retail reporting adapter',profile,bytes,onDisk:bytes>0,runBytes:await directoryBytes(path.dirname(path.dirname(file))),path:file,baseModel:'Qwen3 4B · MLX 4-bit',baseRequired:true,selected:selected[profile]===key.slice(9),lastUsedAt:used.length?Math.max(...used):null,baselineScore:v.baseline?.score,score:v.adapted?.score,total:v.total,sha256:v.adapterSHA256});
 }
 let mlxRevision=null;try{mlxRevision=JSON.parse(await readFile(path.join(base,'finetune/model.json'))).revision;}catch{}
 let installed=[];try{installed=await installedModels();}catch{}
 const models=[...installed.map(m=>({id:m.id,name:m.id+' · Ollama',purpose:'Task-bound local inference',bytes:m.size,onDisk:true,path:path.join(base,'models'),shared:true,digest:m.digest})),{id:'qwen3-4b-mlx',name:'Qwen3 4B · MLX 4-bit',purpose:'Reviewed Qwen3 fine-tuning and adapter inference',bytes:mlxBytes,onDisk:mlxBytes>0,path:path.join(base,'models/qwen3-4b-mlx'),shared:true,revision:mlxRevision}];
 const trainingArtifactsBytes=await directoryBytes(path.join(base,'finetune'));
 const modelBytes=ollamaBytes+mlxBytes;
 const requestModelBytes=installed.find(m=>m.id==='qwen3:4b')?.size??2497293931;
 const observed= saved.map(([,v])=>v.elapsedSeconds).filter(Number.isFinite);
 return {models,adapters,modelBytes,trainingArtifactsBytes,totalBytes:modelBytes+trainingArtifactsBytes,retention:{automaticDeletion:false,policy:'Kept until explicitly removed. No background expiry or automatic deletion is implemented.',note:'Adapters require the shared MLX base. Run storage includes duplicate checkpoints, logs and evaluation artifacts; removing weights manually will make dependent reports fail.'},firstRun:{downloadOnlyEstimates:[10,50,100].map(mbps=>({mbps,ordinarySeconds:downloadSeconds(requestModelBytes,mbps),trainingSeconds:downloadSeconds(requestModelBytes+(mlxBytes||2278973424),mbps)})),estimateNote:'Ideal download time at the stated sustained bandwidth, excluding installation, server limits, retries and loading. These first-use estimates refer to the Qwen3 request/training path; other catalog models have separate download estimates.',observedTrainingAndEvaluationSeconds:observed,observedAgentLoopSeconds:Object.entries(records).filter(([k,v])=>k.startsWith("loop:")&&v.status==="complete"&&v.completedAt>v.startedAt).map(([,v])=>(v.completedAt-v.startedAt)/1000),trainingNote:'Measured on this Mac; includes baseline, training and candidate evaluation, excludes first installation and downloads. First-run setup remains manual in this prototype.'}};
}
