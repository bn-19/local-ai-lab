import {candyTrainingData} from './candy.mjs';
const p=(operation='rank',measure='winpercent',subset='all',order='desc')=>({operation,measure,subset,order});
export const loopDevelopment=[
 {id:'dev-chocolate-popular',request:'Which chocolate candies are most popular?',expected:p('rank','winpercent','chocolate')},
 {id:'dev-fruity-cheap',request:'Rank the cheapest fruity candies.',expected:p('rank','pricepercent','fruity','asc')},
 {id:'dev-chocolate-mean',request:'What is the average win percentage for chocolate candies?',expected:p('mean','winpercent','chocolate')},
 {id:'dev-fruity-count',request:'How many fruity entries are there?',expected:p('count','winpercent','fruity')},
 {id:'dev-chocolate-sugar',request:'Which chocolate candies have the lowest sugar percentile?',expected:p('rank','sugarpercent','chocolate','asc')},
 {id:'dev-compare',request:'Compare chocolate and non-chocolate average popularity.',expected:p('compare')},
 {id:'dev-grams',request:'How many grams of sugar are in each candy?',expected:p('clarify')},
 {id:'dev-dollars',request:'What is the exact dollar price of these candies?',expected:p('clarify')},
];
const intents=[
 {plan:p(),train:['Which {s} candies are most popular?','List the best {s} treats by win rate.','Give the top ranked {s} candies.','Find the most liked {s} sweets.','Rank {s} entries by matchup victories.','Show the strongest {s} competitors.'],valid:['Display highly popular {s} options.'],final:['What tops the {s} popularity table?','Pick the crowd-favourite {s} sweets by their contest score.']},
 {plan:p('rank','pricepercent','all','asc'),train:['Rank the cheapest {s} candies.','Show inexpensive {s} sweets by percentile.','Find {s} options at the lowest price ranks.','List the lowest pricepercent {s} entries.','Sort {s} treats by increasing relative price.','Which {s} sweets are cheapest in relative terms?'],valid:['Order {s} sweets from low to high price rank.'],final:['Put the most affordable-ranked {s} options first.','Which {s} treats sit lowest on the relative price scale?']},
 {plan:p('rank','sugarpercent','all','asc'),train:['Which {s} candies have the lowest sugar percentile?','Rank low sugarpercent {s} candies first.','Show the least sugary {s} treats by percentile.','Sort {s} sweets by rising sugar rank.','Give the lowest relative sugar {s} entries.','Which {s} candies occupy the bottom sugar ranks?'],valid:['Sort {s} entries from low to high sugar percentile.'],final:['Pick {s} treats from the bottom of the sugar ranking.','What {s} entries have the smallest relative sugar positions?']},
 {plan:p('mean'),train:['What is the average win percentage for {s} candies?','Find mean popularity of {s} sweets.','Average the matchup scores of {s} entries.','Give {s} candies mean winpercent.','Calculate the average winning rate for {s} treats.','How popular are {s} candies on average?'],valid:['Report average win rate for {s} entries.'],final:['Across {s} treats, what is the arithmetic average of contest success?','Summarize the mean winning score among {s} options.']},
 {plan:p('count'),train:['How many {s} entries are there?','Count {s} candies in this list.','Give the number of {s} records.','Count rows for {s} sweets.','How many {s} competitors are included?','What is the size of the {s} selection?'],valid:['Tell me the count of {s} entries.'],final:['What is the total number of {s} competitors listed here?','How large is the collection of {s} entries?']},
];
export function loopTrainingData(recipe='inline_filters'){
 const out={train:[],valid:[],final:[]};
 for(const split of Object.keys(out))for(const [i,intent] of intents.entries())for(const subset of ['all','chocolate','fruity'])for(const [j,question] of intent[split].entries())out[split].push({id:`v2-${split}-${i}-${subset}-${j}`,request:question.replaceAll('{s}',subset==='all'?'all':subset),expected:{...intent.plan,subset}});
 // Rehearse existing task operations without reusing old held-out questions.
 const old=candyTrainingData();out.train.push(...old.train);
 out.valid.push(...old.valid.filter(c=>['compare','clarify'].includes(c.expected.operation)));
 out.final.push(
  {id:'v2-final-compare',request:'For the chocolate and non-chocolate groups, calculate their respective mean matchup win percentages.',expected:p('compare')},
  {id:'v2-final-grams',request:'Can you provide sugar mass in grams for these sweets?',expected:p('clarify')},
  {id:'v2-final-money',request:'Tell me the exact amount of dollars I would pay per candy.',expected:p('clarify')},
 );
 if(recipe==='inline_filters')out.train.push(...loopDevelopment.filter(c=>!['clarify','compare'].includes(c.expected.operation)).map(c=>({...c,id:'reviewed-'+c.id})));
 // Duplicate reviewed development examples in training are deliberate; no final/validation overlap.
 const train=new Set(out.train.map(c=>c.request));for(const c of [...out.valid,...out.final])if(train.has(c.request))throw Error('Training leakage');
 return out;
}
