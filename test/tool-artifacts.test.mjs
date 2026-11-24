import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {fingerprint,fileIdentity,ownedPath,verifyTrainingBase,trainingModel} from '../lib/tool-artifacts.mjs';

test('artifact verification binds bytes and rejects symlink escape and counterfeit base metadata',async()=>{
  const before=process.cwd(),root=await mkdtemp(path.join(os.tmpdir(),'local-lab-artifacts-'));
  try{
    process.chdir(root);await mkdir('.local-lab/models/qwen3-4b-mlx',{recursive:true});
    await writeFile('.local-lab/example','abc');
    assert.equal((await fileIdentity('.local-lab/example')).sha256,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    await writeFile('.local-lab/example','abd');
    assert.notEqual((await fileIdentity('.local-lab/example')).sha256,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    await symlink(path.join(root,'.local-lab/example'),'.local-lab/link');
    await assert.rejects(fileIdentity('.local-lab/link'),/symlinks/);
    await assert.rejects(ownedPath('../outside'),/local app storage/);
    await writeFile(path.join(trainingModel.path,'added_tokens.json'),'fake');
    await assert.rejects(verifyTrainingBase(),/integrity check failed/);
    assert.notEqual(fingerprint({adapter:'a'}),fingerprint({adapter:'b'}));
  }finally{process.chdir(before);await rm(root,{recursive:true,force:true});}
});
