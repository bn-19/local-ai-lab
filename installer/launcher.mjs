import {readFile,writeFile,mkdir,unlink,lstat,open,chmod} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import net from 'node:net';import {randomBytes} from 'node:crypto';import {createInterface} from 'node:readline/promises';import {spawn} from 'node:child_process';
import {assertPortsFree,ownedProcess,stopOwned,ensureActorSecret} from './processes.mjs';
const root=process.cwd(),privateDir=path.join(root,'.local-lab/launcher'),stateFile=path.join(privateDir,'session.json');
async function stop(){let saved;try{saved=JSON.parse(await readFile(stateFile,'utf8'));}catch{throw Error('No launcher session found. Nothing stopped.');}await new Promise((resolve,reject)=>{const socket=net.createConnection(saved.socket);socket.setTimeout(15000);socket.once('connect',()=>socket.write(JSON.stringify({action:'stop',token:saved.token})+'\n'));socket.once('data',data=>{socket.end();String(data).trim()==='stopped'?resolve():reject(Error('Cleanup did not succeed; inspect the launcher Terminal.'));});socket.once('timeout',()=>{socket.destroy();reject(Error('Launcher did not respond; no process was killed by PID.'));});socket.once('error',()=>reject(Error('Launcher session is stale or unavailable. No process was killed. Inspect the original Terminal.')));});console.log('Owned Local Lab services stopped.');}
let prompt;
async function question(text){if(!process.stdin.isTTY)throw Error('Interactive Terminal required for consent.');prompt=createInterface({input:process.stdin,output:process.stdout});try{return (await prompt.question(text)).trim().toLowerCase()==='yes';}finally{prompt.close();prompt=undefined;}}
async function start(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('This helper requires Apple Silicon macOS.');
 await mkdir(privateDir,{recursive:true,mode:0o700});await chmod(privateDir,0o700);
 try{await lstat(stateFile);throw Error('A launcher session record exists. Use Stop.command or inspect its Terminal; no existing process will be interrupted.');}catch(e){if(e.code!=='ENOENT')throw e;}
 await assertPortsFree([4173,11435,7100]);
 const token=randomBytes(32).toString('hex'),socketPath=path.join(os.tmpdir(),'local-lab-'+randomBytes(12).toString('hex')+'.sock');
 const children=[],logs=[];let cleanupPromise,stateOwned=false,server,stopping=false,resolveStopped;
 const stopped=new Promise(r=>{resolveStopped=r;});
 const cleanup=(code=0)=>cleanupPromise??=(async()=>{stopping=true;prompt?.close();try{const remaining=await stopOwned(children);if(remaining.length){console.error('Owned process groups remain:',remaining.join(', '));code=1;}else console.log('Local Lab services stopped; saved work and model files preserved.');}catch{console.error('Cleanup failed; inspect the private launcher logs.');code=1;}finally{await Promise.all(logs.map(f=>f.close().catch(()=>{})));server?.close();await unlink(socketPath).catch(()=>{});if(stateOwned)await unlink(stateFile).catch(()=>{});process.exitCode=code;process.stdin.pause();resolveStopped();}return code;})();
 const handlers=new Map(['SIGINT','SIGTERM','SIGHUP'].map(sig=>[sig,()=>void cleanup()]));for(const [sig,fn]of handlers)process.on(sig,fn);
 async function logged(kind,args){if(stopping)throw Error('Start cancelled.');const file=await open(path.join(privateDir,kind+'.log'),'a',0o600);await file.chmod(0o600);logs.push(file);if(stopping){await file.close();throw Error('Start cancelled.');}const record=ownedProcess(process.execPath,args,{cwd:root,stdio:['ignore',file.fd,file.fd],env:{...process.env,PATH:path.dirname(process.execPath)+':'+process.env.PATH}});children.push(record);return record;}
 try{
  server=net.createServer(socket=>{let data='',handled=false;socket.setTimeout(5000,()=>socket.destroy());socket.on('error',()=>{});socket.on('data',chunk=>{if(handled)return;data+=chunk;if(data.length>1024){socket.destroy();return;}if(!data.includes('\n'))return;handled=true;try{const message=JSON.parse(data.trim());if(message.action!=='stop'||message.token!==token){socket.end('denied\n');return;}socket.setTimeout(0);void cleanup().then(code=>socket.end(code?'failed\n':'stopped\n'));}catch{socket.end('invalid\n');}});});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});await chmod(socketPath,0o600);
  if(stopping)throw Error('Start cancelled.');await writeFile(stateFile,JSON.stringify({socket:socketPath,token,pid:process.pid}),{mode:0o600,flag:'wx'});stateOwned=true;if(stopping){await unlink(stateFile);throw Error('Start cancelled.');}
  let relay;try{relay=JSON.parse(await readFile('.local-lab/relay.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!relay?.workspaceKey||!['planner','evaluator','trainer'].every(k=>relay[k]?.token)){
   if(!await question('Create or complete your OWN Agent Relay cloud workspace and three identities? Type yes to authorize: '))throw Error('Setup declined. Run Start.command when ready.');
   const r=await logged('relay-setup',['scripts/setup-relay.mjs']);await r.done;if(stopping)return;if(r.error||r.child.exitCode!==0)throw Error('Relay setup failed; see private relay-setup.log. Saved setup is preserved for retry.');
  }
  await assertPortsFree([4173,11435,7100]);
  await ensureActorSecret(path.join(root,'.local-lab/actor-secret'));
  for(const kind of ['actors','ollama','server']){const r=await logged(kind,['scripts/runtime.mjs',kind]);r.done.then(()=>{if(!stopping){console.error(kind+' exited unexpectedly. See private logs in .local-lab/launcher.');void cleanup(1);}});}
  console.log('Local Lab is starting. Keep this Terminal open. Ctrl+C or Stop.command stops its services.');
  console.log('Private logs: .local-lab/launcher (may contain credentials; do not share).');
  console.log('Local UI: http://127.0.0.1:4173/app/');console.log('Pairing: read .local-lab/pairing-token locally and paste it into Connect your Mac. Never share it.');
  console.log('Model downloads are separate, explicit setup actions in the UI.');
  if(!stopping&&!process.argv.includes('--no-open')&&await question('Open the local UI in your default browser? Type yes to open: ')){if(!stopping){const opener=spawn('/usr/bin/open',['http://127.0.0.1:4173/app/'],{stdio:'ignore'});opener.on('error',()=>console.error('Open the local UI address manually.'));}}
  await stopped;
 }catch(e){await cleanup(1);throw e;}finally{for(const [sig,fn]of handlers)process.removeListener(sig,fn);}
}
try{if(process.argv[2]==='stop')await stop();else if(process.argv[2]==='start')await start();else throw Error('Use Start.command or Stop.command');}catch(e){console.error('Local Lab:',e.message);process.exitCode=1;}
