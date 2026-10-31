"""Fetch the original public CSV, verify its reviewed content hash, record attribution."""
import truststore;truststore.inject_into_ssl()
import urllib.request,pathlib,hashlib,json
root=pathlib.Path(__file__).resolve().parent.parent/'.local-lab/sources/candy'
url='https://raw.githubusercontent.com/fivethirtyeight/data/master/candy-power-ranking/candy-data.csv'
expected='46c17cdb8c0212bc3e0cee2a9617a75d1ce642cd1559c332b1d9a2c4ed19b8cb'
data=urllib.request.urlopen(url,timeout=30).read()
if hashlib.sha256(data).hexdigest()!=expected:raise ValueError('Upstream data changed; review before using this demo')
root.mkdir(parents=True,exist_ok=True);(root/'candy-data.csv').write_bytes(data)
(root/'provenance.json').write_text(json.dumps({'source':url,'sha256':expected,'license':'CC BY 4.0','attribution':'FiveThirtyEight — The Ultimate Halloween Candy Power Ranking','transformations':'None; original CSV'},indent=2))
print('Verified original candy CSV and saved attribution')
