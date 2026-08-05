import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bindContext } from '../src/tools/bindContext.js';
import { LoginRequiredError } from '../src/auth/errors.js';

const BASE = '/tmp/projects';
const TARGET = join(BASE, 'backend/api');
const URL = 'https://github.com/org/api';

function freshHome() {
  return mkdtempSync(join(tmpdir(), 'quasar-bind-'));
}

function seedBindings(home, data) {
  const dir = join(home, '.quasar-graph', 'cache');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'bindings.json'), JSON.stringify(data));
}

function readBindings(home) {
  return JSON.parse(readFileSync(join(home, '.quasar-graph', 'cache', 'bindings.json'), 'utf8'));
}

function apiGraph() {
  return {
    id: 'g1',
    name: 'acme',
    nodes: [
      {
        id: 'n-api', type: 'service', name: 'api', description: 'REST API',
        repoUrl: URL, projectPath: 'backend/api', data: { port: 8080 },
      },
      {
        id: 'n-web', type: 'project', name: 'web', description: 'frontend',
        repoUrl: 'https://github.com/org/web', projectPath: 'frontend/web',
      },
      {
        id: 'n-lib', type: 'project', name: 'lib', description: 'sdk',
        repoUrl: null, projectPath: null,
      },
      { id: 'n-redis', type: 'cache', name: 'redis', data: { engine: 'redis' }, links: [] },
    ],
    edges: [
      { sourceNodeId: 'n-web', targetNodeId: 'n-api', type: 'rest_api' },
      { sourceNodeId: 'n-api', targetNodeId: 'n-redis', type: 'cache' },
      { sourceNodeId: 'n-api', targetNodeId: 'n-lib', type: 'client_of' },
    ],
  };
}

function trackingClient({ projects = [], graphsByProject = {}, graphsById = {} }) {
  const calls = { listProjects: 0, listGraphs: 0, getGraph: 0 };
  return {
    calls,
    listProjects: async () => { calls.listProjects += 1; return projects; },
    listGraphs: async (pid) => { calls.listGraphs += 1; return graphsByProject[pid] ?? []; },
    getGraph: async (id) => {
      calls.getGraph += 1;
      const g = graphsById[id];
      if (!g) throw new Error(`Backend GET /api/v1/graphs/${id} failed: 404`);
      return g;
    },
  };
}

test('requires an absolute target_dir and base_dir', async () => {
  const client = trackingClient({});
  await assert.rejects(
    () => bindContext({ remoteUrl: URL, targetDir: 'rel/path', baseDir: BASE }, { client, home: freshHome() }),
    /target_dir/,
  );
  await assert.rejects(
    () => bindContext({ remoteUrl: URL, targetDir: TARGET, baseDir: 'rel' }, { client, home: freshHome() }),
    /base_dir/,
  );
});

test('cache hit: binds from a valid entry without listing projects', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [{ node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' }],
  });
  const client = trackingClient({ graphsById: { g1: apiGraph() } });
  const res = await bindContext(
    { remoteUrl: 'git@github.com:org/api.git', targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.resolved_via, 'cache');
  assert.equal(res.node.name, 'api');
  assert.equal(res.graph.project_id, 'p1');
  assert.equal(client.calls.listProjects, 0);
  assert.equal(client.calls.getGraph, 1);
});

test('cache entry matching an ancestor directory binds a monorepo subdirectory', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [{ node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' }],
  });
  const client = trackingClient({ graphsById: { g1: apiGraph() } });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: join(TARGET, 'src/deep'), baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
});

test('entry without project_path matches only when it is the sole entry', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [
      { node_name: 'api', project_id: 'p1', graph_id: 'g1' },
      { node_name: 'other', project_path: 'elsewhere', project_id: 'p1', graph_id: 'g1' },
    ],
  });
  const client = trackingClient({
    projects: [{ id: 'p1', name: 'acme' }],
    graphsByProject: { p1: [{ id: 'g1', name: 'acme' }] },
    graphsById: { g1: apiGraph() },
  });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.resolved_via, 'search');
});

test('cache validation rethrows LoginRequiredError without dropping the entry', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [{ node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' }],
  });
  const client = {
    listProjects: async () => [],
    listGraphs: async () => [],
    getGraph: async () => { throw new LoginRequiredError(); },
  };
  await assert.rejects(
    () => bindContext({ remoteUrl: URL, targetDir: TARGET, baseDir: BASE }, { client, home, inspect: () => false }),
    LoginRequiredError,
  );
  const onDisk = readBindings(home);
  assert.equal(onDisk[URL].some((e) => e.node_name === 'api'), true);
});

test('stale cache entry is removed and search takes over', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [{ node_name: 'gone', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' }],
  });
  const client = trackingClient({
    projects: [{ id: 'p1', name: 'acme' }],
    graphsByProject: { p1: [{ id: 'g1', name: 'acme' }] },
    graphsById: { g1: apiGraph() },
  });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.resolved_via, 'search');
  assert.equal(res.stale_entries_removed, 1);
  const onDisk = readBindings(home);
  assert.equal(onDisk[URL].some((e) => e.node_name === 'gone'), false);
  assert.equal(onDisk[URL].some((e) => e.node_name === 'api'), true);
});

test('search: single candidate binds and writes the cache entry', async () => {
  const home = freshHome();
  const client = trackingClient({
    projects: [{ id: 'p1', name: 'acme' }],
    graphsByProject: { p1: [{ id: 'g1', name: 'acme' }] },
    graphsById: { g1: apiGraph() },
  });
  const res = await bindContext(
    { remoteUrl: 'git@github.com:org/api.git', targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.resolved_via, 'search');
  assert.deepEqual(readBindings(home)[URL], [
    { node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' },
  ]);
});

test('search: multiple candidates disambiguated by projectPath', async () => {
  const home = freshHome();
  const monorepo = apiGraph();
  monorepo.nodes.push({
    id: 'n-worker', type: 'service', name: 'worker', description: 'jobs',
    repoUrl: URL, projectPath: 'backend/worker',
  });
  const client = trackingClient({
    projects: [{ id: 'p1', name: 'acme' }],
    graphsByProject: { p1: [{ id: 'g1', name: 'acme' }] },
    graphsById: { g1: monorepo },
  });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.node.name, 'api');
});

test('search: still-ambiguous candidates are returned for user choice', async () => {
  const home = freshHome();
  const g2 = apiGraph();
  g2.id = 'g2';
  g2.name = 'acme-staging';
  const client = trackingClient({
    projects: [{ id: 'p1', name: 'acme' }],
    graphsByProject: { p1: [{ id: 'g1', name: 'acme' }, { id: 'g2', name: 'acme-staging' }] },
    graphsById: { g1: apiGraph(), g2 },
  });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'ambiguous');
  assert.equal(res.candidates.length, 2);
  assert.deepEqual(
    res.candidates.map((c) => c.graph_id).sort(),
    ['g1', 'g2'],
  );
  assert.equal(res.candidates[0].node_name, 'api');
});

test('choice binds the chosen candidate and replaces matched cache entries', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [
      { node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' },
      { node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g2' },
    ],
  });
  const g2 = apiGraph();
  g2.id = 'g2';
  g2.name = 'acme-staging';
  const client = trackingClient({ graphsById: { g1: apiGraph(), g2 } });
  const res = await bindContext(
    {
      remoteUrl: URL, targetDir: TARGET, baseDir: BASE,
      choice: { graph_id: 'g2', node_name: 'api', project_id: 'p1' },
    },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.resolved_via, 'choice');
  assert.equal(res.graph.graph_id, 'g2');
  assert.deepEqual(readBindings(home)[URL], [
    { node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g2' },
  ]);
});

test('not_found when no graph has a node with this repoUrl', async () => {
  const client = trackingClient({
    projects: [{ id: 'p1', name: 'acme' }],
    graphsByProject: { p1: [{ id: 'g1', name: 'acme' }] },
    graphsById: { g1: apiGraph() },
  });
  const res = await bindContext(
    { remoteUrl: 'https://github.com/org/unknown', targetDir: TARGET, baseDir: BASE },
    { client, home: freshHome(), inspect: () => false },
  );
  assert.equal(res.status, 'not_found');
  assert.equal(res.normalized_url, 'https://github.com/org/unknown');
});

test('sole pathless cache entry binds via cache', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [{ node_name: 'api', project_id: 'p1', graph_id: 'g1' }],
  });
  const client = trackingClient({ graphsById: { g1: apiGraph() } });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.resolved_via, 'cache');
  assert.equal(client.calls.listProjects, 0);
});

test('neighbor with a missing local checkout is reported as cloneable', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [{ node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' }],
  });
  const client = trackingClient({ graphsById: { g1: apiGraph() } });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: () => false },
  );
  const web = res.neighbors.find((n) => n.name === 'web');
  assert.equal(web.availability, 'cloneable');
  assert.equal(web.repoUrl, 'https://github.com/org/web');
});

test('choice referencing a node that no longer exists in the graph rejects', async () => {
  const home = freshHome();
  const client = trackingClient({ graphsById: { g1: apiGraph() } });
  await assert.rejects(
    () => bindContext(
      {
        remoteUrl: URL, targetDir: TARGET, baseDir: BASE,
        choice: { graph_id: 'g1', node_name: 'ghost', project_id: 'p1' },
      },
      { client, home, inspect: () => false },
    ),
    /not found in graph/,
  );
});

test('search: a failing graph fetch is skipped, other graphs still yield a match', async () => {
  const home = freshHome();
  const client = trackingClient({
    projects: [{ id: 'p1', name: 'acme' }],
    graphsByProject: { p1: [{ id: 'g1', name: 'acme' }, { id: 'g2', name: 'broken' }] },
    graphsById: { g1: apiGraph() },
  });
  client.getGraph = async (id) => {
    client.calls.getGraph += 1;
    if (id === 'g2') throw new Error('backend 500');
    return apiGraph();
  };
  const res = await bindContext(
    { remoteUrl: URL, targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.resolved_via, 'search');
  assert.equal(res.graph.graph_id, 'g1');
});

function typedGraph() {
  return {
    id: 'g1',
    name: 'acme',
    nodes: [
      {
        id: 'n-admin', type: 'admin_panel', name: 'admin-panel-client', description: 'back office',
        repoUrl: URL, projectPath: 'frontend/admin',
      },
      {
        id: 'n-rest', type: 'rest_api', name: 'acme-api', description: 'core API',
        repoUrl: 'https://github.com/org/acme-api', projectPath: 'backend/acme-api',
      },
      { id: 'n-mon', type: 'monitoring', name: 'grafana', data: {}, links: [] },
    ],
    edges: [
      { sourceNodeId: 'n-admin', targetNodeId: 'n-rest', type: 'rest_api' },
      { sourceNodeId: 'n-admin', targetNodeId: 'n-mon', type: 'other' },
    ],
  };
}

test('search matches a code node by repoUrl regardless of its type', async () => {
  const home = freshHome();
  const client = trackingClient({
    projects: [{ id: 'p1', name: 'acme' }],
    graphsByProject: { p1: [{ id: 'g1', name: 'acme' }] },
    graphsById: { g1: typedGraph() },
  });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: join(BASE, 'frontend/admin'), baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.node.name, 'admin-panel-client');
  assert.equal(res.node.type, 'admin_panel');
});

test('choice resolves a code node whose type is outside project/service', async () => {
  const home = freshHome();
  const client = trackingClient({ graphsById: { g1: typedGraph() } });
  const res = await bindContext(
    {
      remoteUrl: URL, targetDir: join(BASE, 'frontend/admin'), baseDir: BASE,
      choice: { graph_id: 'g1', node_name: 'admin-panel-client', project_id: 'p1' },
    },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.resolved_via, 'choice');
  assert.equal(res.node.name, 'admin-panel-client');
});

test('cache entry pointing at a non-project/service code node stays valid', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [{ node_name: 'admin-panel-client', project_path: 'frontend/admin', project_id: 'p1', graph_id: 'g1' }],
  });
  const client = trackingClient({ graphsById: { g1: typedGraph() } });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: join(BASE, 'frontend/admin'), baseDir: BASE },
    { client, home, inspect: () => false },
  );
  assert.equal(res.status, 'bound');
  assert.equal(res.resolved_via, 'cache');
  assert.equal(res.stale_entries_removed, 0);
  assert.equal(client.calls.listProjects, 0);
});

test('neighbor with a repoUrl but a custom type is cloneable, not a resource', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [{ node_name: 'admin-panel-client', project_path: 'frontend/admin', project_id: 'p1', graph_id: 'g1' }],
  });
  const client = trackingClient({ graphsById: { g1: typedGraph() } });
  const res = await bindContext(
    { remoteUrl: URL, targetDir: join(BASE, 'frontend/admin'), baseDir: BASE },
    { client, home, inspect: () => false },
  );
  const byName = Object.fromEntries(res.neighbors.map((n) => [n.name, n]));
  assert.equal(byName['acme-api'].availability, 'cloneable');
  assert.equal(byName['acme-api'].repoUrl, 'https://github.com/org/acme-api');
  assert.equal(byName.grafana.availability, 'resource');
});

test('search: a LoginRequiredError from any graph fetch rejects the whole call', async () => {
  const home = freshHome();
  const client = trackingClient({
    projects: [{ id: 'p1', name: 'acme' }],
    graphsByProject: { p1: [{ id: 'g1', name: 'acme' }] },
    graphsById: {},
  });
  client.getGraph = async () => { throw new LoginRequiredError(); };
  await assert.rejects(
    () => bindContext(
      { remoteUrl: URL, targetDir: TARGET, baseDir: BASE },
      { client, home, inspect: () => false },
    ),
    LoginRequiredError,
  );
});

test('bound response splits edges and classifies neighbors', async () => {
  const home = freshHome();
  seedBindings(home, {
    [URL]: [{ node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' }],
  });
  const client = trackingClient({ graphsById: { g1: apiGraph() } });
  const webPath = join(BASE, 'frontend/web');
  const res = await bindContext(
    { remoteUrl: URL, targetDir: TARGET, baseDir: BASE },
    { client, home, inspect: (p) => p === webPath },
  );
  assert.deepEqual(res.edges.inbound, [{ type: 'rest_api', from: { name: 'web', type: 'project' } }]);
  assert.deepEqual(
    res.edges.outbound.map((e) => e.to.name).sort(),
    ['lib', 'redis'],
  );
  const byName = Object.fromEntries(res.neighbors.map((n) => [n.name, n]));
  assert.equal(byName.web.availability, 'local');
  assert.equal(byName.web.local_path, webPath);
  assert.equal(byName.lib.availability, 'unavailable');
  assert.equal(byName.redis.availability, 'resource');
});
