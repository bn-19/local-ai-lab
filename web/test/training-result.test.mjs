import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {tuningResultView,statisticalInsightsView} from '../src/dashboard.js';
test('saved training comparison shows measured values and retains baseline without invented improvement',()=>{
 const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;globalThis.Node=window.Node;
 try {
  const panel=tuningResultView({baseline:{score:26},adapted:{score:29},total:33,selected:'adapter',elapsedSeconds:43.2,model:'local-model'});
  assert.match(panel.textContent,/26 \/ 33/);assert.match(panel.textContent,/29 \/ 33/);assert.match(panel.textContent,/Tuned adapter selected/);assert.match(panel.textContent,/Synthetic benchmark/);assert.match(panel.textContent,/separate local planner/);assert.equal(panel.querySelectorAll('meter').length,2);
  const retained=tuningResultView({baseline:{score:8},adapted:{score:7},total:10,selected:'baseline'});
  assert.match(retained.textContent,/Baseline retained/);assert.doesNotMatch(retained.textContent,/Tuned adapter selected/);
  const missing=tuningResultView({selected:'baseline'});assert.equal(missing.querySelectorAll('meter').length,0);assert.match(missing.textContent,/Not measured/);
 } finally {delete globalThis.document;delete globalThis.Node;}
});

test('statistical takeaways derive from the selected values, not training scores',()=>{
 const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;globalThis.Node=window.Node;
 try {const view=statisticalInsightsView({source:{measure:{operation:'mean',column:'winpercent'}},charts:[{kind:'bar',points:[{label:'A',value:31},{label:'B',value:45}]}]});assert.match(view.textContent,/B has the highest shown average matchup win rate: 45%/);assert.match(view.textContent,/14 percentage points/);assert.doesNotMatch(view.textContent,/26 \/ 33/);assert.match(statisticalInsightsView({charts:[]}).textContent,/No comparable values/);}finally{delete globalThis.document;delete globalThis.Node;}
});
