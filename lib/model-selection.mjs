import {randomUUID} from 'node:crypto';
import {save} from './actors.mjs';
import {sharedCatalog} from './shared-catalog.mjs';
import {health} from './health.mjs';
import {recommendModels,catalogModel} from './model-catalog.mjs';
import {verifyModel} from './model.mjs';
export async function recommendation(input){
 const startedAt=Date.now();
 const [environment,shared]=await Promise.all([health(),sharedCatalog()]);
 const measuredAt=Date.now();
 const report={...recommendModels(input,{...environment,catalog:shared.catalog}),catalogSource:shared.source,id:randomUUID()};
 report.events=[{actor:'System',phase:'hardware',status:'completed',startedAt,at:measuredAt,summary:'Checked this Mac, runtime and installed models'},{actor:'System',phase:'selection',status:'completed',at:Date.now(),summary:report.selected?'Recommended '+report.selected.id+': '+report.selected.reasons[0]:'No reviewed model meets the task and machine constraints'}];
 await save('recommendation:'+report.id,{id:report.id,selectedId:report.selected?.id??null,requirements:report.requirements,catalogSource:report.catalogSource,events:report.events,createdAt:startedAt});
 return report;
}
export async function selectedTaskModel(input){
 const report=await recommendation(input);
 const chosen=input.modelId?report.candidates.find(m=>m.id===input.modelId):report.selected;
 if(!chosen?.compatible)throw Error('No compatible selected model: '+(chosen?.reasons.join('; ')??report.candidates.flatMap(m=>m.reasons).join('; ')));
 if(!chosen.installed)throw Error('Setup required for recommended '+chosen.id+'; approve its model installation first');
 return {model:await verifyModel({id:chosen.id,context:chosen.context}),selection:{recommendationId:report.id,events:report.events,catalogVersion:report.catalogVersion,catalogSource:report.catalogSource,requirements:report.requirements,reasons:chosen.reasons,machine:report.machine,selectedAt:Date.now(),basis:report.selectionBasis}};
}
export async function checkInstall(modelId){
 const model=catalogModel(modelId);
 const report=await recommendation({request:model.specialty==='code'?'Write code':'General text',inputKind:model.specialty==='code'?'code':'text'});
 const candidate=report.candidates.find(m=>m.id===modelId);
 if(!candidate)throw Error("Model is not enabled in the reviewed catalog");
 if(!candidate.compatible)throw Error(candidate.reasons.join('; '));
 if(!report.runtime.ready)throw Error(report.runtimeSetup);
 return candidate;
}
