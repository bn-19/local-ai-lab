import test from 'node:test';
import assert from 'node:assert/strict';
import {candyTrainingData,candySQL,validateCandyPlan,isCandy} from '../lib/candy.mjs';
test('candy adapter uses disjoint questions and bounded percentile operations',()=>{
 const splits=candyTrainingData(),all=Object.values(splits).flat();
 assert.deepEqual(Object.values(splits).map(x=>x.length),[102,17,34]);
 assert.equal(new Set(all.map(c=>c.request)).size,all.length);
 for(const c of all)assert.doesNotThrow(()=>validateCandyPlan(c.expected));
 assert.throws(()=>validateCandyPlan({operation:'rank',measure:'dollars',subset:'all',order:'asc'}));
 const p={operation:'rank',measure:'pricepercent',subset:'fruity',order:'asc'};
 assert.match(candySQL('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',p),/WHERE "fruity" = 1 ORDER BY "pricepercent" ASC/);
 assert.equal(isCandy({columns:[{name:'InvoiceNo'}]}),false);
});
