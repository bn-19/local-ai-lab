import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendModels,catalog} from '../lib/model-catalog.mjs';
const environment={machine:{platform:'darwin',arch:'arm64',memoryGB:32,availableMemoryGB:16,freeDiskGB:100},runtimes:{ollama:{ready:true}},models:[]};
test('cold-start task rules choose genuinely distinct artifacts without inference',()=>{
 assert.equal(recommendModels({request:'Summarize a document',inputKind:'document'},environment).selected.id,'qwen3:4b');
 assert.equal(recommendModels({request:'Explain this Python function'},environment).selected.id,'qwen2.5-coder:1.5b');
 assert.equal(recommendModels({request:'Summarize text',preferences:{priority:'speed'}},environment).selected.id,'qwen2.5-coder:1.5b');
});
test('simulated constrained hardware and input capability failures are explicit',()=>{
 const small={...environment,machine:{...environment.machine,memoryGB:8,availableMemoryGB:4}};
 assert.equal(recommendModels({request:'Summarize text'},small).selected.id,'qwen2.5-coder:1.5b');
 for(const machine of [{...small.machine,memoryGB:4},{...small.machine,freeDiskGB:1},{...small.machine,arch:'x64'}])assert.equal(recommendModels({request:'Summarize text'},{...environment,machine}).selected,null);
 assert.equal(recommendModels({request:'Identify candy',inputKind:'image'},environment).selected,null);
 assert.equal(recommendModels({request:'Summarize text',preferences:{allowDownload:false}},environment).selected,null);
 assert.equal(recommendModels({request:'Summarize text',preferences:{maxDownloadGB:1}},environment).selected.id,'qwen2.5-coder:1.5b');
 const installed={...environment,models:[{id:catalog[0].id,digest:catalog[0].digest}]};
 assert.equal(recommendModels({request:'Summarize text',preferences:{allowDownload:false}},installed).selected.downloadRequiredGB,0);
 assert.equal(recommendModels({request:'Summarize text',preferences:{allowDownload:false}},{...installed,models:[{id:catalog[0].id,digest:'wrong'}]}).selected,null);
});
