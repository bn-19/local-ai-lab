import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {directoryBytes,downloadSeconds} from '../lib/model-inventory.mjs';
test('storage inventory counts real files but never follows external symlinks',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'model-inventory-'));try{await writeFile(path.join(root,'weights'),'12345678');await symlink('/etc',path.join(root,'outside'));assert.equal(await directoryBytes(root),8);assert.equal(await directoryBytes(path.join(root,'missing')),0);}finally{await rm(root,{recursive:true,force:true});}});
test('download estimates are bandwidth arithmetic rather than claimed measured setup times',()=>{assert.equal(downloadSeconds(2500000000,100),200);assert.equal(downloadSeconds(2500000000,50),400);assert.throws(()=>downloadSeconds(1,0));});
