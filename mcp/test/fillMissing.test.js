import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillMissingNodeFields } from '../src/transform/fillMissing.js';

function freshNode(overrides = {}) {
  return {
    id: 'n1',
    name: 'acme-api',
    type: 'service',
    description: null,
    repoUrl: null,
    projectPath: null,
    agentContext: null,
    position: { x: 0, y: 0 },
    data: { technologies: [], port: null },
    links: [],
    ...overrides,
  };
}

test('fills scalar fields the fresh scan left null from the previous node', () => {
  const previous = new Map([
    ['n1', { id: 'n1', description: 'old desc', repoUrl: 'https://gitlab.com/x/y', projectPath: 'backend/api' }],
  ]);
  const { nodes, backfilled } = fillMissingNodeFields([freshNode()], previous);
  assert.equal(nodes[0].description, 'old desc');
  assert.equal(nodes[0].repoUrl, 'https://gitlab.com/x/y');
  assert.equal(nodes[0].projectPath, 'backend/api');
  assert.equal(backfilled, 3);
});

test('a fresh non-null value always wins over the previous one', () => {
  const previous = new Map([['n1', { id: 'n1', description: 'old desc' }]]);
  const { nodes, backfilled } = fillMissingNodeFields(
    [freshNode({ description: 'fresh desc' })],
    previous,
  );
  assert.equal(nodes[0].description, 'fresh desc');
  assert.equal(backfilled, 0);
});

test('fills data keys per-key, treating an empty technologies array as missing', () => {
  const previous = new Map([
    ['n1', { id: 'n1', data: { technologies: ['go', 'fiber'], port: 8080 } }],
  ]);
  const { nodes, backfilled } = fillMissingNodeFields([freshNode()], previous);
  assert.deepEqual(nodes[0].data, { technologies: ['go', 'fiber'], port: 8080 });
  assert.equal(backfilled, 2);
});

test('a fresh data value wins per-key while null keys are still filled', () => {
  const previous = new Map([
    ['n1', { id: 'n1', data: { engine: 'postgres', port: 5432 } }],
  ]);
  const fresh = freshNode({ type: 'database', data: { engine: 'mysql', port: null } });
  const { nodes, backfilled } = fillMissingNodeFields([fresh], previous);
  assert.deepEqual(nodes[0].data, { engine: 'mysql', port: 5432 });
  assert.equal(backfilled, 1);
});

test('merges links by url, appending previous links absent from the fresh list', () => {
  const previous = new Map([
    ['n1', { id: 'n1', links: [
      { name: 'Admin Panel', url: 'http://localhost:8081' },
      { name: 'Docs', url: 'https://docs.example.com' },
    ] }],
  ]);
  const fresh = freshNode({ links: [{ name: 'Admin Panel', url: 'http://localhost:8081' }] });
  const { nodes, backfilled } = fillMissingNodeFields([fresh], previous);
  assert.deepEqual(nodes[0].links, [
    { name: 'Admin Panel', url: 'http://localhost:8081' },
    { name: 'Docs', url: 'https://docs.example.com' },
  ]);
  assert.equal(backfilled, 1);
});

test('does not touch position or agentContext (owned by the persistent overlay)', () => {
  const previous = new Map([
    ['n1', { id: 'n1', position: { x: 99, y: 99 }, agentContext: 'old ctx' }],
  ]);
  const { nodes } = fillMissingNodeFields([freshNode()], previous);
  assert.deepEqual(nodes[0].position, { x: 0, y: 0 });
  assert.equal(nodes[0].agentContext, null);
});

test('nodes without a previous counterpart pass through untouched', () => {
  const previous = new Map([['other', { id: 'other', description: 'x' }]]);
  const input = [freshNode()];
  const { nodes, backfilled } = fillMissingNodeFields(input, previous);
  assert.deepEqual(nodes, input);
  assert.equal(backfilled, 0);
});

test('empty or absent previous map is a no-op', () => {
  const input = [freshNode()];
  assert.deepEqual(fillMissingNodeFields(input, new Map()), { nodes: input, backfilled: 0 });
  assert.deepEqual(fillMissingNodeFields(input, null), { nodes: input, backfilled: 0 });
});
