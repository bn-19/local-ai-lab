import {fineTuneData,trainingSystem} from './finetune-data.mjs';
import {reportingSchema,rules} from './reporting.mjs';

export const toolTrainingSystem = trainingSystem;
export const toolTrainingProvenance = Object.freeze({
  kind:'authored-synthetic',
  purpose:'Bounded sales-reporting plan selection; no customer rows or private CSV values are included.',
  limits:'Held-out exact-plan checks are small synthetic evidence, not a production accuracy estimate.',
  schema:reportingSchema,
  rules,
});

const final = [
  {id:'tool-final-net-product-sales',request:'For the monthly sales review, total product sales and keep recorded refund lines in the calculation.',expected:{metric:'revenue',returns:'include',scope:'merchandise'},critical:true},
  {id:'tool-final-positive-product-sales',request:'Report product sales from positive-quantity lines only; refunded quantities should not reduce this view.',expected:{metric:'revenue',returns:'exclude',scope:'merchandise'}},
  {id:'tool-final-ledger-sales',request:'Total the entire sales ledger, including delivery and adjustment codes as well as returns.',expected:{metric:'revenue',returns:'include',scope:'all'}},
  {id:'tool-final-positive-ledger-sales',request:'For this gross activity view, use every code but leave out all negative-quantity entries.',expected:{metric:'revenue',returns:'exclude',scope:'all'}},
  {id:'tool-final-order-average',request:'Each invoice may occupy many rows. What is net product sales divided by unique invoices?',expected:{metric:'average_order_value',returns:'include',scope:'merchandise'},critical:true},
  {id:'tool-final-product-ranking',request:'Create an item-code leaderboard using net product sales after refunds.',expected:{metric:'top_products',returns:'include',scope:'merchandise'}},
  {id:'tool-final-positive-product-ranking',request:'Rank item codes by sales while ignoring negative quantities for this one report.',expected:{metric:'top_products',returns:'exclude',scope:'merchandise'}},
  {id:'tool-final-invoice-count',request:'Count unique merchandise invoices, not the number of transaction rows.',expected:{metric:'orders',returns:'include',scope:'merchandise'}},
  {id:'tool-final-profit-needs-cost',request:'Using these sales columns, tell me gross profit after the purchase cost of the goods.',expected:{metric:'clarify',returns:'include',scope:'merchandise'},critical:true},
  {id:'tool-final-margin-needs-cost',request:'What margin percentage did we earn once inventory cost is deducted?',expected:{metric:'clarify',returns:'include',scope:'merchandise'},critical:true},
];

// Independently authored after v1 was measured. V1 finals are now development
// examples, never reported as held-out evidence again. Freeze v2 before training.
const independentFinal = [
  ['What is our net sales after refunds?','revenue','include','merchandise',true],
  ['What is the average invoice value when each invoice may contain several line items?','average_order_value','include','merchandise',true],
  ['Can this ledger tell us the profit after supplier costs?','clarify','include','merchandise',true],
  ['What margin did we earn after accounting for the cost of goods?','clarify','include','merchandise',true],
  ['Show merchandise revenue while excluding refund and return rows.','revenue','exclude','merchandise',false],
  ['Include postage and adjustment codes when calculating total revenue.','revenue','include','all',false],
  ['What was the mean order amount if negative-quantity return rows are omitted?','average_order_value','exclude','merchandise',false],
  ['How many distinct invoices are represented in the merchandise records?','orders','include','merchandise',false],
  ['Count unique orders across merchandise, postage, and adjustment entries.','orders','include','all',false],
  ['Which product codes generated the most net sales?','top_products','include','merchandise',false],
  ['Rank merchandise items by revenue after excluding negative-quantity rows.','top_products','exclude','merchandise',false],
  ['Rank every code by revenue, including postage and adjustment codes.','top_products','include','all',false],
].map(([request,metric,returns,scope,critical],i)=>({id:'independent-v2-'+String(i+1).padStart(2,'0'),request,expected:{metric,returns,scope},...(critical?{critical:true}:{})}));

function validatePlan(plan){
  return plan&&Object.keys(reportingSchema.properties).every(key=>reportingSchema.properties[key].enum.includes(plan[key]));
}

export function toolTrainingData(){
  // Reuse only the reviewed synthetic train/validation recipe. Final stems are
  // newly authored here and are never copied into either training split.
  const source=fineTuneData();
  const result={
    train:[...source.train,...source.final,...final].map(c=>({...c,id:'tool-v2-development-'+c.id,critical:undefined})),
    valid:source.valid.map(c=>({...c,id:'tool-'+c.id})),
    final:independentFinal.map(c=>({...c})),
  };
  const cases=Object.values(result).flat();
  if(new Set(cases.map(c=>c.id)).size!==cases.length)throw Error('Tool-training case IDs must be unique');
  if(new Set(cases.map(c=>c.request)).size!==cases.length)throw Error('Tool-training requests must not overlap across splits');
  if(cases.some(c=>!validatePlan(c.expected)))throw Error('Tool-training data contains an unsupported reporting plan');
  if(!result.final.some(c=>c.critical&&c.expected.metric==='clarify'))throw Error('Missing-cost clarification must be a critical final check');
  return result;
}
