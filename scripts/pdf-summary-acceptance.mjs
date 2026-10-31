// Real API acceptance; no browser, direct model calls, downloads, or service restarts.
// Coordinate the Device queue with the backend owner before running.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { documentChunks, extractDocument } from '../lib/documents.mjs';

const directory = '.local-lab/pdf-acceptance';
const origin = 'https://local-lab-bn-19s-projects.vercel.app';
const fixtures = {
  webb: {
    sha256: '84933f93b67aacaf2871ced720d76cd18d1637fde65ae9c561282ddfc692c71e',
    parts: 1,
    request: 'Summarize this PDF for a short science-club meeting. Explain its purpose, what it studies and how, key hardware and location, and the international partnership. Preserve important numbers and qualifications. Use only this document, distinguish its plans from achieved results, and cite page numbers.',
  },
  landsat9: {
    sha256: 'd4ac4b2d7c2439ef2df79dcb03f01092d2b0bbd722f0e1c169ec8755b9e027d5',
    parts: 2,
    request: 'Summarize the whole PDF for a planning meeting in one coherent briefing. Explain the mission purpose, the separate NASA and USGS responsibilities, revisit timing alone and with Landsat 8, instrument improvements and resolution qualifications, and how people obtain the data. Preserve important numbers and cite page numbers. Use only the document.',
    followup: 'According to the document, what is the native thermal-band resolution and what resolution is it resampled to? Also, what was the total mission construction cost? If the document does not give the cost, say so. Cite the source page.',
  },
};
const name = process.argv[2];
const label = process.argv[3] || new Date().toISOString().replace(/[:.]/g, '-');
const followupTaskId = process.argv[4];
assert.ok(name === 'unsupported' || fixtures[name], 'Usage: node scripts/pdf-summary-acceptance.mjs webb|landsat9|unsupported [evidence-label] [webb-parent-task-id]');
assert.match(label, /^[a-zA-Z0-9_-]+$/, 'Use a safe evidence label');
if (followupTaskId) {
  assert.equal(name, 'webb', 'Standalone follow-up uses the Webb reference rubric');
  assert.match(followupTaskId, /^[a-f0-9-]{36}$/);
}
await mkdir(directory, { recursive: true });
const evidenceFile = `${directory}/${name}-${label}.json`;
// Never overwrite previous measurements.
await writeFile(evidenceFile, '{}\n', { flag: 'wx', mode: 0o600 });
const token = (await readFile('.local-lab/pairing-token', 'utf8')).trim();
const evidence = { startedAt: new Date().toISOString(), origin, name, runs: [] };
evidence.codeHashes = {};
for (const file of ['scripts/pdf-summary-acceptance.mjs', 'lib/documents.mjs', 'lib/document-answer.mjs', 'scripts/extract-document.py', 'lib/jobs.mjs', 'lib/model.mjs']) {
  try { evidence.codeHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const checkpoint = () => writeFile(evidenceFile, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
async function request(route, body, extra = {}) {
  const response = await fetch(`http://127.0.0.1:4173/api/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json', ...extra },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  const value = await response.json();
  return { status: response.status, value, cors: response.headers.get('access-control-allow-origin') };
}
async function api(route, body, headers) {
  const response = await request(route, body, headers);
  assert.ok(response.status >= 200 && response.status < 300, `${route}: ${response.status} ${JSON.stringify(response.value)}`);
  assert.equal(response.cors, origin, 'Exact hosted origin must be accepted');
  return response.value;
}
const terminal = new Set(['ready', 'failed', 'cancelled', 'interrupted']);
async function run(route, body) {
  const created = await api(route, body);
  const record = { created, submittedAt: new Date().toISOString(), observations: [] };
  evidence.runs.push(record);
  await checkpoint();
  let job;
  try {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      job = await api(`jobs/${created.jobId}`);
      const state = await api('state');
      const observation = { status: job.status, stage: job.stage, activeJobId: state.device.active?.id ?? null, queueLength: state.device.queue.length };
      if (JSON.stringify(record.observations.at(-1)) !== JSON.stringify(observation)) record.observations.push(observation);
      if (terminal.has(job.status)) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    record.job = job;
    await checkpoint();
    assert.equal(job?.status, 'ready', 'Job must actually finish successfully');
    const task = await api(`tasks/${created.taskId}`);
    const persisted = await api('state');
    record.task = task;
    record.deviceHistory = persisted.device.history.find(entry => entry.id === job.id);
    assert.equal(task.kind, 'document');
    assert.equal(task.status, 'ready');
    assert.deepEqual(persisted.tasks.find(entry => entry.id === task.id)?.documentResult, task.documentResult);
    assert.deepEqual(job.result, task.documentResult);
    assert.equal(record.deviceHistory?.status, 'ready');
    assert.ok(record.deviceHistory.attempt, 'Actual Device attempt required');
    assert.equal(task.documentResult.parts.length, fixtures[name].parts);
    assert.ok(task.documentResult.parts.every(part => typeof part.answer === 'string' && part.answer.trim()));
    if (task.documentResult.synthesis) {
      const result = task.documentResult;
      assert.equal(result.synthesis.status, 'complete');
      assert.equal(typeof result.answer, 'string');
      assert.ok(result.answer.trim());
      assert.doesNotMatch(result.answer.trim(), /^(?:completed answer|facts)\.?$|^(?:I need to\b|Let me\b)/i, 'Reject known placeholder/planning-only regression; full source review still required');
    }
    record.apiAssertionsPassed = true;
    record.qualityVerdict = 'Requires independent source-checklist review; API success is not factual-quality success.';
    await checkpoint();
    console.log(JSON.stringify({ taskId: task.id, jobId: job.id, model: task.model, usage: job.usage, viaRelay: job.viaRelay, result: task.documentResult }, null, 2));
    return task;
  } finally {
    if (!terminal.has(job?.status)) {
      // Cancel only this script's job on timeout/failure, preserving other work.
      try { record.cleanup = await api(`jobs/${created.jobId}/cancel`, {}); }
      catch (error) { record.cleanupError = error.message; }
      if (!record.cleanupError) {
        try {
          const deadline = Date.now() + 15000;
          do {
            const current = await api(`jobs/${created.jobId}`);
            record.cleanupJobStatus = current.status;
            if (terminal.has(current.status)) break;
            await new Promise(resolve => setTimeout(resolve, 500));
          } while (Date.now() < deadline);
          if (!terminal.has(record.cleanupJobStatus)) record.cleanupError = 'Cancellation requested but terminal status not observed; inspect this job before rerun.';
        } catch (error) { record.cleanupError = error.message; }
      }
      await checkpoint();
    }
  }
}
try {
  if (name === 'unsupported') {
    const bytes = await readFile(`${directory}/encrypted-webb.pdf`);
    evidence.upload = await request('files', bytes, { 'Content-Type': 'application/pdf', 'X-Filename': 'encrypted-webb.pdf' });
    assert.equal(evidence.upload.status, 400);
    assert.match(evidence.upload.value.error, /Password-protected PDFs are unsupported/);
    assert.ok(!evidence.upload.value.id);
    evidence.apiAssertionsPassed = true;
  } else if (followupTaskId) {
    const parent = await api(`tasks/${followupTaskId}`);
    assert.equal(parent.kind, 'document');
    assert.equal(parent.status, 'ready');
    const original = await readFile(`.local-lab/documents/${parent.documentId}`);
    assert.equal(createHash('sha256').update(original).digest('hex'), fixtures.webb.sha256);
    evidence.parentTask = { id: parent.id, documentId: parent.documentId, model: parent.model };
    await run(`tasks/${parent.id}/followup`, { request: 'According to the PDF, what is the primary mirror diameter in meters and how many segments does it have? What was the total mission construction cost? If the source does not provide the cost, say so. Cite the page.' });
    evidence.apiAssertionsPassed = true;
  } else {
    const fixture = fixtures[name], file = `${directory}/${name}.pdf`, bytes = await readFile(file);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, fixture.sha256, 'Source fixture changed; review it before rerunning');
    const extracted = await extractDocument(file, `${name}.pdf`);
    assert.equal(documentChunks(extracted).length, fixture.parts);
    evidence.source = { sha256, bytes: bytes.length, characters: extracted.length, utf8Bytes: Buffer.byteLength(extracted), excerpts: fixture.parts };
    evidence.upload = await api('files', bytes, { 'Content-Type': 'application/pdf', 'X-Filename': `${name}.pdf` });
    assert.equal(evidence.upload.characters, extracted.length);
    assert.equal(evidence.upload.bytes, bytes.length);
    assert.equal(createHash('sha256').update(await readFile(`.local-lab/documents/${evidence.upload.id}`)).digest('hex'), sha256, 'Uploaded original bytes preserved');
    const task = await run('tasks', { documentId: evidence.upload.id, request: fixture.request });
    if (fixture.followup) await run(`tasks/${task.id}/followup`, { request: fixture.followup });
    evidence.apiAssertionsPassed = true;
  }
} catch (error) {
  evidence.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  evidence.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log(`Evidence: ${evidenceFile}`);
}
