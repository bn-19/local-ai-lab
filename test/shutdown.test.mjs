import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {spawnSync} from 'node:child_process';import {installShutdownHandlers} from '../lib/server-shutdown.mjs';
test('repeated shutdown signals await drainage before exit and preserve failure status',async()=>{
 const signals=new EventEmitter(),exits=[];let finish,drains=0,closed=false,cleared=false;
 const server={close(callback){closed=true;callback();},closeAllConnections(){cleared=true;}};
 const stop=installShutdownHandlers(server,()=>{drains++;return new Promise(resolve=>finish=resolve);},{signals,exit:code=>exits.push(code)});
 signals.emit('SIGTERM');signals.emit('SIGTERM');signals.emit('SIGINT');assert.equal(closed,true);assert.equal(drains,1);assert.deepEqual(exits,[]);assert.equal(cleared,false);finish();await stop();assert.deepEqual(exits,[0]);assert.equal(cleared,true);
 let reported;const bad=installShutdownHandlers(server,async()=>{throw Error('cleanup unconfirmed');},{signals:new EventEmitter(),exit:code=>exits.push(code),report:error=>reported=error.message});await bad();assert.equal(reported,'cleanup unconfirmed');assert.equal(exits.at(-1),1);
});
test('stopping the actual worker drains detached work and persists cancellation before exit',()=>{
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks',new URL('./fixtures/worker-shutdown.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr+result.stdout);
});

test('unconfirmed durable cleanup prevents a successful shutdown result',()=>{
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks',new URL('./fixtures/worker-shutdown.mjs',import.meta.url).pathname,'--fail-finish'],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr+result.stdout);
});
