import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {runLocalProcess} from './local-process.mjs';
const probe=['-I','-c',"import PIL; assert PIL.__version__ == '11.2.1'"];
export async function findVlmPython(root,signal,run=runLocalProcess){
 for(const folder of ['vlm-venv','venv']){const python=path.join(root,folder,'bin/python');try{await run(python,probe,{signal,timeout:3000,maxBuffer:4096});return python;}catch(error){if(signal?.aborted)throw error;}}
 return null;
}
export async function ensureVlmPython(root,signal,progress,run=runLocalProcess){
 const existing=await findVlmPython(root,signal,run);if(existing)return existing;
 await progress('System · Preparing lightweight photo runtime: Pillow 11.2.1 only; no CLIP or training libraries');
 await mkdir(root,{recursive:true,mode:0o700});const directory=path.join(root,'vlm-venv'),python=path.join(directory,'bin/python');
 await run('python3',['-m','venv',directory],{signal,timeout:30000,maxBuffer:1024*1024});
 await run(python,['-m','pip','install','--disable-pip-version-check','--no-deps','Pillow==11.2.1'],{signal,timeout:120000,maxBuffer:1024*1024});
 await run(python,probe,{signal,timeout:3000,maxBuffer:4096});return python;
}
