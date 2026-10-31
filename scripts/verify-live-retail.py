"""Independent streaming Decimal oracle; no model or DuckDB imports."""
import csv,json,pathlib
from decimal import Decimal
root=pathlib.Path(__file__).resolve().parent.parent
stats={}
for scope in ['merchandise','all']:
 for returns in ['include','exclude']:stats[scope+'-'+returns]={'revenue':Decimal(0),'orders':set(),'rows':0,'products':{}}
with (root/'.local-lab/sources/retail/Online Retail.csv').open(newline='') as f:
 for row in csv.DictReader(f):
  if any(row[k]=='' for k in ['InvoiceNo','StockCode','Quantity','UnitPrice']):continue
  q,p=Decimal(row['Quantity']),Decimal(row['UnitPrice'])
  for key,s in stats.items():
   if key.startswith('merchandise') and row['StockCode'] in ['POST','ADJUST','DOT','D','M','C2','BANK CHARGES','AMAZONFEE','B','CRUK']:continue
   if key.endswith('exclude') and q<0:continue
   s['revenue']+=q*p;s['orders'].add(row['InvoiceNo']);s['rows']+=1
   s['products'][row['StockCode']]=s['products'].get(row['StockCode'],Decimal(0))+q*p
out={}
for k,s in stats.items():
 out[k]={'revenue':float(s['revenue']),'orders':len(s['orders']),'average_order_value':float(s['revenue']/len(s['orders'])),'includedRows':s['rows'],'top_products':[{'product':k,'revenue':float(v)} for k,v in sorted(s['products'].items(),key=lambda x:(-x[1],x[0]))[:12]]}
(root/'.local-lab/live-retail-oracle.json').write_text(json.dumps(out,indent=2))
print('Computed independent Decimal oracle for four policy combinations')
