import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLayout } from '../src/transform/layout.js';

test('lays out along dependency direction: a→b puts b to the right of a (rankdir LR)', () => {
  const nodes = [{ key: 'a', type: 'project' }, { key: 'b', type: 'service' }];
  const edges = [{ source: 'a', target: 'b', type: 'rest_api' }];
  const out = applyLayout(nodes, edges);
  const a = out.find((n) => n.key === 'a').position;
  const b = out.find((n) => n.key === 'b').position;
  assert.ok(b.x > a.x, 'a dependency target lands in a later rank (further right)');
});

test('a chain a→b→c ranks strictly left to right', () => {
  const nodes = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
  const out = applyLayout(nodes, edges);
  const x = (k) => out.find((n) => n.key === k).position.x;
  assert.ok(x('a') < x('b') && x('b') < x('c'));
});

test('siblings sharing a parent share a rank (same x) but separate vertically', () => {
  const nodes = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  const edges = [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }];
  const out = applyLayout(nodes, edges);
  const b = out.find((n) => n.key === 'b').position;
  const c = out.find((n) => n.key === 'c').position;
  assert.equal(b.x, c.x);
  assert.notEqual(b.y, c.y);
});

test('every node gets a numeric position, even with no edges', () => {
  const out = applyLayout([{ key: 'a' }, { key: 'b' }], []);
  for (const n of out) {
    assert.equal(typeof n.position.x, 'number');
    assert.equal(typeof n.position.y, 'number');
  }
});

test('an edge referencing a missing node is ignored (no throw)', () => {
  const out = applyLayout([{ key: 'a' }], [{ source: 'a', target: 'ghost' }]);
  assert.equal(out.length, 1);
  assert.equal(typeof out[0].position.x, 'number');
});

test('does not mutate the input nodes', () => {
  const nodes = [{ key: 'a' }];
  applyLayout(nodes, []);
  assert.equal(nodes[0].position, undefined);
});
