import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateReport, reportingCases, reportingInput, reportingPrompts, gradeReport} from '../lib/reporting.mjs';
const plan=(metric,returns='include',scope='merchandise')=>({metric,returns,scope});
test('business arithmetic uses returns, product scope, distinct orders and missing costs',()=>{
  assert.equal(calculateReport(plan('revenue')),50);
  assert.equal(calculateReport(plan('revenue','exclude')),110);
  assert.equal(calculateReport(plan('revenue','include','all')),155);
  assert.equal(calculateReport(plan('average_order_value')),50/3);
  assert.equal(calculateReport(plan('orders')),3);
  assert.deepEqual(calculateReport(plan('top_products')),[{product:'A',revenue:50},{product:'B',revenue:0}]);
  assert.ok(calculateReport(plan('clarify')).clarification);
  assert.throws(()=>calculateReport(plan('execute_sql')),/Invalid/);
  assert.equal(calculateReport(plan('average_order_value'),[]),null);
});
test('held-out answers and questions never enter inference inputs or adaptation examples',()=>{
  for(const c of reportingCases){assert.equal('expected' in reportingInput(c),false);if(c.split==='final')assert.ok(!reportingPrompts.tuned.includes(c.request));}
  assert.equal(gradeReport(plan('revenue','exclude'),reportingCases[0]).passed,false);
});
