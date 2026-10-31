// Reviewed official Ollama artifacts, verified 2026-10-31. Budgets are conservative app estimates at 8192 context, not vendor minima.
export const catalogVersion='2026-10-31-v1';
export const catalog=[
 {id:'qwen3:4b',digest:'359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7',runtime:'ollama',family:'qwen3',quantization:'Q4_K_M',downloadGB:2.5,memoryBudgetGB:6,diskBudgetGB:6,minSystemMemoryGB:8,context:8192,license:'Apache-2.0',modalities:['text'],structuredOutput:true,tasks:['text','document','csv','code'],specialty:'general',tuning:'Reviewed MLX Qwen3-4B candy/retail recipes only; separate pinned MLX base required.',source:'https://ollama.com/library/qwen3:4b',reason:'General text, document and structured analytics candidate; existing local analytics validation.'},
 {id:'qwen2.5-coder:1.5b',digest:'d7372fd828518a4d38b1eb196c673c31a85f2ed302b3d1e406c4c2d1b64a0668',runtime:'ollama',family:'qwen2',quantization:'Q4_K_M',downloadGB:0.986,memoryBudgetGB:3,diskBudgetGB:3,minSystemMemoryGB:6,context:8192,license:'Apache-2.0',modalities:['text'],structuredOutput:true,tasks:['code','text','document','csv'],specialty:'code',tuning:'Unavailable: no reviewed training recipe for this base. Baseline execution supported.',source:'https://ollama.com/library/qwen2.5-coder:1.5b',reason:'Smaller instruction-tuned coding specialist; general text fallback under tighter resource/download budgets.'},
];
export function catalogModel(id){const m=catalog.find(m=>m.id===id);if(!m)throw Error('Choose a reviewed catalog model');return m;}
export function taskRequirements(input={}){
 if(typeof input.request!=='string'||input.request.trim().length<3||input.request.length>4000)throw Error('Describe the task in 3–4000 characters');
 // A request to train, tune or teach a model routes to the autonomous tuner (recipes), not to a chat model.
 const tuneWords=/\b(train|tune|tuning|fine-?tun\w*|teach|recogni[sz]\w*|classif\w*|detect\w*|vision|photos?|images?|pictures?)\b/i;
 let kind=input.inputKind??(input.documentId?'document':input.datasetId?'csv':tuneWords.test(input.request)?'tune':/\b(code|python|javascript|typescript|function|debug|sql|programming)\b/i.test(input.request)?'code':'text');
 if(!['text','code','document','csv','image','audio','video','tune'].includes(kind))throw Error('Unsupported input kind');
 const preferences={priority:'balanced',allowDownload:true,...input.preferences};
 if(!['balanced','speed','quality'].includes(preferences.priority)||typeof preferences.allowDownload!=='boolean'||(preferences.maxDownloadGB!==undefined&&(!Number.isFinite(preferences.maxDownloadGB)||preferences.maxDownloadGB<0)))throw Error('Invalid model preferences');
 return {kind,modality:kind==='tune'?'image':['image','audio','video'].includes(kind)?kind:'text',structuredOutput:true,tools:input.requiresTools===true,preferences,classifier:'Deterministic task/input rules; no model download required'};
}
// Tuning recipes are offered like catalog models: one is selected, with explicit readiness reasons.
export function recommendRecipes(requirements,environment){
 const {machine,recipes=[],recipeRuntime={ready:false,error:'Recipe runtime not checked'}}=environment;
 const candidates=recipes.map(recipe=>{
  const reasons=[];
  if(!recipeRuntime.ready)reasons.push(recipeRuntime.error||'Recipe runtime unavailable');
  if(!recipe.dataReady)reasons.push('Recipe data is not present in '+recipe.source);
  return {...recipe,installed:recipe.dataReady,compatible:reasons.length===0,setupRequired:reasons.length>0,downloadRequiredGB:0,memoryBudgetGB:2,diskBudgetGB:1,score:100,tuning:'Autonomous loop: executor trains, judge scores held-out, proposer changes one knob per round within bounds.',reasons:reasons.length?reasons:[recipe.description,recipe.backbone,recipe.data]};
 }).sort((a,b)=>Number(b.compatible)-Number(a.compatible));
 return {catalogVersion,requirements,machine,runtime:{ready:recipeRuntime.ready,python:recipeRuntime.python,torch:recipeRuntime.torch},selected:candidates.find(c=>c.compatible)??null,candidates,selectionBasis:'Matched to a tuning recipe by task wording; the loop itself is model-agnostic',runtimeSetup:recipeRuntime.ready?null:recipeRuntime.error};
}
export function recommendModels(input,environment){
 const requirements=taskRequirements(input);
 if(requirements.kind==='tune')return recommendRecipes(requirements,environment);
 const {machine,runtimes,models=[]}=environment,prefs=requirements.preferences;
 const candidates=(environment.catalog??catalog).map(model=>{
  const installed=models.find(m=>m.id===model.id&&m.digest.replace(/^sha256:/,'')===model.digest);
  const reasons=[];
  if(!model.modalities.includes(requirements.modality))reasons.push('This runner cannot interpret '+requirements.modality+' inputs');
  if(machine.platform!=='darwin'||machine.arch!=='arm64')reasons.push('This prototype currently supports Apple Silicon macOS only');
  if(machine.memoryGB<model.minSystemMemoryGB)reasons.push('Insufficient total memory including operating-system headroom');
  if((machine.availableMemoryGB??machine.freeMemoryGB)<model.memoryBudgetGB)reasons.push('Insufficient estimated available memory for weights, working buffers and 8192-token context; close apps and retry');
  if(machine.freeDiskGB<(installed?0.5:model.diskBudgetGB))reasons.push('Insufficient free disk including download/staging headroom');
  if(!installed&&!prefs.allowDownload)reasons.push('Download disabled and reviewed artifact is not installed');
  if(!installed&&prefs.maxDownloadGB!==undefined&&model.downloadGB>prefs.maxDownloadGB)reasons.push('Exceeds requested download budget');
  if(requirements.tools)reasons.push('Tool execution unavailable');
  let score=requirements.kind==='code'?(model.specialty==='code'?100:60):(model.specialty==='general'?100:45);
  if(prefs.priority==='speed')score+=model.specialty==='code'?70:0;
  if(prefs.priority==='quality')score+=model.specialty==='general'?20:0;
  if(installed)score+=5;
  return {...model,installed:!!installed,compatible:reasons.length===0,setupRequired:!installed||!runtimes.ollama.ready,downloadRequiredGB:installed?0:model.downloadGB,score,reasons:reasons.length?reasons:[model.reason,`${model.memoryBudgetGB} GB working-memory budget including context; ${installed?'reuse verified cache':model.downloadGB+' GB download'}`]};
 }).sort((a,b)=>Number(b.compatible)-Number(a.compatible)||b.score-a.score);
 return {catalogVersion,requirements,machine,runtime:runtimes.ollama,selected:candidates.find(c=>c.compatible)??null,candidates,selectionBasis:'Recommended from reviewed catalog rules, not a measured best-model comparison',runtimeSetup:runtimes.ollama.ready?null:'Start the project-owned Ollama runtime with npm run runtime:ollama; runtime installation is a separate prerequisite.'};
}
