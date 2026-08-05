import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { buildGraph } from '../src/tools/buildGraph.js';
import { pushGraph } from '../src/tools/pushGraph.js';
import { nodeId } from '../src/transform/ids.js';

function seedSession({
  backend,
  withOverridePosition = null,
  withOverrideAgentContext = null,
  scanDir = '/abs/projects',
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qg-build-'));
  const projDir = join(dir, 'scan', 'projects', 'p1');
  mkdirSync(projDir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      session_id: 's',
      scan_dir: scanDir,
      backend,
      projects: [{ name: 'p1', path: join(scanDir, 'p1'), status: 'done' }],
    }),
  );
  writeFileSync(join(projDir, 'p1.md'), '---\nname: p1\nlanguage: go\n---\n\n# p1\n\nA project.\n');

  if (withOverridePosition || withOverrideAgentContext) {
    const id = nodeId(backend.graph_id, 'project', 'p1');
    const m = { id };
    if (withOverridePosition) m.position = withOverridePosition;
    if (withOverrideAgentContext) m.agentContext = withOverrideAgentContext;
    writeFileSync(join(projDir, 'manifest.json'), JSON.stringify(m));
  }
  return dir;
}

function readSnapshot(dir) {
  return JSON.parse(readFileSync(join(dir, 'graph', 'graph.json'), 'utf8'));
}

test('writes graph/graph.json with the graph id from manifest.backend', () => {
  const dir = seedSession({ backend: { project_id: 'proj-1', graph_id: 'graph-1' } });
  try {
    const res = buildGraph({ sessionDir: dir });
    assert.equal(res.graphId, 'graph-1');
    assert.equal(res.path, join(dir, 'graph', 'graph.json'));
    const snapshot = readSnapshot(dir);
    assert.equal(snapshot.id, 'graph-1');
    const projNode = snapshot.nodes.find((n) => n.type === 'project');
    assert.equal(projNode.id, nodeId('graph-1', 'project', 'p1'));
    assert.equal(res.nodes, snapshot.nodes.length);
    assert.equal(res.edges, snapshot.edges.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('overlays a per-folder manifest position onto the matching node', () => {
  const dir = seedSession({
    backend: { project_id: 'proj-1', graph_id: 'graph-1' },
    withOverridePosition: { x: 1234, y: 5678 },
  });
  try {
    buildGraph({ sessionDir: dir });
    const projNode = readSnapshot(dir).nodes.find((n) => n.type === 'project');
    assert.deepEqual(projNode.position, { x: 1234, y: 5678 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('overlays per-node agentContext into the snapshot', () => {
  const dir = seedSession({
    backend: { project_id: 'proj-1', graph_id: 'graph-1' },
    withOverrideAgentContext: 'When touching this service, always run the contract tests.',
  });
  try {
    buildGraph({ sessionDir: dir });
    const projNode = readSnapshot(dir).nodes.find((n) => n.type === 'project');
    assert.equal(projNode.agentContext, 'When touching this service, always run the contract tests.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preserves position and top-level agentContext from a pre-existing snapshot', () => {
  const dir = seedSession({ backend: { project_id: 'proj-1', graph_id: 'graph-1' } });
  try {
    const id = nodeId('graph-1', 'project', 'p1');
    mkdirSync(join(dir, 'graph'), { recursive: true });
    writeFileSync(
      join(dir, 'graph', 'graph.json'),
      JSON.stringify({
        id: 'graph-1',
        agentContext: 'Graph-wide: prefer pnpm over npm.',
        nodes: [{ id, name: 'p1', type: 'project', position: { x: 42, y: 43 } }],
      }),
    );
    buildGraph({ sessionDir: dir });
    const snapshot = readSnapshot(dir);
    assert.equal(snapshot.agentContext, 'Graph-wide: prefer pnpm over npm.');
    const projNode = snapshot.nodes.find((n) => n.type === 'project');
    assert.deepEqual(projNode.position, { x: 42, y: 43 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('is idempotent: a rebuild keeps overlaid positions via the rewritten snapshot', () => {
  const dir = seedSession({
    backend: { project_id: 'proj-1', graph_id: 'graph-1' },
    withOverridePosition: { x: 7, y: 8 },
  });
  try {
    buildGraph({ sessionDir: dir });
    rmSync(join(dir, 'scan', 'projects', 'p1', 'manifest.json'));
    buildGraph({ sessionDir: dir });
    const projNode = readSnapshot(dir).nodes.find((n) => n.type === 'project');
    assert.deepEqual(projNode.position, { x: 7, y: 8 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sets agentContext null when there is no prior snapshot', () => {
  const dir = seedSession({ backend: { project_id: 'proj-1', graph_id: 'graph-1' } });
  try {
    buildGraph({ sessionDir: dir });
    assert.equal(readSnapshot(dir).agentContext, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('emits scanPath relative to $HOME when the scan root is under home', () => {
  const scanDir = join(homedir(), 'Projects', 'acme');
  const dir = seedSession({ backend: { project_id: 'proj-1', graph_id: 'graph-1' }, scanDir });
  try {
    buildGraph({ sessionDir: dir });
    assert.equal(readSnapshot(dir).scanPath, 'Projects/acme');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('falls back to the absolute scanPath when the scan root is not under $HOME', () => {
  const dir = seedSession({ backend: { project_id: 'proj-1', graph_id: 'graph-1' }, scanDir: '/abs/projects' });
  try {
    buildGraph({ sessionDir: dir });
    assert.equal(readSnapshot(dir).scanPath, '/abs/projects');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('project node carries projectPath relative to the scan root', () => {
  const dir = seedSession({ backend: { project_id: 'proj-1', graph_id: 'graph-1' } });
  try {
    buildGraph({ sessionDir: dir });
    const projNode = readSnapshot(dir).nodes.find((n) => n.type === 'project');
    assert.equal(projNode.projectPath, 'p1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graph_id argument overrides manifest.backend.graph_id', () => {
  const dir = seedSession({ backend: { project_id: 'proj-1', graph_id: 'graph-1' } });
  try {
    buildGraph({ sessionDir: dir, graphId: 'graph-override' });
    const snapshot = readSnapshot(dir);
    assert.equal(snapshot.id, 'graph-override');
    const projNode = snapshot.nodes.find((n) => n.type === 'project');
    assert.equal(projNode.id, nodeId('graph-override', 'project', 'p1'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects when there is no graph_id anywhere', () => {
  const dir = seedSession({ backend: { project_id: 'proj-1' } });
  try {
    assert.throws(() => buildGraph({ sessionDir: dir }), /graph_id/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a resource admin_url becomes a link on the resource node in the snapshot', () => {
  const backend = { project_id: 'proj-1', graph_id: 'graph-1' };
  const dir = seedSession({ backend });
  try {
    const resDir = join(dir, 'scan', 'resources', 'mongo');
    mkdirSync(resDir, { recursive: true });
    writeFileSync(
      join(resDir, 'mongo.md'),
      '---\nname: mongo\nkind: database\ntype: mongodb\nadmin_url: http://localhost:8081\n---\n\n# mongo\n\nDB.\n',
    );
    buildGraph({ sessionDir: dir });
    const snapshot = readSnapshot(dir);
    assert.equal(snapshot.nodes.some((n) => n.type === 'admin_panel'), false);
    const mongoNode = snapshot.nodes.find((n) => n.id === nodeId(backend.graph_id, 'database', 'mongo'));
    assert.ok(mongoNode);
    assert.deepEqual(mongoNode.links, [{ name: 'Admin Panel', url: 'http://localhost:8081' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backfills data and links the fresh scan did not produce from the pre-existing snapshot', () => {
  const backend = { project_id: 'proj-1', graph_id: 'graph-1' };
  const dir = seedSession({ backend });
  try {
    const resDir = join(dir, 'scan', 'resources', 'mongo');
    mkdirSync(resDir, { recursive: true });
    writeFileSync(join(resDir, 'mongo.md'), '---\nname: mongo\nkind: database\ntype: mongodb\n---\n\n# mongo\n\nDB.\n');
    const id = nodeId('graph-1', 'database', 'mongo');
    mkdirSync(join(dir, 'graph'), { recursive: true });
    writeFileSync(
      join(dir, 'graph', 'graph.json'),
      JSON.stringify({
        id: 'graph-1',
        nodes: [{
          id,
          name: 'mongo',
          type: 'database',
          data: { engine: 'postgres', port: 27017 },
          links: [{ name: 'Admin Panel', url: 'http://localhost:8081' }],
        }],
      }),
    );
    const res = buildGraph({ sessionDir: dir });
    const mongoNode = readSnapshot(dir).nodes.find((n) => n.id === id);
    assert.equal(mongoNode.data.engine, 'mongodb');
    assert.equal(mongoNode.data.port, 27017);
    assert.deepEqual(mongoNode.links, [{ name: 'Admin Panel', url: 'http://localhost:8081' }]);
    assert.equal(res.backfilled, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports backfilled 0 when there is no prior snapshot', () => {
  const dir = seedSession({ backend: { project_id: 'proj-1', graph_id: 'graph-1' } });
  try {
    assert.equal(buildGraph({ sessionDir: dir }).backfilled, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a connection edge survives build_graph and push_graph with canonical ids', async () => {
  const backend = { project_id: 'proj-1', graph_id: 'graph-1' };
  const dir = seedSession({ backend });
  try {
    const p1Dir = join(dir, 'scan', 'projects', 'p1');
    writeFileSync(
      join(p1Dir, 'p1.md'),
      '---\nname: p1\nlanguage: go\nconnections:\n  - project: p2\n    via: rest_api\n---\n\n# p1\n\nA project.\n',
    );
    const p2Dir = join(dir, 'scan', 'projects', 'p2');
    mkdirSync(p2Dir, { recursive: true });
    writeFileSync(join(p2Dir, 'p2.md'), '---\nname: p2\nlanguage: go\n---\n\n# p2\n\nAnother project.\n');
    const manifestPath = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.projects.push({ name: 'p2', path: join(manifest.scan_dir, 'p2'), status: 'done' });
    writeFileSync(manifestPath, JSON.stringify(manifest));

    buildGraph({ sessionDir: dir });
    const snapshot = readSnapshot(dir);
    assert.equal(snapshot.edges.length, 1);

    const seen = {};
    const client = { scan: async (payload) => { seen.payload = payload; return { id: payload.graphId }; } };
    await pushGraph({ sessionDir: dir }, { client });
    assert.equal(seen.payload.edges.length, 1);
    const edge = seen.payload.edges[0];
    assert.equal(edge.sourceNodeId, nodeId('graph-1', 'project', 'p1'));
    assert.equal(edge.targetNodeId, nodeId('graph-1', 'project', 'p2'));
    assert.equal(edge.type, 'rest_api');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the built snapshot pushes through push_graph unchanged', async () => {
  const scanDir = join(homedir(), 'Projects', 'acme');
  const dir = seedSession({
    backend: { project_id: 'proj-1', graph_id: 'graph-1' },
    withOverridePosition: { x: 10, y: 20 },
    scanDir,
  });
  try {
    buildGraph({ sessionDir: dir });
    const seen = {};
    const client = { scan: async (payload) => { seen.payload = payload; return { id: payload.graphId }; } };
    const res = await pushGraph({ sessionDir: dir }, { client });
    assert.equal(res.graphId, 'graph-1');
    assert.equal(seen.payload.graphId, 'graph-1');
    assert.equal(seen.payload.scanPath, 'Projects/acme');
    const projNode = seen.payload.nodes.find((n) => n.type === 'project');
    assert.equal(projNode.id, nodeId('graph-1', 'project', 'p1'));
    assert.deepEqual(projNode.position, { x: 10, y: 20 });
    assert.equal(projNode.projectPath, 'p1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
