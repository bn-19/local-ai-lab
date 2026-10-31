import test from 'node:test';
import assert from 'node:assert/strict';
import { measureColumns } from '../src/dashboard.js';

test('measure choices use profile types, not names, with explicit text fallback', () => {
  const columns = [
    { name: 'revenue', type: 'VARCHAR' },
    { name: 'price', type: 'DECIMAL(18,2)' },
    { name: 'count', type: 'BIGINT' },
    { name: 'ratio', type: 'DOUBLE' },
    { name: 'date', type: 'DATE' },
    { name: 'unknown' },
    { name: 'items', type: 'STRUCT(amount INTEGER)' }
  ];
  assert.deepEqual(measureColumns(columns), ['price', 'count', 'ratio']);
  assert.deepEqual(measureColumns(columns, true), columns.map(c => c.name));
  assert.deepEqual(measureColumns([{ name: 'total', type: 'VARCHAR' }]), []);
});
