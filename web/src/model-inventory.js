import {element as el,number} from './dashboard.js';
const size=bytes=>bytes>=1e9?`${number(bytes/1e9)} GB`:`${number(bytes/1e6)} MB`;
export function modelInventoryView(api){
 const body=el('div',{},el('p',{},'Loading actual disk inventory…'));
 const panel=el('details',{},el('summary',{},'Saved models on this Mac'),body);
 async function refresh(){
  body.replaceChildren(el('p',{},'Checking saved models…'));
  try{
   const inventory=await api.get('/api/models/inventory');if(!api.connected||!panel.isConnected)return;
   body.replaceChildren(el('p',{},`${size(inventory.totalBytes)} in models and training runs · ${size(inventory.modelBytes)} base models · ${size(inventory.trainingArtifactsBytes)} training runs`),el('p',{},inventory.retention.policy));
   for(const model of inventory.models)body.append(el('div',{class:'task-row'},el('div',{},el('h3',{},model.name),el('p',{},`${model.onDisk?'Installed':'Missing'} · ${size(model.bytes)} · ${model.purpose}`),el('details',{},el('summary',{},'Disk location'),el('code',{},model.path)))));
   for(const model of inventory.adapters)body.append(el('div',{class:'task-row'},el('div',{},el('h3',{},model.name),el('p',{},`${model.selected?'Selected':'Saved, not selected'} · ${model.onDisk?size(model.bytes):'Weights missing'} · ${model.baselineScore}/${model.total} → ${model.score}/${model.total}`),el('p',{},`Requires shared ${model.baseModel}. Run artifacts: ${size(model.runBytes)}. Last used: ${model.lastUsedAt?new Date(model.lastUsedAt).toLocaleString():'Not used for a live report yet'}.`),el('details',{},el('summary',{},'Disk location and checksum'),el('code',{},model.path),el('p',{},model.sha256)))));
   if(!inventory.adapters.length)body.append(el('p',{},'No trained adapters saved yet.'));
   const first=el('details',{},el('summary',{},'What happens on the first request?'),el('p',{},inventory.firstRun.estimateNote));
   for(const estimate of inventory.firstRun.downloadOnlyEstimates)first.append(el('p',{},`${estimate.mbps} Mbps: about ${Math.ceil(estimate.ordinarySeconds/60)} minutes for the request model; ${Math.ceil(estimate.trainingSeconds/60)} minutes for both runtime copies. Download only.`));
   first.append(el('p',{},inventory.firstRun.trainingNote),el('p',{},`Measured training/evaluation runs on this Mac: ${inventory.firstRun.observedTrainingAndEvaluationSeconds.map(s=>(s/60).toFixed(1)+' min').join(', ')||'not measured'}. Complete agent-loop runs: ${(inventory.firstRun.observedAgentLoopSeconds||[]).map(s=>(s/60).toFixed(1)+' min').join(', ')||'not measured yet'}.`),el('p',{},'Once downloaded, the base models are shared across adapters. Later requests reuse them. Saved weights do not expire automatically.'));
   body.append(first,el('p',{class:'muted'},inventory.retention.note),el('button',{class:'secondary',type:'button',onClick:refresh},'Refresh disk inventory'));
  }catch(e){if(api.connected)body.replaceChildren(el('p',{},'Inventory unavailable: '+e.message));}
 }
 let loaded=false;panel.addEventListener('toggle',()=>{if(panel.open&&!loaded){loaded=true;refresh();}});
 return panel;
}
