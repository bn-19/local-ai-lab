import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,mkdir,open,rename,unlink} from 'node:fs/promises';
import path from 'node:path';

export async function privateDirectory(relative){
  const target=path.resolve(relative),root=path.resolve('.local-lab');
  if(target!==root&&!target.startsWith(root+path.sep))throw Error('Setup must stay inside app-owned local storage');
  let current=process.cwd();
  for(const part of path.relative(current,target).split(path.sep)){
    current=path.join(current,part);
    try{await mkdir(current,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
    const entry=await lstat(current);if(entry.isSymbolicLink()||!entry.isDirectory())throw Error('Setup directory must be a real app-owned directory');
  }
  return target;
}
export async function hashFile(file){
  const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Expected a regular setup artifact');
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  return {sha256:hash.digest('hex'),sizeBytes:stat.size};
}
export function validateDownloadPin(pin){
  const url=new URL(pin.url);
  if(url.protocol!=='https:'||url.username||url.password||!['github.com','files.pythonhosted.org'].includes(url.hostname)||!/^[a-f0-9]{64}$/.test(pin.sha256)||!Number.isSafeInteger(pin.sizeBytes)||pin.sizeBytes<1||pin.sizeBytes>300*1024*1024)throw Error('Invalid pinned setup download');
}
export async function verifiedDownload(pin,destination,{signal,fetcher=fetch,timeout=10*60*1000}={}){
  validateDownloadPin(pin);signal?.throwIfAborted();
  const directory=await privateDirectory(path.dirname(destination)),file=path.join(directory,path.basename(destination));
  try{const found=await hashFile(file);if(found.sha256!==pin.sha256||found.sizeBytes!==pin.sizeBytes)throw Error('Cached setup artifact failed verification; nothing executed');return {path:file,cacheReused:true,downloadedBytes:0};}catch(error){if(error.code!=='ENOENT')throw error;}
  const partial=file+'.partial-'+randomUUID();let handle,response;
  const scoped=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(timeout)]);
  try{
    response=await fetcher(pin.url,{signal:scoped,redirect:'follow'});
    if(!response.ok)throw Error('Setup download failed: HTTP '+response.status);
    const final=new URL(response.url||pin.url);
    if(final.protocol!=='https:'||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','files.pythonhosted.org'].includes(final.hostname))throw Error('Setup download redirected outside the approved source');
    const advertised=response.headers.get('content-length');if(advertised&&Number(advertised)!==pin.sizeBytes)throw Error('Setup download size does not match the pinned artifact');
    handle=await open(partial,'wx',0o600);const hash=createHash('sha256');let bytes=0;
    for await(const chunk of response.body){scoped.throwIfAborted();bytes+=chunk.length;if(bytes>pin.sizeBytes)throw Error('Setup download exceeded the pinned size');await handle.writeFile(chunk);hash.update(chunk);}
    if(bytes!==pin.sizeBytes||hash.digest('hex')!==pin.sha256)throw Error('Setup download checksum or size mismatch; nothing executed');
    await handle.close();handle=null;scoped.throwIfAborted();
    // The Device queue serializes setup. Never overwrite a path introduced by another owner.
    try{await lstat(file);throw Error('Setup destination appeared during download');}catch(error){if(error.code!=='ENOENT')throw error;}
    await rename(partial,file);return {path:file,cacheReused:false,downloadedBytes:bytes};
  }finally{await handle?.close();try{await response?.body?.cancel();}catch{}await unlink(partial).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
