// Deliberately fictional, bundled sample. Never presented as a model result.
const sampleRows = [
  ['Jan','Home',4200],['Feb','Home',4600],['Mar','Home',5100],['Apr','Home',4800],['May','Home',5900],['Jun','Home',6400],
  ['Jan','Garden',1800],['Feb','Garden',2100],['Mar','Garden',3200],['Apr','Garden',3900],['May','Garden',4200],['Jun','Garden',4600],
  ['Jan','Kitchen',3100],['Feb','Kitchen',2900],['Mar','Kitchen',3400],['Apr','Kitchen',3800],['May','Kitchen',4100],['Jun','Kitchen',4300]
];
export function sampleDashboard(group = '') {
  const rows = sampleRows.filter(row => !group || row[1] === group);
  const sum = rows.reduce((total, row) => total + row[2], 0);
  const aggregate = index => [...new Set(rows.map(row => row[index]))].map(label => ({ label, value: rows.filter(row => row[index] === label).reduce((n, row) => n + row[2], 0) }));
  return { kpis: [{ label: 'Sales (sample units)', value: sum }, { label: 'Monthly records', value: rows.length }, { label: 'Average per record', value: sum / rows.length }], charts: [{ title: 'Sales over time', kind: 'line', points: aggregate(0) }, { title: 'Sales by product group', kind: 'bar', points: aggregate(1) }], filters: [{ column: 'Product group', values: ['Home','Garden','Kitchen'] }], source: { name: 'Fictional shop · Jan–Jun', rows:18, filteredRows:rows.length, measure:'Sum of sample sales units', negativePolicy:'include', dateColumn:'Month', groupColumn:'Product group' }, model:null, configuration:'Illustration only' };
}
export const number = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits:2 }).format(value) : String(value ?? '—');
export function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
function svgNode(tag, attrs = {}, text = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}
export function chartView(chart) {
  const points = (chart.points || []).filter(p => Number.isFinite(Number(p.value))).map(p => ({ label:String(p.label), value:Number(p.value) }));
  const box = element('section', {class:'chart'}, element('h3',{},chart.title));
  if (!points.length) return box.appendChild(element('p',{},'No values for this filter.')), box;
  const shown = points.slice(0,40);
  const width=500, height=245, left=62, right=18, top=15, bottom=40;
  let max=Math.max(0,...shown.map(p=>p.value)); const min=Math.min(0,...shown.map(p=>p.value));
  if(max===min)max=min+1;
  const range=max-min || 1, plotH=height-top-bottom, plotW=width-left-right;
  const y=v=>top+(max-v)/range*plotH;
  const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${chart.title}. Exact values are in the data table below.`});
  for(let i=0;i<4;i++) {
    const value=min+range*i/3, yy=y(value);
    svg.append(svgNode('line',{x1:left,y1:yy,x2:width-right,y2:yy,class:'chart-grid'}));
    svg.append(svgNode('text',{x:left-10,y:yy+4,'text-anchor':'end'},new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(value)));
  }
  const x=i=>left+(chart.kind==='bar' ? (i+.5)*plotW/shown.length : (shown.length===1 ? plotW/2 : i*plotW/(shown.length-1)));
  if(chart.kind==='line') {
    const path=shown.map((p,i)=>`${i?'L':'M'}${x(i)},${y(p.value)}`).join(' ');
    svg.append(svgNode('path',{d:`${path} L${x(shown.length-1)},${y(0)} L${x(0)},${y(0)} Z`,class:'chart-area'}));
    svg.append(svgNode('path',{d:path,class:'chart-line'}));
    for(let i=0;i<shown.length;i++) svg.append(svgNode('circle',{cx:x(i),cy:y(shown[i].value),r:3,class:'chart-dot'}));
  } else {
    const barW=Math.min(68,plotW/shown.length*.6);
    shown.forEach((p,i)=>svg.append(svgNode('rect',{x:x(i)-barW/2,y:Math.min(y(0),y(p.value)),width:barW,height:Math.max(1,Math.abs(y(p.value)-y(0))),rx:3,class:'chart-bar'})));
  }
  const stride=Math.max(1,Math.ceil(shown.length/6));
  shown.forEach((p,i)=>{if(i%stride===0)svg.append(svgNode('text',{x:x(i),y:height-14,'text-anchor':'middle'},p.label.length>13?p.label.slice(0,12)+'…':p.label));});
  box.append(svg);
  const table=element('table',{},element('thead',{},element('tr',{},element('th',{},'Group / period'),element('th',{},'Value'))),element('tbody',{},points.map(p=>element('tr',{},element('td',{},p.label),element('td',{},number(p.value))))));
  box.append(element('details',{},element('summary',{},`View ${points.length} calculated values${points.length>40?' (chart shows first 40)':''}`),table));
  return box;
}
