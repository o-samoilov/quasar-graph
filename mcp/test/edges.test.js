import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEdges } from '../src/transform/edges.js';

const session = {
  projects: [
    { name: 'acme-backend', connections: [{ project: 'acme-web', via: 'rest_api' }, { project: 'ghost', via: 'rest_api' }] },
    { name: 'acme-web', connections: [] },
  ],
  resources: [
    { slug: 'mongodb-acme', kind: 'database', adminUrl: 'http://x', consumers: [{ project: 'acme-backend', env: 'MONGODB_URL' }] },
  ],
};

const nodeKeys = new Set([
  'project:acme-backend',
  'project:acme-web',
  'database:mongodb-acme',
]);

test('connection edge is created between existing project nodes', () => {
  const edges = buildEdges(session, nodeKeys);
  assert.ok(edges.some((e) => e.source === 'project:acme-backend' && e.target === 'project:acme-web' && e.type === 'rest_api'));
});

test('connection to a missing project is dropped (no dangling edge)', () => {
  const edges = buildEdges(session, nodeKeys);
  assert.ok(!edges.some((e) => e.target === 'project:ghost'));
});

test('consumer edge links project to resource with kind as label', () => {
  const edges = buildEdges(session, nodeKeys);
  assert.ok(edges.some((e) => e.source === 'project:acme-backend' && e.target === 'database:mongodb-acme' && e.type === 'database'));
});

test('a resource adminUrl produces no edge (it is a node link, not a relationship)', () => {
  const edges = buildEdges(session, nodeKeys);
  assert.equal(edges.some((e) => e.type === 'manages'), false);
});

test('exact duplicate edges are deduped (same source/target/type appears once)', () => {
  const dupSession = {
    projects: [
      { name: 'a', connections: [{ project: 'b', via: 'rest_api' }, { project: 'b', via: 'rest_api' }] },
      { name: 'b', connections: [] },
    ],
    resources: [
      { slug: 'db', kind: 'database', consumers: [{ project: 'a', role: 'primary' }, { project: 'a', role: 'primary' }] },
    ],
  };
  const keys = new Set(['project:a', 'project:b', 'database:db']);
  const edges = buildEdges(dupSession, keys);

  const connEdges = edges.filter((e) => e.source === 'project:a' && e.target === 'project:b' && e.type === 'rest_api');
  assert.equal(connEdges.length, 1);

  const consumerEdges = edges.filter((e) => e.source === 'project:a' && e.target === 'database:db' && e.type === 'primary');
  assert.equal(consumerEdges.length, 1);
});

test('a service project wires edges under its service key, not project', () => {
  const svcSession = {
    projects: [
      { name: 'acme-web', role: 'client', connections: [{ project: 'api', via: 'rest_api' }] },
      { name: 'api', role: 'service', connections: [] },
    ],
    resources: [
      { slug: 'mongo', kind: 'database', consumers: [{ project: 'api', role: 'primary' }] },
    ],
  };
  const keys = new Set(['project:acme-web', 'service:api', 'database:mongo']);
  const edges = buildEdges(svcSession, keys);
  assert.ok(edges.some((e) => e.source === 'project:acme-web' && e.target === 'service:api' && e.type === 'rest_api'));
  assert.ok(edges.some((e) => e.source === 'service:api' && e.target === 'database:mongo' && e.type === 'primary'));
  assert.ok(!edges.some((e) => e.target === 'project:api' || e.source === 'project:api'));
});

test('gateway routes[] put the gateway in the traffic path (resource→resource and resource→service)', () => {
  const gw = {
    projects: [
      { name: 'client', role: 'client', connections: [] },
      { name: 'api', role: 'service', connections: [] },
    ],
    resources: [
      {
        slug: 'traefik',
        kind: 'gateway',
        consumers: [{ project: 'client', role: 'rest_api' }],
        routes: [{ to: 'nginx' }, { to: 'centrifugo' }],
      },
      { slug: 'nginx', kind: 'gateway', routes: [{ to: 'api' }] },
      { slug: 'centrifugo', kind: 'realtime', consumers: [] },
    ],
  };
  const keys = new Set([
    'project:client',
    'service:api',
    'gateway:traefik',
    'gateway:nginx',
    'realtime:centrifugo',
  ]);
  const edges = buildEdges(gw, keys);
  assert.ok(edges.some((e) => e.source === 'project:client' && e.target === 'gateway:traefik' && e.type === 'rest_api'));
  assert.ok(edges.some((e) => e.source === 'gateway:traefik' && e.target === 'gateway:nginx' && e.type === 'routes'));
  assert.ok(edges.some((e) => e.source === 'gateway:nginx' && e.target === 'service:api' && e.type === 'routes'));
  assert.ok(edges.some((e) => e.source === 'gateway:traefik' && e.target === 'realtime:centrifugo' && e.type === 'routes'));
  assert.ok(!edges.some((e) => e.source === 'project:client' && e.target === 'service:api'));
});

test('a route to a missing target node is dropped (no dangling edge)', () => {
  const gw = {
    projects: [],
    resources: [{ slug: 'traefik', kind: 'gateway', routes: [{ to: 'ghost' }] }],
  };
  const keys = new Set(['gateway:traefik']);
  const edges = buildEdges(gw, keys);
  assert.equal(edges.length, 0);
});

test('a route entry can override the edge type', () => {
  const gw = {
    projects: [{ name: 'api', role: 'service', connections: [] }],
    resources: [{ slug: 'nginx', kind: 'gateway', routes: [{ to: 'api', type: 'proxies' }] }],
  };
  const keys = new Set(['service:api', 'gateway:nginx']);
  const edges = buildEdges(gw, keys);
  assert.ok(edges.some((e) => e.source === 'gateway:nginx' && e.target === 'service:api' && e.type === 'proxies'));
});

test('edges that differ only by type are both kept', () => {
  const multiRole = {
    projects: [],
    resources: [
      { slug: 'mongo', kind: 'database', consumers: [{ project: 'a', role: 'primary' }, { project: 'a', role: 'lock-store' }] },
    ],
  };
  const keys = new Set(['project:a', 'database:mongo']);
  const edges = buildEdges(multiRole, keys);
  assert.ok(edges.some((e) => e.type === 'primary'));
  assert.ok(edges.some((e) => e.type === 'lock-store'));
  assert.equal(edges.length, 2);
});
