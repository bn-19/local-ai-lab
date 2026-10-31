import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMapping,validateReportingPlan,reportSQL,retailMapping,validateConfirmedCandyPlan} from '../lib/live-reporting.mjs';
test('confirmed filter is validated before calculation without changing raw model evidence',()=>{
 const raw={operation:'compare',measure:'winpercent',subset:'chocolate',order:'desc'};
 assert.throws(()=>validateConfirmedCandyPlan(raw),/Comparison requires/);
 assert.equal(validateConfirmedCandyPlan(raw,'all').subset,'all');
 assert.equal(raw.subset,'chocolate');
 assert.throws(()=>validateConfirmedCandyPlan({...raw,operation:'execute'},'all'),/Unsupported/);
 assert.throws(()=>validateConfirmedCandyPlan(raw,'fruity'),/Comparison requires/);
});
test('live report rejects invented operations and columns; identifiers are quoted',()=>{
 const d={columns:Object.values(retailMapping).map(name=>({name,type:['Quantity','UnitPrice'].includes(name)?'DOUBLE':'VARCHAR'}))};
 assert.deepEqual(validateMapping(d,retailMapping),retailMapping);
 assert.throws(()=>validateMapping(d,{...retailMapping,quantity:'DROP TABLE'}),/Missing/);
 assert.throws(()=>validateReportingPlan({metric:'revenue',returns:'include',scope:'all',sql:'DELETE'}),/unsupported/);
 assert.throws(()=>validateReportingPlan({metric:'sql',returns:'include',scope:'all'}),/unsupported/);
 const sql=reportSQL('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',{...retailMapping,product:'a"b'},{metric:'average_order_value',returns:'exclude',scope:'merchandise'});
 assert.ok(sql.summary.includes('count(DISTINCT "InvoiceNo")'));
 assert.ok(sql.summary.includes('"a""b"'));
 assert.ok(sql.summary.includes('"Quantity" >= 0'));
});
