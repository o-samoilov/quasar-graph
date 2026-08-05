import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPushPayload } from '../src/transform/pushPayload.js';
import { nodeId, edgeId } from '../src/transform/ids.js';

const GRAPH_ID = '019f6fc6-4a07-7264-b1fb-e15e968a7a65';

function snapshot(overrides = {}) {
  return {
    id: GRAPH_ID,
    scanPath: 'Projects/acme',
    agentContext: 'graph-level notes',
    nodes: [
      {
        id: 'old-api',
        name: 'api',
        type: 'service',
        description: 'the api',
        repoUrl: 'https://gitlab.com/acme/api',
        projectPath: 'backend/api',
        agentContext: 'per-node notes',
        position: { x: 100, y: 0 },
        data: { port: 8080 },
        links: [{ name: 'Admin Panel', url: 'https://admin.acme.dev' }],
      },
      {
        id: 'old-db',
        name: 'mongo',
        type: 'database',
        position: { x: 0, y: 0 },
      },
    ],
    edges: [{ id: 'old-edge', sourceNodeId: 'old-api', targetNodeId: 'old-db', type: 'uses' }],
    ...overrides,
  };
}

test('recomputes node ids as UUIDv5 over (graphId, type, name)', () => {
  const payload = buildPushPayload(snapshot());
  assert.equal(payload.graphId, GRAPH_ID);
  assert.equal(payload.nodes[0].id, nodeId(GRAPH_ID, 'service', 'api'));
  assert.equal(payload.nodes[1].id, nodeId(GRAPH_ID, 'database', 'mongo'));
});

test('rewires edges from in-file ids to recomputed ids and recomputes edge ids', () => {
  const payload = buildPushPayload(snapshot());
  const source = nodeId(GRAPH_ID, 'service', 'api');
  const target = nodeId(GRAPH_ID, 'database', 'mongo');
  assert.equal(payload.edges.length, 1);
  assert.deepEqual(
    { source: payload.edges[0].sourceNodeId, target: payload.edges[0].targetNodeId },
    { source, target },
  );
  assert.equal(payload.edges[0].id, edgeId(GRAPH_ID, source, target, 'uses'));
});

test('a placeholder id on a hand-added node works in edges', () => {
  const s = snapshot();
  s.nodes.push({ id: 'tmp-1', name: 'redis', type: 'cache', position: { x: 50, y: 50 } });
  s.edges.push({ sourceNodeId: 'old-api', targetNodeId: 'tmp-1', type: 'uses' });
  const payload = buildPushPayload(s);
  const added = payload.edges.find((e) => e.targetNodeId === nodeId(GRAPH_ID, 'cache', 'redis'));
  assert.ok(added);
  assert.equal(added.sourceNodeId, nodeId(GRAPH_ID, 'service', 'api'));
});

test('renaming a node keeps its position, agentContext and links on the new id', () => {
  const s = snapshot();
  s.nodes[0].name = 'api-v2';
  const payload = buildPushPayload(s);
  const renamed = payload.nodes.find((n) => n.name === 'api-v2');
  assert.equal(renamed.id, nodeId(GRAPH_ID, 'service', 'api-v2'));
  assert.deepEqual(renamed.position, { x: 100, y: 0 });
  assert.equal(renamed.agentContext, 'per-node notes');
  assert.deepEqual(renamed.links, [{ name: 'Admin Panel', url: 'https://admin.acme.dev' }]);
});

test('recomputes anchors from current positions', () => {
  const payload = buildPushPayload(snapshot());
  assert.equal(payload.edges[0].sourcePosition, 'left');
  assert.equal(payload.edges[0].targetPosition, 'right');
});

test('defaults a missing position to the origin', () => {
  const s = snapshot();
  s.nodes.push({ id: 'tmp-1', name: 'redis', type: 'cache' });
  const payload = buildPushPayload(s);
  assert.deepEqual(payload.nodes.find((n) => n.name === 'redis').position, { x: 0, y: 0 });
});

test('normalizes optional node fields and carries graph-level fields', () => {
  const payload = buildPushPayload(snapshot());
  const db = payload.nodes.find((n) => n.name === 'mongo');
  assert.deepEqual(
    { description: db.description, repoUrl: db.repoUrl, projectPath: db.projectPath, agentContext: db.agentContext, data: db.data, links: db.links },
    { description: null, repoUrl: null, projectPath: null, agentContext: null, data: null, links: [] },
  );
  assert.equal(payload.agentContext, 'graph-level notes');
  assert.equal(payload.scanPath, 'Projects/acme');
});

test('dedupes edges that collapse to one id after remap', () => {
  const s = snapshot();
  s.edges.push({ id: 'old-edge-dup', sourceNodeId: 'old-api', targetNodeId: 'old-db', type: 'uses' });
  const payload = buildPushPayload(s);
  assert.equal(payload.edges.length, 1);
});

test('collects all validation errors and uploads nothing', () => {
  const s = snapshot();
  s.nodes.push({ id: 'bad', name: '', type: '' });
  s.nodes.push({ id: 'dup', name: 'api', type: 'service' });
  s.edges.push({ sourceNodeId: 'ghost', targetNodeId: 'old-db', type: 'uses' });
  s.edges.push({ sourceNodeId: 'old-api', targetNodeId: 'old-api', type: 'uses' });
  assert.throws(
    () => buildPushPayload(s),
    (err) => {
      assert.match(err.message, /graph\.json is not uploadable/);
      assert.match(err.message, /name is empty/);
      assert.match(err.message, /type is empty/);
      assert.match(err.message, /share \(type, name\)/);
      assert.match(err.message, /matches no node/);
      assert.match(err.message, /self-loop/);
      return true;
    },
  );
});

test('rejects a snapshot without a graph id', () => {
  assert.throws(() => buildPushPayload({ nodes: [], edges: [] }), /graph id/);
});

test('rejects two nodes sharing an in-file id', () => {
  const s = snapshot();
  s.nodes.push({ id: 'old-api', name: 'other', type: 'service', position: { x: 0, y: 0 } });
  s.edges.push({ sourceNodeId: 'old-api', targetNodeId: 'old-db', type: 'uses' });
  assert.throws(() => buildPushPayload(s), /share in-file id/);
});

test('trims name/type before computing the id and in the output node', () => {
  const s = snapshot();
  s.nodes[0].name = ' api ';
  s.nodes[0].type = ' service ';
  const payload = buildPushPayload(s);
  const node = payload.nodes.find((n) => n.name === 'api');
  assert.equal(node.id, nodeId(GRAPH_ID, 'service', 'api'));
  assert.equal(node.name, 'api');
  assert.equal(node.type, 'service');
});

test('rejects a snapshot whose nodes is missing or not an array', () => {
  assert.throws(() => buildPushPayload({ id: GRAPH_ID, nodes: null, edges: [] }), /nodes array/);
});
