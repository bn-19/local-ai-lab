import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendModels,taskRequirements} from '../lib/model-catalog.mjs';
const environment={machine:{platform:'darwin',arch:'arm64',memoryGB:32,availableMemoryGB:16,freeDiskGB:100},runtimes:{ollama:{ready:true}},models:[],
 recipes:[{id:'candy-vision',description:'Candy head',backbone:'ResNet-18 frozen',data:'529 photos',dataReady:true,source:'recipes/candy-vision/candies-small'}],recipeRuntime:{ready:true,python:'python3'}};
test('training and recognition wording routes to the tuner, analytics wording does not',()=>{
 assert.equal(taskRequirements({request:'Teach a vision model to recognize candy bars in photos'}).kind,'tune');
 assert.equal(taskRequirements({request:'Fine-tune an open model to count my candy haul'}).kind,'tune');
 assert.equal(taskRequirements({request:'Which chocolate candies are most popular?'}).kind,'text');
 assert.equal(taskRequirements({request:'Compare monthly sales by product',datasetId:'x'}).kind,'csv');
 assert.equal(taskRequirements({request:'Identify candy',inputKind:'image'}).kind,'image');
});
test('tuning candidates come from recipes and report runtime or data gaps honestly',()=>{
 const report=recommendModels({request:'Train a candy recognizer'},environment);
 assert.equal(report.selected.id,'candy-vision');
 assert.equal(report.requirements.kind,'tune');
 assert.equal(recommendModels({request:'Train a candy recognizer'},{...environment,recipeRuntime:{ready:false,error:'pip install torch'}}).selected,null);
 const noData=recommendModels({request:'Train a candy recognizer'},{...environment,recipes:[{...environment.recipes[0],dataReady:false}]});
 assert.equal(noData.selected,null);
 assert.match(noData.candidates[0].reasons[0],/not present/);
});
