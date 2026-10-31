"""Fixed local QLoRA experiment. Invoked only while holding a Device reservation."""
import sys, json, os, pathlib, subprocess, time, hashlib, importlib.metadata
ROOT = pathlib.Path(__file__).resolve().parent.parent
mode, directory = sys.argv[1:3]
run = pathlib.Path(directory).resolve()
if not run.is_relative_to(ROOT / '.local-lab' / 'finetune'):
    raise ValueError('Run must stay in local training storage')
manifest = json.loads((run / 'manifest.json').read_text())
model_path = str(ROOT / manifest['model']['path'])
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HOME'] = str(ROOT / '.local-lab/huggingface')
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
if mode in ('baseline','adapted','train'):
    import mlx.core as mx
    mx.set_memory_limit(16 * 1024**3)
    mx.set_cache_limit(512 * 1024**2)
    mx.random.seed(7)
if mode == 'train':
    import functools
    from mlx_lm import lora
    original_load = lora.load
    def training_load(*args, **kwargs):
        model, tokenizer = original_load(*args, **kwargs)
        tokenizer.apply_chat_template = functools.partial(tokenizer.apply_chat_template, enable_thinking=False)
        return model, tokenizer
    lora.load = training_load
    sys.argv = ['mlx_lm.lora', '--config', str(run / 'config.json')]
    lora.main()
elif mode in ('baseline','adapted'):
    from mlx_lm import load, generate
    from mlx_lm.sample_utils import make_sampler
    model, tokenizer = load(model_path, adapter_path=str(run/'adapter') if mode=='adapted' else manifest.get('baselineAdapter'))
    results=[]
    for c in json.loads((run/'final.json').read_text()):
        prompt=tokenizer.apply_chat_template([{'role':'system','content':manifest['system']},{'role':'user','content':c['request']}],tokenize=False,add_generation_prompt=True,enable_thinking=False)
        started=time.monotonic()
        text=generate(model,tokenizer,prompt=prompt,max_tokens=128,sampler=make_sampler(temp=0),verbose=False)
        try:
            value=json.loads(text.strip())
            passed=value==c['expected']
        except (ValueError,TypeError):
            value=None;passed=False
        results.append({**c,'plan':value,'raw':text,'passed':passed,'elapsedSeconds':round(time.monotonic()-started,3)})
        print(json.dumps({'phase':mode,'completed':len(results),'total':len(json.loads((run/'final.json').read_text()))}),flush=True)
    weights = mx.load(str(run/'adapter/adapters.safetensors')) if mode=='adapted' else {}
    changed = sum(int(mx.count_nonzero(v).item()) for k,v in weights.items() if k.endswith('lora_b'))
    (run/f'{mode}.json').write_text(json.dumps({'cases':results,'score':sum(r['passed'] for r in results),'peakMemoryBytes':mx.get_peak_memory(),'nonzeroLoRABParameters':changed},indent=2))
elif mode == 'run':
    started=time.monotonic()
    for phase in ['baseline','train','adapted']:
        print('Phase: '+phase,flush=True)
        subprocess.run([sys.executable,__file__,phase,str(run)],check=True,timeout=max(1,900-(time.monotonic()-started)))
    base=json.loads((run/'baseline.json').read_text()); tuned=json.loads((run/'adapted.json').read_text())
    adapter=run/'adapter/adapters.safetensors'
    if not adapter.is_file(): raise RuntimeError('No trained weights produced')
    result={'profile':manifest.get('profile','retail'),'baselineAdapter':manifest.get('baselineAdapter'),'type':'QLoRA weight fine-tuning','model':manifest['model'],'baseline':base,'adapted':tuned,'total':len(base['cases']),'selected':'adapter' if tuned['score']>base['score'] else 'baseline','adapterPath':str(adapter.relative_to(ROOT)),'adapterSHA256':hashlib.sha256(adapter.read_bytes()).hexdigest(),'adapterBytes':adapter.stat().st_size,'elapsedSeconds':round(time.monotonic()-started,3),'manifest':str((run/'manifest.json').relative_to(ROOT)),'runtimeVersions':{p:importlib.metadata.version(p) for p in ['mlx','mlx-lm','transformers']}}
    (run/'result.json').write_text(json.dumps(result,indent=2))
    print('Experiment complete',flush=True)
else:
    raise ValueError('Unsupported mode')
