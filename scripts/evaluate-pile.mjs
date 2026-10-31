// Offline reference comparison only. Never imported by the inference worker.
import {readFile,writeFile} from 'node:fs/promises';
const [referencePath,predictionPath,outputPath]=process.argv.slice(2);
if(!outputPath)throw Error('Usage: node scripts/evaluate-pile.mjs reference.json prediction.json output.json');
const reference=JSON.parse(await readFile(referencePath)),prediction=JSON.parse(await readFile(predictionPath));
if(reference.width!==prediction.width||reference.height!==prediction.height)throw Error('Image dimensions differ');
function iou(a,b){const intersection=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));return intersection/Math.max(1,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection);}
const pairs=[];
for(const g of reference.instances)for(const p of prediction.instances){const overlap=iou(g.box,p.box);if(overlap>=.5)pairs.push({referenceId:g.id,predictionId:p.id,iou:overlap,expectedLabel:g.label,predictedLabel:p.label,accepted:p.status==='accepted'});}
pairs.sort((a,b)=>b.iou-a.iou);const usedReference=new Set(),usedPrediction=new Set(),matches=[];
for(const p of pairs){if(usedReference.has(p.referenceId)||usedPrediction.has(p.predictionId))continue;matches.push(p);usedReference.add(p.referenceId);usedPrediction.add(p.predictionId);}
const report={createdAt:new Date().toISOString(),referencePath,predictionPath,referenceScope:reference.scope,referenceSHA256:reference.sha256,policy:prediction.policy,referenceInstances:reference.instances.length,predictedInstances:prediction.instances.length,matchedAtIoU50:matches.length,knownBrandCorrectMatches:matches.filter(p=>p.accepted&&p.expectedLabel===p.predictedLabel).length,wrongAcceptedMatchedLabels:matches.filter(p=>p.accepted&&p.expectedLabel!==p.predictedLabel),matches,counts:prediction.counts,uncertainCount:prediction.uncertainCount,elapsedMs:prediction.elapsedMs,note:'Partial references cannot establish exhaustive recall or precision; these counts are diagnostic only. Matching is greedy by descending IoU.'};
await writeFile(outputPath,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({referenceInstances:report.referenceInstances,predictedInstances:report.predictedInstances,matchedAtIoU50:report.matchedAtIoU50,knownBrandCorrectMatches:report.knownBrandCorrectMatches,wrongAcceptedMatchedLabels:report.wrongAcceptedMatchedLabels,counts:report.counts,elapsedMs:report.elapsedMs}));
