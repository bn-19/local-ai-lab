import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const fixture = Object.freeze({
  url: 'https://raw.githubusercontent.com/fivethirtyeight/data/4b9d687691091f8e44addfb051a651aebc1a4862/candy-power-ranking/candy-data.csv',
  sha256: '46c17cdb8c0212bc3e0cee2a9617a75d1ce642cd1559c332b1d9a2c4ed19b8cb',
  license: 'CC BY 4.0', attribution: 'FiveThirtyEight candy-power-ranking',
  interpretation: 'Historical matchup preference scores, not sales.',
});
export const definition = Object.freeze({measure:{operation:'mean',column:'winpercent'},groupColumn:'competitorname',filterColumn:'chocolate',dateColumn:null,negativePolicy:'include'});
export const request = 'Compare candy popularity using matchup win rates. Rank the candies and let me filter chocolate versus non-chocolate entries. These are historical preference scores, not sales.';
export function verifyBytes(bytes, expected) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, 'CSV SHA256 mismatch');
}
// Independent RFC4180-style parser: quoted commas, escaped quotes, CRLF and embedded newlines.
export function parseCSV(text) {
  const rows=[]; let row=[], field='', quoted=false, closed=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) { if(c==='"') { if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;} }else field+=c; }
    else if(c==='"') {assert.ok(!field&&!closed,'Invalid CSV quote');quoted=true;}
    else if(c===','||c==='\n'||c==='\r') {
      row.push(field);field='';closed=false;
      if(c!==','){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
    } else {assert.ok(!closed,'Invalid characters after CSV quote');field+=c;}
  }
  assert.ok(!quoted,'Unterminated CSV quote');
  if(field||row.length||closed){row.push(field);rows.push(row);}
  const headers=rows.shift();assert.ok(headers?.length&&new Set(headers).size===headers.length,'Invalid CSV header');
  return rows.map(r=>{assert.equal(r.length,headers.length,'CSV row width');return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
export function calculate(rows, d=definition, filter=null) {
  const selected=rows.filter(r=>!filter||r[filter.column]===filter.value).filter(r=>d.negativePolicy!=='exclude'||[d.measure.column,d.measure.column2].filter(Boolean).every(c=>r[c]===''||Number(r[c])>=0));
  const aggregate=rs=>{
    if(d.measure.operation==='count')return rs.length;
    const values=rs.filter(r=>[d.measure.column,d.measure.column2].filter(Boolean).every(c=>r[c]!==''))
      .map(r=>Number(r[d.measure.column])*(d.measure.operation==='product_sum'?Number(r[d.measure.column2]):1));
    assert.ok(values.every(Number.isFinite),'Non-finite CSV measure');
    const sum=values.reduce((a,b)=>a+b,0);return d.measure.operation==='mean'?sum/values.length:sum;
  };
  const groups=column=>[...new Set(selected.map(r=>r[column]))].map(label=>({label,value:aggregate(selected.filter(r=>r[column]===label))}));
  return {count:selected.length,value:aggregate(selected),groups:groups(d.groupColumn),categories:d.filterColumn?groups(d.filterColumn):[]};
}
export function close(actual,expected,tolerance=1e-6) {
  assert.ok(typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`Numeric mismatch: ${actual} versus ${expected}`);
}
export function verifyDashboard(dashboard, rows, d=definition, filter=null) {
  const expected=calculate(rows,d,filter);
  assert.deepEqual(dashboard.source.measure,d.measure);assert.equal(dashboard.source.groupColumn,d.groupColumn);
  assert.equal(dashboard.source.dateColumn,d.dateColumn);assert.equal(dashboard.source.negativePolicy,d.negativePolicy);
  assert.equal(dashboard.source.rows,rows.length);assert.equal(dashboard.source.filteredRows,expected.count);
  close(dashboard.kpis[0].value,expected.value);assert.equal(dashboard.kpis[1].value,expected.count);
  const verifyPoints=(points,all,count)=>{
    assert.equal(points.length,count);assert.equal(new Set(points.map(p=>p.label)).size,count);
    for(const p of points){const e=all.find(e=>e.label===p.label);assert.ok(e,'Unexpected chart label');close(p.value,e.value);}
  };
  const ranked=[...expected.groups].sort((a,b)=>b.value-a.value);
  const bar=dashboard.charts.find(c=>c.title===`${d.measure.operation} by ${d.groupColumn}`);
  assert.ok(bar);verifyPoints(bar.points,expected.groups,Math.min(12,ranked.length));
  bar.points.forEach((p,i)=>close(p.value,ranked[i].value)); // ties may use any valid group
  if(d.filterColumn){
    const categories=dashboard.charts.find(c=>c.title===`${d.measure.operation} by ${d.filterColumn}`);
    assert.ok(categories);verifyPoints(categories.points,expected.categories,expected.categories.length);
    assert.deepEqual([...dashboard.filters.find(f=>f.column===d.filterColumn).values].sort(),[...new Set(rows.map(r=>r[d.filterColumn]))].sort());
  }
  return expected;
}
export function localBase(value) {
  const url=new URL(value);
  assert.ok(url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/', 'Base must be an explicit HTTP loopback origin without credentials, path or query');
  return url.origin;
}
export function client(base,token,fetcher=fetch) {
  base=localBase(base);
  return async(route,body,headers={})=>{
    assert.match(route,/^\/api\/[a-zA-Z0-9/-]+$/);
    const response=await fetcher(base+route,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
    // Do not echo server errors: they can contain credentials or unrelated user data.
    assert.ok(response.ok,`Local API request failed (${response.status}) at ${route}`);
    return response.json();
  };
}
export const digest=s=>s?.replace(/^sha256:/,'');
export async function waitJob(api,owned,{timeoutMs=600000,pollMs=1000,signal}={}) {
  const start=Date.now();
  while(Date.now()-start<timeoutMs){
    signal?.throwIfAborted();const j=await api(`/api/jobs/${owned.jobId}`);
    assert.equal(j.id,owned.jobId);assert.equal(j.taskId,owned.taskId);
    if(['ready','failed','cancelled','interrupted'].includes(j.status))return j;
    assert.ok(['queued','running'].includes(j.status),'Unknown job status');
    await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
  throw Error('Acceptance job timeout');
}
export async function cancelOwned(api,owned) {
  if(!owned)return;
  const j=await api(`/api/jobs/${owned.jobId}`);
  assert.equal(j.id,owned.jobId);assert.equal(j.taskId,owned.taskId);
  if(['queued','running'].includes(j.status))await api(`/api/jobs/${owned.jobId}/cancel`,{});
}
