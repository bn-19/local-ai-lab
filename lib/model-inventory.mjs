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
 const visionBytes=await directoryBytes(path.join(base,'vision/model'));
 models.push({id:'clip-vit-base-patch32',name:'CLIP ViT-B/32 · local vision',purpose:'Single packaged product classification; separate from CSV model',bytes:visionBytes,onDisk:visionBytes>0,path:path.join(base,'vision/model')});
 const headFile=records['vision:evaluation']?.model?.headFile;
 const visionHeadPath=typeof headFile==='string'&&/^head-result-[a-f0-9-]{36}\.npz$/.test(headFile)?path.join(base,'vision',headFile):null;
 const visionHeadBytes=visionHeadPath?await directoryBytes(visionHeadPath):0;
 if(visionHeadBytes)models.push({id:'clip-candy-head',name:'Candy learned classification head',purpose:'Requires the pinned CLIP base; '+(records['vision:evaluation']?.model?.selected==='linear-head'?'selected':'candidate retained, not selected'),bytes:visionHeadBytes,onDisk:true,path:visionHeadPath});
 const detectorBytes=await directoryBytes(path.join(base,'vision/detector'));
 models.push({id:'grounding-dino-tiny',name:'Grounding DINO Tiny · local detector',purpose:'Experimental visible candy detection; incomplete pile counts',bytes:detectorBytes,onDisk:detectorBytes>0,path:path.join(base,'vision/detector'),license:'Apache-2.0',revision:'a2bb814dd30d776dcf7e30523b00659f4f141c71'});
 const resnetPath=path.join(base,'vision/torch/hub/checkpoints/resnet18-f37072fd.pth');
 const resnetBytes=await directoryBytes(resnetPath);
 if(resnetBytes)models.push({id:'resnet18-candy',name:'ResNet18 · candy crop encoder',purpose:'Shared base for the nine-brand candidate; does not detect boxes',bytes:resnetBytes,onDisk:true,path:resnetPath});
 const friend=records['vision:friend-head-candidate'];let friendBytes=0;
 if(friend&&/^friend-friend-result-[a-f0-9-]{36}\/model\/head\.pt$/.test(friend.headFile)){const p=path.join(base,'vision',friend.headFile);friendBytes=await directoryBytes(p);models.push({id:'friend-candy-head',name:'Nine-brand learned head · unpromoted',purpose:'Requires ResNet18; pile-count acceptance failed',bytes:friendBytes,onDisk:friendBytes>0,path:p,sha256:friend.headSha256});}
 const trainingArtifactsBytes=await directoryBytes(path.join(base,'finetune'))+await directoryBytes(path.join(base,'vision'))-visionBytes-detectorBytes-resnetBytes-friendBytes;
 const modelBytes=ollamaBytes+mlxBytes+visionBytes+detectorBytes+resnetBytes+friendBytes;
 const requestModelBytes=installed.find(m=>m.id==='qwen3:4b')?.size??2497293931;
 const observed= saved.map(([,v])=>v.elapsedSeconds).filter(Number.isFinite);
 return {models,adapters,modelBytes,trainingArtifactsBytes,totalBytes:modelBytes+trainingArtifactsBytes,retention:{automaticDeletion:false,policy:'Kept until explicitly removed. No background expiry or automatic deletion is implemented.',note:'Adapters require the shared MLX base. Run storage includes duplicate checkpoints, logs and evaluation artifacts; removing weights manually will make dependent reports fail.'},firstRun:{downloadOnlyEstimates:[10,50,100].map(mbps=>({mbps,ordinarySeconds:downloadSeconds(requestModelBytes,mbps),trainingSeconds:downloadSeconds(requestModelBytes+(mlxBytes||2278973424),mbps)})),estimateNote:'Ideal download time at the stated sustained bandwidth, excluding installation, server limits, retries and loading. These first-use estimates refer to the Qwen3 request/training path; other catalog models have separate download estimates.',observedTrainingAndEvaluationSeconds:observed,observedAgentLoopSeconds:Object.entries(records).filter(([k,v])=>k.startsWith("loop:")&&v.status==="complete"&&v.completedAt>v.startedAt).map(([,v])=>(v.completedAt-v.startedAt)/1000),trainingNote:'Measured on this Mac; includes baseline, training and candidate evaluation, excludes first installation and downloads. First-run setup remains manual in this prototype.'}};
}
