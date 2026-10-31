import {open,readFile,chmod,lstat} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
export async function assertPortsFree(ports){for(const port of ports)await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error(`Port ${port} is already in use. Stop that application yourself; Local Lab will not interrupt it.`)));s.listen({host:'127.0.0.1',port,exclusive:true},()=>s.close(resolve));});}
export function ownedProcess(command,args,options={}){const child=spawn(command,args,{...options,detached:true});const record={child,pid:child.pid,closed:false};record.done=new Promise(resolve=>{child.once('error',e=>{record.error=e;});child.once('close',()=>{record.closed=true;resolve();});});return record;}
export async function stopOwned(records){
 const signal=s=>{for(const r of records)if(r.pid)try{process.kill(-r.pid,s);}catch(e){if(e.code!=='ESRCH')throw e;}};
 signal('SIGTERM');let timer;try{await Promise.race([Promise.all(records.map(r=>r.done)),new Promise(r=>{timer=setTimeout(r,3000);})]);}finally{clearTimeout(timer);}
 signal('SIGKILL');await Promise.all(records.map(r=>r.done));
 const alive=()=>records.filter(r=>{if(!r.pid)return false;try{process.kill(-r.pid,0);return true;}catch(e){if(e.code!=='ESRCH')throw e;return false;}}).map(r=>r.pid);
 for(let i=0;i<20;i++){if(!alive().length)return [];await new Promise(r=>setTimeout(r,50));}return alive();
}
export async function ensureActorSecret(file){
 try{const handle=await open(file,'wx',0o600);try{await handle.writeFile(randomBytes(32).toString('hex'));}finally{await handle.close();}}catch(e){if(e.code!=='EEXIST')throw e;}
 const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Actor secret must be a regular local file.');
 const secret=(await readFile(file,'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Existing actor secret is invalid; preserved without replacement.');await chmod(file,0o600);return secret;
}
