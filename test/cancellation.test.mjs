import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('queued evaluation cancellation permits retry and preserves completed jobs', () => {
  const result = spawnSync(process.execPath, [
    '--experimental-test-module-mocks',
    fileURLToPath(new URL('./fixtures/cancellation.mjs', import.meta.url)),
  ], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});
