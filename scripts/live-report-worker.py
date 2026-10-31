"""One inference process, launched by the reserved Device worker. No model-written code."""
import json, pathlib, sys, time
import mlx.core as mx
from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler
root=pathlib.Path(__file__).resolve().parent.parent
run=pathlib.Path(sys.argv[1]).resolve()
if not run.is_relative_to(root/'.local-lab/reports'):raise ValueError('Invalid report directory')
data=json.loads((run/'input.json').read_text())
mx.set_memory_limit(16*1024**3);mx.set_cache_limit(512*1024**2);mx.random.seed(7)
start=time.monotonic()
model,tokenizer=load(data['model'],adapter_path=data['adapter'],trust_remote_code=False)
prompt=tokenizer.apply_chat_template([{'role':'system','content':data['system']},{'role':'user','content':data['request']}],tokenize=False,add_generation_prompt=True,enable_thinking=False)
raw=generate(model,tokenizer,prompt=prompt,max_tokens=128,sampler=make_sampler(temp=0),verbose=False)
result={'plan':json.loads(raw.strip()),'elapsedMs':round((time.monotonic()-start)*1000),'peakMemoryBytes':mx.get_peak_memory()}
(run/'output.json').write_text(json.dumps(result))
