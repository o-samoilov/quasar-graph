import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScanPayload, edgeAnchors } from '../src/transform/payload.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EDGE_POSITIONS = ['left', 'right', 'top', 'bottom'];

const session = {
  scanDir: '/abs/projects',
  projects: [
    { name: 'acme-backend', language: 'typescript', framework: 'nestjs', description: 'API.', connections: [] },
  ],
  resources: [
    { slug: 'mongodb-acme', kind: 'database', type: 'mongodb', port: 27017, engine: 'mongodb', host: null, adminUrl: 'http://localhost:8081', description: 'DB.', consumers: [{ project: 'acme-backend', env: 'MONGODB_URL' }] },
  ],
};

test('payload carries graphId and nodes with uuid ids, positions, flat data', () => {
  const p = buildScanPayload({ graphId: 'g-1', session });
  assert.equal(p.graphId, 'g-1');
  const be = p.nodes.find((n) => n.name === 'acme-backend');
  assert.match(be.id, UUID);
  assert.ok(be.position && typeof be.position.x === 'number');
  assert.deepEqual(be.data, { technologies: ['typescript', 'nestjs'] });
  assert.ok(!('key' in be));
});

test('nodes carry repoUrl/projectPath/agentContext keys, defaulting to null', () => {
  const p = buildScanPayload({ graphId: 'g-1', session });
  const be = p.nodes.find((n) => n.name === 'acme-backend');
  assert.equal(be.repoUrl, null);
  assert.equal(be.projectPath, null);
  assert.equal(be.agentContext, null);
});

test('project node payload carries projectPath (relative to scanPath) and repoUrl when present in the session', () => {
  const withMeta = {
    scanDir: '/abs/projects',
    projects: [
      { name: 'svc', language: 'go', framework: null, description: 'S.', projectPath: '/abs/projects/svc', repoUrl: 'https://github.com/org/svc', connections: [] },
    ],
    resources: [],
  };
  const p = buildScanPayload({ graphId: 'g-1', session: withMeta });
  const svc = p.nodes.find((n) => n.name === 'svc');
  assert.equal(svc.projectPath, 'svc');
  assert.equal(svc.repoUrl, 'https://github.com/org/svc');
});

test('node ids are deterministic per graph/type/name, and differ across graphs', () => {
  const a = buildScanPayload({ graphId: 'g-1', session });
  const b = buildScanPayload({ graphId: 'g-1', session });
  const c = buildScanPayload({ graphId: 'g-2', session });
  const idOf = (p) => p.nodes.find((n) => n.name === 'acme-backend').id;
  assert.equal(idOf(a), idOf(b));
  assert.notEqual(idOf(a), idOf(c));
});

test('edges reference node uuids with positions and no dangling/self-loop', () => {
  const p = buildScanPayload({ graphId: 'g-1', session });
  const ids = new Set(p.nodes.map((n) => n.id));
  for (const e of p.edges) {
    assert.match(e.id, UUID);
    assert.ok(ids.has(e.sourceNodeId));
    assert.ok(ids.has(e.targetNodeId));
    assert.notEqual(e.sourceNodeId, e.targetNodeId);
    assert.ok(EDGE_POSITIONS.includes(e.sourcePosition));
    assert.ok(EDGE_POSITIONS.includes(e.targetPosition));
  }
  const proj = p.nodes.find((n) => n.name === 'acme-backend');
  const db = p.nodes.find((n) => n.name === 'mongodb-acme');
  assert.ok(p.edges.some((e) => e.sourceNodeId === proj.id && e.targetNodeId === db.id));
});

test('monitoring resources are included in the graph like any other resource', () => {
  const s = {
    scanDir: '/abs',
    projects: [],
    resources: [
      { slug: 'grafana', kind: 'monitoring', type: 'grafana', host: 'grafana', adminUrl: null, links: [], description: 'M.', consumers: [] },
      { slug: 'mongo', kind: 'database', type: 'mongodb', host: 'mongo', adminUrl: null, links: [], description: 'DB.', consumers: [] },
    ],
  };
  const p = buildScanPayload({ graphId: 'g-1', session: s });
  assert.ok(p.nodes.some((n) => n.name === 'grafana'));
  assert.ok(p.nodes.some((n) => n.name === 'mongo'));
});

test('edgeAnchors: target to the right exits right, enters left', () => {
  assert.deepEqual(edgeAnchors({ x: 0, y: 0 }, { x: 320, y: 0 }), { sourcePosition: 'right', targetPosition: 'left' });
});

test('edgeAnchors: target to the left exits left, enters right', () => {
  assert.deepEqual(edgeAnchors({ x: 640, y: 0 }, { x: 0, y: 0 }), { sourcePosition: 'left', targetPosition: 'right' });
});

test('edgeAnchors: target below (vertical dominant) exits bottom, enters top', () => {
  assert.deepEqual(edgeAnchors({ x: 640, y: 0 }, { x: 640, y: 140 }), { sourcePosition: 'bottom', targetPosition: 'top' });
});

test('edgeAnchors: target above (vertical dominant) exits top, enters bottom', () => {
  assert.deepEqual(edgeAnchors({ x: 640, y: 280 }, { x: 640, y: 0 }), { sourcePosition: 'top', targetPosition: 'bottom' });
});

test('payload edge anchors follow the laid-out node positions', () => {
  const s = {
    scanDir: '/abs',
    projects: [{ name: 'client', role: 'client', language: 'ts', framework: null, description: 'UI.', connections: [] }],
    resources: [
      { slug: 'traefik', kind: 'gateway', type: 'traefik', host: 'traefik', adminUrl: null, links: [], description: 'GW.', consumers: [], routes: [{ to: 'client' }] },
    ],
  };
  const p = buildScanPayload({ graphId: 'g-1', session: s });
  const client = p.nodes.find((n) => n.name === 'client');
  const traefik = p.nodes.find((n) => n.name === 'traefik');
  const e = p.edges.find((edge) => edge.sourceNodeId === traefik.id && edge.targetNodeId === client.id);
  assert.ok(client.position.x > traefik.position.x);
  assert.equal(e.sourcePosition, 'right');
  assert.equal(e.targetPosition, 'left');
});

test('a gateway route pointing at a monitoring node yields an edge', () => {
  const s = {
    scanDir: '/abs',
    projects: [],
    resources: [
      { slug: 'traefik', kind: 'gateway', type: 'traefik', host: 'traefik', adminUrl: null, links: [], description: 'GW.', consumers: [], routes: [{ to: 'grafana' }] },
      { slug: 'grafana', kind: 'monitoring', type: 'grafana', host: 'grafana', adminUrl: null, links: [], description: 'M.', consumers: [] },
    ],
  };
  const p = buildScanPayload({ graphId: 'g-1', session: s });
  const traefik = p.nodes.find((n) => n.name === 'traefik');
  const grafana = p.nodes.find((n) => n.name === 'grafana');
  assert.ok(grafana);
  assert.ok(p.edges.some((e) => e.sourceNodeId === traefik.id && e.targetNodeId === grafana.id));
});
