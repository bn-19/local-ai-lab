import csv,json,pathlib
from decimal import Decimal
root=pathlib.Path(__file__).resolve().parent.parent
with (root/'.local-lab/sources/candy/candy-data.csv').open() as f:rows=list(csv.DictReader(f))
assert len(rows)==85
out={}
for subset in ['all','chocolate','fruity']:
 selected=[r for r in rows if subset=='all' or r[subset]=='1']
 for measure in ['winpercent','sugarpercent','pricepercent']:
  out[f'mean|{measure}|{subset}|desc']=float(sum(Decimal(r[measure]) for r in selected)/len(selected))
  for order in ['asc','desc']:
   ranked=sorted(selected,key=lambda r:((1 if order=='asc' else -1)*Decimal(r[measure]),r['competitorname']))[:10]
   out[f'rank|{measure}|{subset}|{order}']=[{'label':r['competitorname'],'value':float(r[measure])} for r in ranked]
 out[f'count|winpercent|{subset}|desc']=len(selected)
out['compare|winpercent|all|desc']=[{'label':label,'value':float(sum(Decimal(r['winpercent']) for r in rows if r['chocolate']==flag)/sum(r['chocolate']==flag for r in rows))} for flag,label in [('0','Non-chocolate'),('1','Chocolate')]]
(root/'.local-lab/candy-oracle.json').write_text(json.dumps(out,indent=2))
print('Independent oracle: 85 original CSV entries; Decimal means and ordered rankings')
