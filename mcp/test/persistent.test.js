import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPersistentOverrides } from '../src/transform/persistent.js';

const nodes = [
  { id: 'a', name: 'A', type: 'project', position: { x: 0, y: 0 }, description: 'scan A' },
  { id: 'b', name: 'B', type: 'database', position: { x: 640, y: 0 }, description: 'scan B' },
];

test('overlays position from matching ids, leaves new nodes untouched', () => {
  const overrides = new Map([['a', { id: 'a', position: { x: 999, y: 888 } }]]);
  const out = applyPersistentOverrides(nodes, overrides);
  assert.deepEqual(out[0].position, { x: 999, y: 888 });
  assert.deepEqual(out[1].position, { x: 640, y: 0 });
});

test('overlays agentContext (graph-owned, like position)', () => {
  const target = [{ id: 'a', name: 'A', type: 'project', position: { x: 0, y: 0 }, agentContext: null }];
  const overrides = new Map([['a', { id: 'a', agentContext: 'Always run npm test in mcp/.' }]]);
  const out = applyPersistentOverrides(target, overrides);
  assert.equal(out[0].agentContext, 'Always run npm test in mcp/.');
});

test('does NOT overlay description (scan-owned)', () => {
  const overrides = new Map([['a', { id: 'a', position: { x: 1, y: 2 }, description: 'old graph A' }]]);
  const out = applyPersistentOverrides(nodes, overrides);
  assert.equal(out[0].description, 'scan A');
});

test('empty/absent overrides is a no-op returning equivalent nodes', () => {
  assert.deepEqual(applyPersistentOverrides(nodes, new Map()), nodes);
  assert.deepEqual(applyPersistentOverrides(nodes, null), nodes);
});

test('ignores override fields that are null/undefined', () => {
  const overrides = new Map([['a', { id: 'a', position: null }]]);
  const out = applyPersistentOverrides(nodes, overrides);
  assert.deepEqual(out[0].position, { x: 0, y: 0 });
});
