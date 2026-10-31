import {rules, reportingSchema} from './reporting.mjs';
export const trainingSystem = 'Map a retail reporting question to a JSON plan. Follow the business policy unless the question explicitly overrides it. Return only one JSON object with exactly metric, returns, scope. Do not calculate numbers or execute code. Schema: '+JSON.stringify(reportingSchema)+' Policy: '+JSON.stringify(rules);
// Split question families before generating policy variants; no random row split.
const train = {
 revenue:['Show total sales revenue.','Calculate net revenue.','What revenue did the store earn?','Add up merchandise sales.','Give me sales income.','Report revenue for the ledger.'],
 average_order_value:['Calculate average order value.','Show mean revenue per order.','What is our average basket value?','Find the average sale per invoice.','Divide revenue by the number of orders.','Give the mean order amount.'],
 top_products:['Rank products by revenue.','List the top products by sales income.','Which products lead in revenue?','Show product revenue in descending order.','Compare net revenue by product code.','Give me a revenue leaderboard of items.'],
 orders:['Count distinct orders.','How many unique invoices are there?','Give the number of different order IDs.','Count orders, not transaction lines.','Show the unique order count.','How many orders appear in the ledger?'],
 clarify:['What is our profit?','Calculate gross margin.','Show earnings after product costs.','What is the profit margin percentage?','How much profit did each product generate?','Compute revenue less cost of goods.'],
};
const valid = {
 revenue:['Summarize the amount of net sales.'], average_order_value:['Report the typical order amount using the arithmetic mean.'], top_products:['Sort the merchandise by its revenue contribution.'], orders:['Tell me the cardinality of the order ID column.'], clarify:['What is the gross profit after buying inventory?'],
};
const final = {
 revenue:['The finance team needs turnover from this ledger.','What sales value remains once refunds are accounted for?'],
 average_order_value:['Spread our net sales evenly across invoices; what amount belongs to each?','An invoice can span several rows. What is the mean invoice total?'],
 top_products:['Put the biggest sales contributors at the head of an item list.','Which stock codes account for the most sales value?'],
 orders:['Collapse every repeated invoice identifier; how many are left?','Several lines can belong to one checkout. How many checkouts were recorded?'],
 clarify:['Can you tell whether selling these goods was profitable?','After paying suppliers, what amount did the business retain?'],
};
const variants = [
 {suffix:'',returns:'include',scope:'merchandise'},
 {suffix:' For this report exclude every row with a negative quantity.',returns:'exclude',scope:'merchandise'},
 {suffix:' For this report include shipping and adjustment codes too.',returns:'include',scope:'all'},
 {suffix:' For this report include shipping and adjustments, but omit negative quantity rows.',returns:'exclude',scope:'all'},
];
export function fineTuneData(){
 const build=(source,split)=>Object.entries(source).flatMap(([metric,questions])=>questions.flatMap((q,i)=>(metric==='clarify'?variants.slice(0,1):variants).map((v,j)=>({id:`${split}-${metric}-${i}-${j}`,request:q+v.suffix,expected:{metric,returns:v.returns,scope:v.scope}}))));
 const result={train:build(train,'train'),valid:build(valid,'valid'),final:build(final,'final')};
 const seen=new Set();for(const split of Object.values(result))for(const c of split){if(seen.has(c.request))throw Error('Split overlap');seen.add(c.request);}
 return result;
}
