import {element as el,number} from './dashboard.js';

const explain='First supported learning task: sales reporting. Revenue, average order value, order count and product rankings; profit requires cost data. Other learning recipes are not supported yet.';
export function toolBuilderView(api,{getDataset,onJob,onError}){
  const purpose=el('input',{required:true,maxlength:2000,'aria-label':'What should your reusable tool do?',value:'Help me answer sales reporting questions from my CSV'});
  const review=el('button',{type:'submit',class:'secondary'},'Review learning setup');
  const status=el('div',{'aria-live':'polite'});
  const mappingFields=el('div',{class:'tool-mapping'});let shownDataset=null;
  const section=el('section',{class:'tool-builder'},el('h2',{},'What should your tool help with?'),el('p',{class:'muted'},explain));
  const form=el('form',{},el('label',{},'What should the tool help with?',purpose),mappingFields,review,status);section.append(form);
  const mapLabels={order:'Order reference',product:'Product code',quantity:'Quantity',unitPrice:'Price per item'};
  const defaults={order:'InvoiceNo',product:'StockCode',quantity:'Quantity',unitPrice:'UnitPrice'};
  const refresh=()=>{
    const dataset=getDataset();if(dataset?.id===shownDataset)return;shownDataset=dataset?.id;
    mappingFields.replaceChildren();
    if(!dataset||dataset.kind==='document'){mappingFields.append(el('p',{},'Upload a sales CSV in Your data first.'));return;}
    for(const [key,label] of Object.entries(mapLabels)){
      const select=el('select',{'data-tool-column':key,'aria-label':label},el('option',{value:''},'Choose a column'),dataset.columns.map(c=>el('option',{value:c.name},c.name)));
      if(dataset.columns.some(c=>c.name===defaults[key]))[...select.options].find(option=>option.value===defaults[key]).setAttribute('selected','');
      mappingFields.append(el('label',{},label,select));
    }
  };
  section.addEventListener('pointerdown',refresh);section.addEventListener('focusin',refresh);
  const input=()=>({request:purpose.value.trim(),datasetId:getDataset()?.id,mapping:Object.fromEntries([...mappingFields.querySelectorAll('select')].map(s=>[s.dataset.toolColumn,s.value]))});
  form.addEventListener('submit',async event=>{event.preventDefault();refresh();review.disabled=true;status.replaceChildren(el('p',{},'Checking this Mac and the learning recipe…'));
    try{
      const body=input(),key=JSON.stringify(body),plan=await api.post('/api/tools/recommend',body);
      const start=el('button',{type:'button',class:'primary',disabled:!plan.compatible},plan.action);
      start.addEventListener('click',async()=>{if(key!==JSON.stringify(input())){status.replaceChildren(el('p',{},'Your choices changed. Review setup again.'));return;}start.disabled=true;
        try{const created=await api.post('/api/tools',body);await onJob(created);}
        catch(error){start.disabled=false;onError(error.message);}
      });
      status.replaceChildren(el('p',{},plan.compatible?'This Mac can run the reviewed learning recipe.':plan.reasons.join('. ')),el('p',{},`${plan.model.repository} · ${plan.setup.modelCached?'Verify local model cache':`About ${plan.model.downloadGB} GB model download`} · ${plan.setup.runtimeReady?'Learning setup installed':`About ${Math.ceil((plan.setup.downloadBytes||0)/1e6)} MB learning setup download`}`),el('p',{},'Local Lab installs its own verified Python and learning components. No manual Python installation, account or administrator access is needed.'),el('p',{},plan.scope),el('p',{},plan.dataUse),el('p',{},'We compare the unchanged model with real adapted weights. A candidate is kept only if held-out checks improve and critical checks pass. Otherwise the base model is retained.'),start,el('details',{},el('summary',{},'Selection evidence'),el('pre',{},JSON.stringify(plan,null,2))));
    }catch(error){status.replaceChildren(el('p',{role:'alert'},error.message));}finally{review.disabled=false;}
  });
  return section;
}
export function savedToolView(tool,result,api,{onJob,onError,preview=null}){
  const evaluation=tool.evaluation;
  const panel=el('section',{class:'saved-tool','aria-labelledby':'dashboard-title'},
    el('header',{class:'tool-heading'},el('p',{class:'eyebrow'},'YOUR SAVED TOOL'),el('h1',{id:'dashboard-title'},'Sales reporting'),el('p',{class:'tool-description'},tool.request)),
    el('p',{class:'tool-local-status'},'On-device · Saved setup · No cloud account needed'));
  if(preview){
    const choices={metric:{revenue:'Total sales revenue',average_order_value:'Average revenue per distinct invoice',orders:'Distinct invoice count',top_products:'Products ranked by revenue',clarify:'Request missing cost data'},returns:{include:'Include recorded refunds',exclude:'Exclude negative-quantity rows'},scope:{merchandise:'Product rows, excluding POST and ADJUST',all:'All codes, including postage and adjustments'}};
    const fields={};const confirm=el('button',{type:'submit',class:'primary'},'Calculate this whole-file report');
    const review=el('form',{class:'tool-review'},el('h2',{},'Review before calculating'),el('p',{},preview.request),el('p',{},'This tool cannot apply dates, countries or custom filters. Review these choices before it calculates anything.'));
    for(const [key,values] of Object.entries(choices)){
      const select=el('select',{'aria-label':key==='metric'?'Report':key==='returns'?'Refunds':'Included rows'},Object.entries(values).map(([value,label])=>el('option',{value,selected:value===preview.plan[key]},label)));fields[key]=select;review.append(el('label',{},key==='metric'?'Report':key==='returns'?'Refunds':'Included rows',select));
    }
    const acknowledge=el('input',{type:'checkbox',required:true});review.append(el('label',{},acknowledge,'I understand this uses the whole CSV, without date or country filters.'),confirm);
    review.addEventListener('submit',async event=>{event.preventDefault();if(!acknowledge.checked){onError('Confirm that this is a whole-file report first.');return;}confirm.disabled=true;
      try{await onJob(await api.post(`/api/tools/${tool.id}/calculate`,{reviewJobId:preview.jobId,plan:Object.fromEntries(Object.entries(fields).map(([k,select])=>[k,select.value])),confirmWholeFile:true}));}catch(error){confirm.disabled=false;onError(error.message);}
    });panel.append(review);
  }
  const question=el('input',{required:true,maxlength:2000,'aria-label':'Ask your saved tool',placeholder:'What is our revenue, including refunds?'});
  const file=el('input',{type:'file',accept:'.csv,text/csv','aria-label':'Use a new sales CSV (optional)'});
  const submit=el('button',{type:'submit',class:'primary'},'Review answer →');
  const form=el('form',{class:'tool-run-form'},el('label',{class:'question-label'},'Ask your saved tool',question),el('div',{class:'tool-question-actions'},el('details',{class:'tool-file-choice'},el('summary',{},'Use another CSV'),el('label',{},'Same mapped columns as your saved file',file)),submit),el('p',{class:'tool-scope-note'},'Whole-file revenue, order counts, average order value and product rankings. No date or country filters.'));
  form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;
    try{let datasetId=tool.datasetId;if(file.files?.length)datasetId=(await api.upload(file.files[0])).id;
      const job=await api.post(`/api/tools/${tool.id}/run`,{request:question.value.trim(),datasetId});await onJob(job);
    }catch(error){submit.disabled=false;onError(error.message);}
  });panel.insertBefore(form,panel.children[2]||null);
  if(result){
    const labels={revenue:'Sales revenue',average_order_value:'Average order value',orders:'Order count',top_products:'Top products'};
    const answer=el('section',{class:'tool-answer'},el('p',{class:'eyebrow'},'LATEST ANSWER'),el('h2',{},result.request),el('p',{class:result.clarification?'answer-clarification':'answer-value'},result.clarification||`${labels[result.plan.metric]||result.plan.metric}: ${typeof result.answer==='number'?number(result.answer):result.answer===null?'No matching data':'Product ranking below'}`));
    if(Array.isArray(result.answer))answer.append(el('ol',{},result.answer.map(row=>el('li',{},`${row.product}: ${number(row.revenue)}`))));
    answer.append(el('p',{class:'answer-caption'},`${result.selection==='adapter'?'Your saved tuned model':'Retained base model'} · ${number(result.elapsedMs/1000)}s model runtime · ${result.clarification?'No calculation performed':'Calculated from your CSV'}`),el('details',{},el('summary',{},'Answer details'),el('pre',{},JSON.stringify(result,null,2))));panel.append(answer);
  }
  panel.append(el('details',{class:'tool-setup-details'},el('summary',{},'About this tool and its saved setup'),el('p',{},tool.scope),el('p',{},tool.selected==='adapter'?'Tuned weights saved for this tool.':'The base model was retained because the candidate did not pass promotion checks.'),el('p',{},`Held-out checks: unchanged model ${evaluation.baseline.score}/${evaluation.total}; candidate ${evaluation.adapted.score}/${evaluation.total}.`),el('details',{},el('summary',{},'Model, weight fingerprints and evaluation'),el('pre',{},JSON.stringify({binding:tool.binding,evaluation},null,2)))));
  return panel;
}
