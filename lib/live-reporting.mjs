import {candySystem,candyPolicy,validateCandyPlan} from './candy.mjs';
import {runLocalProcess} from './local-process.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {trainingSystem} from './finetune-data.mjs';
import {reportingSchema,rules} from './reporting.mjs';
// Audited against the public UCI CSV descriptions; explicit live dataset policy.
export const retailExcludedCodes=['POST','ADJUST','DOT','D','M','C2','BANK CHARGES','AMAZONFEE','B','CRUK'];
export function validateExclusions(codes=retailExcludedCodes){
 if(!Array.isArray(codes)||codes.length>100||codes.some(c=>typeof c!=='string'||!c.length||c.length>100))throw Error('Supply at most 100 non-product codes');
 return [...new Set(codes)];
}
export const retailMapping={order:'InvoiceNo',product:'StockCode',quantity:'Quantity',unitPrice:'UnitPrice'};
export function validateMapping(dataset,mapping){
 if(!mapping||Object.keys(mapping).length!==4)throw Error('Map order, product, quantity and unitPrice columns');
 for(const key of Object.keys(retailMapping)){
  const column=dataset.columns.find(c=>c.name===mapping[key]);
  if(!column)throw Error('Missing mapped column: '+key);
  if(['quantity','unitPrice'].includes(key)&&!/INT|DOUBLE|FLOAT|DECIMAL/.test(column.type))throw Error(key+' must be numeric');
 }
 return Object.fromEntries(Object.keys(retailMapping).map(k=>[k,mapping[k]]));
}
export function validateReportingPlan(plan){
 if(!plan||Object.keys(plan).length!==3||Object.entries(reportingSchema.properties).some(([k,v])=>!v.enum.includes(plan[k])))throw Error('Adapter returned an unsupported reporting plan; no calculation was run');
 return plan;
}
export function validateConfirmedCandyPlan(plan,subset){
 // Validate the effective plan after the user's explicit filter, retaining raw output separately.
 return validateCandyPlan(subset?{...plan,subset}:plan);
}
export function reportSQL(datasetId,mapping,plan,excludedProductCodes=retailExcludedCodes){
 const exclusions=validateExclusions(excludedProductCodes);
 validateReportingPlan(plan);
 if(!/^[a-f0-9-]{36}$/.test(datasetId))throw Error('Invalid dataset');
 const quote=s=>'"'+s.replaceAll('"','""')+'"';
 const cols=Object.fromEntries(Object.entries(mapping).map(([k,v])=>[k,quote(v)]));
 const table=quote('d_'+datasetId);
 const where=[`${cols.order} IS NOT NULL`,`${cols.product} IS NOT NULL`,`${cols.quantity} IS NOT NULL`,`${cols.unitPrice} IS NOT NULL`];
 if(plan.scope==='merchandise'&&exclusions.length)where.push(`CAST(${cols.product} AS VARCHAR) NOT IN (${exclusions.map(c=>"'"+c.replaceAll("'","''")+"'").join(',')})`);
 if(plan.returns==='exclude')where.push(`${cols.quantity} >= 0`);
 const base=`FROM ${table} WHERE ${where.join(' AND ')}`;
 const value=`CAST(${cols.quantity} AS DOUBLE) * CAST(${cols.unitPrice} AS DOUBLE)`;
 return {
  summary:`SELECT count(*) AS includedRows, count(DISTINCT ${cols.order}) AS orders, sum(${value}) AS revenue ${base}`,
  products:`SELECT CAST(${cols.product} AS VARCHAR) AS product, sum(${value}) AS revenue ${base} GROUP BY ${cols.product} ORDER BY revenue DESC, product ASC LIMIT 12`,
 };
}
export async function inferLiveReport(job,recipe,signal){
 if(recipe.selected!=='adapter')throw Error('No successful fine-tuned adapter selected');
 const adapter=path.resolve(recipe.adapterPath);
 if(!adapter.startsWith(path.resolve('.local-lab/finetune')+path.sep))throw Error('Adapter must be app-owned');
 const hash=createHash('sha256').update(await readFile(adapter)).digest('hex');
 if(hash!==recipe.adapterSHA256)throw Error('Adapter checksum changed');
 const run=path.resolve('.local-lab/reports',job.id);await mkdir(run,{recursive:true});
 const input={model:path.resolve(recipe.model.path),adapter:path.dirname(adapter),system:recipe.profile==='candy'?candySystem:trainingSystem,request:job.payload.request};
 await writeFile(path.join(run,'input.json'),JSON.stringify(input));
 await runLocalProcess(path.resolve('.venv/bin/python'),['scripts/live-report-worker.py',run],{signal,timeout:120000,maxBuffer:1024*1024,env:{...process.env,HF_HUB_OFFLINE:'1',TOKENIZERS_PARALLELISM:'false'}});
 const trial=JSON.parse(await readFile(path.join(run,'output.json'),'utf8'));
 if(recipe.profile==='candy')validateConfirmedCandyPlan(trial.plan,job.payload.confirmedSubset);else validateReportingPlan(trial.plan);
 return {...trial,model:recipe.model,adapterSHA256:hash,policy:recipe.profile==='candy'?candyPolicy:rules,profile:recipe.profile??'retail'};
}
