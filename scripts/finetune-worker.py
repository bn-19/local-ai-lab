"""Fixed local QLoRA experiment. Invoked only while holding a Device reservation."""
import sys, json, os, pathlib, subprocess, time, hashlib, importlib.metadata, math

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _integer(value, label, minimum=0):
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ValueError(f'{label} must be an integer >= {minimum}')
    return value


def _finite_number(value, label, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < minimum:
        raise ValueError(f'{label} must be a finite number >= {minimum}')
    return value


def _validate_evaluation(name, evidence, final_cases):
    if not isinstance(evidence, dict) or not isinstance(evidence.get('cases'), list):
        raise ValueError(f'{name} evaluation cases are required')
    cases = evidence['cases']
    if len(cases) != len(final_cases):
        raise ValueError(f'{name} evaluation does not match final case count')
    final_ids = [case.get('id') for case in final_cases]
    if any(not isinstance(case_id, str) or not case_id for case_id in final_ids) or len(set(final_ids)) != len(final_ids):
        raise ValueError('Final case IDs must be unique non-empty strings')
    for index, (case, final_case) in enumerate(zip(cases, final_cases)):
        if not isinstance(case, dict) or case.get('id') != final_case['id'] or case.get('expected') != final_case.get('expected'):
            raise ValueError(f'{name} case {index} does not have the identical final ID and expected plan')
        if not isinstance(case.get('passed'), bool):
            raise ValueError(f'{name} case {case["id"]} has invalid pass evidence')
        if case['passed'] != (case.get('plan') == final_case.get('expected')):
            raise ValueError(f'{name} case {case["id"]} pass evidence disagrees with its plan')
        if 'elapsedSeconds' in case:
            _finite_number(case['elapsedSeconds'], f'{name} case elapsedSeconds')
    score = _integer(evidence.get('score'), f'{name} score')
    if score != sum(case['passed'] for case in cases):
        raise ValueError(f'{name} score disagrees with case evidence')
    if score > len(cases):
        raise ValueError(f'{name} score exceeds final case count')
    if 'peakMemoryBytes' in evidence:
        _finite_number(evidence['peakMemoryBytes'], f'{name} peakMemoryBytes')
    return cases, score


def evaluate_promotion_gate(baseline, adapted, final_cases, require_critical_gate=False):
    """Validate evidence and return the one promotion decision used by the worker."""
    if not isinstance(require_critical_gate, bool):
        raise ValueError('requireCriticalGate must be a boolean')
    if not isinstance(final_cases, list) or not final_cases:
        raise ValueError('Final cases are required')
    baseline_cases, baseline_score = _validate_evaluation('baseline', baseline, final_cases)
    adapted_cases, adapted_score = _validate_evaluation('adapted', adapted, final_cases)
    nonzero_lora_b = _integer(adapted.get('nonzeroLoRABParameters'), 'adapted nonzeroLoRABParameters')
    critical_ids = [case['id'] for case in final_cases if case.get('critical') is True]
    if require_critical_gate and not critical_ids:
        raise ValueError('Critical final cases are required')
    baseline_by_id = {case['id']: case for case in baseline_cases}
    adapted_by_id = {case['id']: case for case in adapted_cases}
    candidate_failures = [case_id for case_id in critical_ids if not adapted_by_id[case_id]['passed']]
    regressions = [case_id for case_id in critical_ids if baseline_by_id[case_id]['passed'] and not adapted_by_id[case_id]['passed']]
    aggregate_improved = adapted_score > baseline_score
    weights_changed = nonzero_lora_b > 0
    critical_passed = not candidate_failures
    no_critical_regression = not regressions
    strict_checks = weights_changed and critical_passed and no_critical_regression
    promoted = aggregate_improved and (strict_checks if require_critical_gate else True)
    reasons = []
    if not aggregate_improved:
        reasons.append('aggregate_not_strictly_better')
    if require_critical_gate and not weights_changed:
        reasons.append('lora_b_unchanged')
    if require_critical_gate and not critical_passed:
        reasons.append('critical_candidate_failure')
    if require_critical_gate and not no_critical_regression:
        reasons.append('critical_regression')
    return {
        'policy': 'strict-critical-v1' if require_critical_gate else 'legacy-strict-score-v1',
        'selected': 'adapter' if promoted else 'baseline',
        'promoted': promoted,
        'aggregate': {
            'baselineScore': baseline_score,
            'candidateScore': adapted_score,
            'total': len(final_cases),
            'strictlyImproved': aggregate_improved,
        },
        'weights': {'nonzeroLoRABParameters': nonzero_lora_b, 'changed': weights_changed},
        'critical': {
            'required': require_critical_gate,
            'ids': critical_ids,
            'candidateFailures': candidate_failures,
            'baselinePassingRegressions': regressions,
            'allCandidatePassed': critical_passed,
            'noBaselinePassingRegression': no_critical_regression,
        },
        'reasons': reasons,
    }


def _reject_constant(value):
    raise ValueError(f'Non-finite JSON value is not allowed: {value}')


def _json_load(path):
    return json.loads(path.read_text(), parse_constant=_reject_constant)


def _write_json(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False))


def _announce(message):
    print(message, flush=True)


def _load_context(directory):
    run = pathlib.Path(directory).resolve()
    if not run.is_relative_to(ROOT / '.local-lab' / 'finetune'):
        raise ValueError('Run must stay in local training storage')
    manifest = _json_load(run / 'manifest.json')
    model_path = str(ROOT / manifest['model']['path'])
    return run, manifest, model_path


def _configure_local_runtime():
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['HF_HOME'] = str(ROOT / '.local-lab/huggingface')
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'


def _configure_mlx(limit_gb=16):
    import mlx.core as mx
    mx.set_memory_limit(limit_gb * 1024**3)
    mx.set_cache_limit(512 * 1024**2)
    mx.random.seed(7)
    return mx


def _train(run):
    import functools
    from mlx_lm import lora
    original_load = lora.load

    def training_load(*args, **kwargs):
        kwargs['trust_remote_code'] = False
        model, tokenizer = original_load(*args, **kwargs)
        tokenizer.apply_chat_template = functools.partial(tokenizer.apply_chat_template, enable_thinking=False)
        return model, tokenizer

    lora.load = training_load
    _announce('Training task-specific adapter weights')
    sys.argv = ['mlx_lm.lora', '--config', str(run / 'config.json')]
    lora.main()


def _evaluate(mode, run, manifest, model_path, mx):
    from mlx_lm import load, generate
    from mlx_lm.sample_utils import make_sampler
    adapter_path = str(run / 'adapter') if mode == 'adapted' else manifest.get('baselineAdapter')
    model, tokenizer = load(model_path, adapter_path=adapter_path, trust_remote_code=False)
    final_cases = _json_load(run / 'final.json')
    results = []
    label = 'unchanged base model' if mode == 'baseline' else 'trained candidate'
    for case in final_cases:
        prompt = tokenizer.apply_chat_template(
            [{'role':'system','content':manifest['system']},{'role':'user','content':case['request']}],
            tokenize=False, add_generation_prompt=True, enable_thinking=False)
        started = time.monotonic()
        text = generate(model, tokenizer, prompt=prompt, max_tokens=128, sampler=make_sampler(temp=0), verbose=False)
        try:
            value = json.loads(text.strip(), parse_constant=_reject_constant)
            passed = value == case['expected']
        except (ValueError, TypeError):
            value = None
            passed = False
        results.append({**case, 'plan':value, 'raw':text, 'passed':passed, 'elapsedSeconds':round(time.monotonic()-started, 3)})
        _announce(f'Evaluating {label}: {len(results)}/{len(final_cases)}')
    weights = mx.load(str(run / 'adapter/adapters.safetensors')) if mode == 'adapted' else {}
    changed = sum(int(mx.count_nonzero(value).item()) for key, value in weights.items() if key.endswith('lora_b'))
    _write_json(run / f'{mode}.json', {
        'cases':results,
        'score':sum(result['passed'] for result in results),
        'peakMemoryBytes':mx.get_peak_memory(),
        'nonzeroLoRABParameters':changed,
    })


def _run(run, manifest):
    if manifest.get('requireCriticalGate') and manifest.get('baselineAdapter') is not None:
        raise ValueError('Reviewed tool training baseline must be the unchanged foundation model')
    started = time.monotonic()
    phases = [
        ('baseline', 'Evaluating the unchanged base model'),
        ('train', 'Adapting weights for the reviewed sales-reporting task'),
        ('adapted', 'Evaluating the trained candidate on the same held-out checks'),
    ]
    for phase, message in phases:
        _announce(message)
        subprocess.run([sys.executable, __file__, phase, str(run)], check=True, timeout=max(1, 900-(time.monotonic()-started)))
    baseline = _json_load(run / 'baseline.json')
    adapted = _json_load(run / 'adapted.json')
    final_cases = _json_load(run / 'final.json')
    gate = evaluate_promotion_gate(baseline, adapted, final_cases, bool(manifest.get('requireCriticalGate', False)))
    adapter = run / 'adapter/adapters.safetensors'
    if not adapter.is_file():
        raise RuntimeError('No trained weights produced')
    result = {
        'profile':manifest.get('profile','retail'),
        'baselineAdapter':manifest.get('baselineAdapter'),
        'type':'QLoRA weight fine-tuning',
        'model':manifest['model'],
        'baseline':baseline,
        'adapted':adapted,
        'total':len(baseline['cases']),
        'selected':gate['selected'],
        'gate':gate,
        'adapterPath':str(adapter.relative_to(ROOT)),
        'adapterSHA256':hashlib.sha256(adapter.read_bytes()).hexdigest(),
        'adapterBytes':adapter.stat().st_size,
        'elapsedSeconds':round(time.monotonic()-started,3),
        'manifest':str((run/'manifest.json').relative_to(ROOT)),
        'runtimeVersions':{package:importlib.metadata.version(package) for package in ['mlx','mlx-lm','transformers']},
    }
    _write_json(run / 'result.json', result)
    _announce('Training review complete; '+('candidate promoted' if gate['promoted'] else 'base model retained'))


def _dispatch(argv):
    if len(argv) >= 2 and argv[1] == 'gate':
        payload = json.loads(sys.stdin.read(), parse_constant=_reject_constant)
        result = evaluate_promotion_gate(payload['baseline'], payload['adapted'], payload['final'], payload.get('requireCriticalGate', False))
        print(json.dumps(result, allow_nan=False))
        return
    if len(argv) != 3:
        raise ValueError('Usage: finetune-worker.py <run|baseline|train|adapted> <run-directory>')
    mode, directory = argv[1:3]
    run, manifest, model_path = _load_context(directory)
    _configure_local_runtime()
    if mode in ('baseline','adapted','train'):
        mx = _configure_mlx(8 if manifest.get('requireCriticalGate') else 16)
    if mode == 'train':
        _train(run)
    elif mode in ('baseline','adapted'):
        _evaluate(mode, run, manifest, model_path, mx)
    elif mode == 'run':
        _run(run, manifest)
    else:
        raise ValueError('Unsupported mode')


if __name__ == '__main__':
    _dispatch(sys.argv)
