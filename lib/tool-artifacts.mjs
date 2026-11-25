import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, readdir, lstat, realpath, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

// Public Hub metadata checked at this exact revision, never a moving model tag.
export const trainingModel = Object.freeze({
  repository:'mlx-community/Qwen3-4B-4bit', revision:'4dcb3d101c2a062e5c1d4bb173588c54ea6c4d25',
  path:'.local-lab/models/qwen3-4b-mlx', license:'Apache-2.0', downloadGB:2.3,
  files:{
    'added_tokens.json':{blob:'b54f9135e44c1e81047e8d05cb027af8bc039eed',size:707},
    'config.json':{blob:'032ad326a0daaaeeec00f2a585262acf5f692861',size:937},
    'merges.txt':{blob:'31349551d90c7606f325fe0f11bbb8bd5fa0d7c7',size:1671853},
    'model.safetensors':{sha256:'e240c0bdc0ebb0681bf0da0f98d9719fd6ebe269a3633f81542c13e81345651d',size:2263022529},
    'model.safetensors.index.json':{blob:'07e230a328dd17a09d96ee045d49b27596656aff',size:63924},
    'special_tokens_map.json':{blob:'ac23c0aaa2434523c494330aeb79c58395378103',size:613},
    'tokenizer.json':{sha256:'aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4',size:11422654},
    'tokenizer_config.json':{blob:'7345216a0785dc7086e8c245b2a9d3896ce2b756',size:9706},
    'vocab.json':{blob:'4783fe10ac3adce15ac8f358ef5462739852c569',size:2776833},
  },
});
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function ownedPath(relative, prefix='.local-lab') {
  const root=path.resolve(prefix), target=path.resolve(relative);
  if(!target.startsWith(root+path.sep))throw Error('Artifact must be in local app storage');
  // Reject symlinks in every component, including the storage directory itself.
  const parts=path.relative(process.cwd(),target).split(path.sep);let at=process.cwd();
  for(const part of parts){at=path.join(at,part);if((await lstat(at)).isSymbolicLink())throw Error('Artifact symlinks are unsupported');}
  if(await realpath(target)!==target)throw Error('Artifact escaped local app storage');
  return target;
}
export async function fileIdentity(file) {
  const target=await ownedPath(file),stat=await lstat(target);
  if(!stat.isFile())throw Error('Expected a regular artifact file');
  const sha=createHash('sha256'),blob=createHash('sha1').update(`blob ${stat.size}\0`);
  for await(const bytes of createReadStream(target)){sha.update(bytes);blob.update(bytes);}
  return {sha256:sha.digest('hex'),blob:blob.digest('hex'),size:stat.size};
}
export async function verifyTrainingBase() {
  const base=await ownedPath(trainingModel.path);
  const extras=(await readdir(base)).filter(name=>!Object.hasOwn(trainingModel.files,name)&&!['README.md','.cache'].includes(name));
  if(extras.length)throw Error('Unreviewed base model files: '+extras.join(', '));
  const files={};
  for(const [name,expected] of Object.entries(trainingModel.files)){
    const actual=await fileIdentity(path.join(trainingModel.path,name));
    if(actual.size!==expected.size||(expected.sha256?actual.sha256!==expected.sha256:actual.blob!==expected.blob))throw Error('Base model integrity check failed: '+name);
    files[name]={sha256:actual.sha256,size:actual.size};
  }
  const identity={repository:trainingModel.repository,revision:trainingModel.revision,path:trainingModel.path,files};
  return {...identity,fingerprint:fingerprint(identity)};
}
export async function bindToolArtifacts(result, harness) {
  const base=await verifyTrainingBase();
  if(result.model.repository!==base.repository||result.model.revision!==base.revision)throw Error('Training result base mismatch');
  let adapter=null;
  if(result.selected==='adapter'){
    const directory=path.dirname(result.adapterPath);
    if(!path.resolve(directory).startsWith(path.resolve('.local-lab/finetune')+path.sep))throw Error('Invalid adapter location');
    const files={};
    for(const name of ['adapters.safetensors','adapter_config.json'])files[name]=await fileIdentity(path.join(directory,name));
    if(files['adapters.safetensors'].sha256!==result.adapterSHA256)throw Error('Training adapter changed');
    adapter={path:directory,files};
  }
  const binding={base,adapter,harness};
  return {...binding,fingerprint:fingerprint(binding)};
}
export async function verifyToolArtifacts(binding) {
  const {fingerprint:recorded,...value}=binding;
  if(fingerprint(value)!==recorded)throw Error('Saved tool binding changed');
  const actual=await verifyTrainingBase();
  if(actual.fingerprint!==binding.base.fingerprint)throw Error('Saved base model changed');
  if(binding.adapter)for(const [name,expected] of Object.entries(binding.adapter.files)){
    const file=await fileIdentity(path.join(binding.adapter.path,name));
    if(file.sha256!==expected.sha256||file.size!==expected.size)throw Error('Saved adapter changed: '+name);
  }
  return binding;
}
export async function writeTrainingModelRecord() {
  const model=await verifyTrainingBase();
  await mkdir('.local-lab/finetune',{recursive:true});
  await writeFile('.local-lab/finetune/model.json',JSON.stringify(model,null,2),{mode:0o600});
  return model;
}
