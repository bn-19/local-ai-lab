import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {addWebAssets} from '../lib/web-assets.mjs';

test('packaged assets and document extractor work from a runtime path with spaces',async()=>{
 const project=await mkdtemp(path.join(tmpdir(),'local lab runtime path '));
 try {
  const dist=path.join(project,'web','dist','assets');await mkdir(dist,{recursive:true});
  await writeFile(path.join(project,'web','dist','index.html'),'<main>Local Lab</main>');
  await writeFile(path.join(dist,'app.js'),'export const ready=true;');
  const files=new Map();await addWebAssets(files,pathToFileURL(path.join(project,'server.mjs')));
  assert.equal(await readFile(files.get('/app/')[0],'utf8'),'<main>Local Lab</main>');
  assert.equal(await readFile(files.get('/app/assets/app.js')[0],'utf8'),'export const ready=true;');

  await mkdir(path.join(project,'lib'),{recursive:true});await mkdir(path.join(project,'scripts'),{recursive:true});
  await copyFile(fileURLToPath(new URL('../lib/documents.mjs',import.meta.url)),path.join(project,'lib','documents.mjs'));
  await copyFile(fileURLToPath(new URL('../scripts/extract-document.py',import.meta.url)),path.join(project,'scripts','extract-document.py'));
  const document=path.join(project,'input.docx');
  execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("word/document.xml",\'<w:document xmlns:w="urn:word"><w:p><w:t>Space path works</w:t></w:p></w:document>\'); z.close()',document]);
  const module=await import(pathToFileURL(path.join(project,'lib','documents.mjs')));
  assert.equal(await module.extractDocument(document,'input.docx'),'Space path works');
 } finally {await rm(project,{recursive:true,force:true});}
});
