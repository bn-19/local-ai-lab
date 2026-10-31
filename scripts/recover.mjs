import { readFile } from 'node:fs/promises';
import { device, state, save } from '../lib/actors.mjs';
const old = JSON.parse(await readFile('.local-lab/executor.json', 'utf8'));
let stopped = false;
try { process.kill(old.pid, 0); } catch (error) { if (error.code === 'ESRCH') stopped = true; else throw error; }
if (!stopped) throw new Error('Previous backend is still alive. Stop only its own terminal/process first.');
try {
  await fetch('http://127.0.0.1:11435/api/version', {signal: AbortSignal.timeout(2000)});
  throw new Error('Project Ollama listener is still running. Stop it before reconciling an interrupted job.');
} catch (error) {
  if (error.cause?.code !== 'ECONNREFUSED') throw error;
}
const d = JSON.parse(await device.read());
if (d.active) {
  if (d.active.executor !== old.executor) throw new Error('Active attempt belongs to another executor; refusing recovery.');
  const job = (await state())['job:' + d.active.id];
  if (job) await save('job:' + job.id, {...job, status:'interrupted', stage:'Interrupted; safe to retry as a new job', error:'Owner process and Ollama stopped before explicit recovery.'});
  await device.reconcile(old.executor);
}
console.log('Device reconciled after confirming backend exit and refused Ollama connection. Restart Ollama, then backend; interrupted jobs are not automatically replayed.');
