import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeNodeManifests } from '../src/tools/writeNodeManifests.js';
import { nodeId } from '../src/transform/ids.js';

const PROJECT_ID = 'proj-1';
const GRAPH_ID = 'g-1';

function seed({ snapshotNodes = null, projectRole = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qg-mat-'));
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      session_id: 's',
      scan_dir: '/abs/projects',
      backend: { project_id: PROJECT_ID, graph_id: 'g-1' },
      projects: [{ name: 'p1', path: '/abs/projects/p1', status: 'done' }],
    }),
  );
  const projDir = join(dir, 'scan', 'projects', 'p1');
  mkdirSync(projDir, { recursive: true });
  const roleLine = projectRole ? `role: ${projectRole}\n` : '';
  writeFileSync(join(projDir, 'p1.md'), `---\nname: p1\nlanguage: go\n${roleLine}---\n\n# p1\n\nA project.\n`);

  const resDir = join(dir, 'scan', 'resources', 'mongo');
  mkdirSync(resDir, { recursive: true });
  writeFileSync(
    join(resDir, 'mongo.md'),
    '---\nname: mongo\nkind: database\ntype: mongodb\nadmin_url: http://localhost:8081\n---\n\n# mongo\n\nDB.\n',
  );

  const tpDir = join(dir, 'scan', 'third-party', 'stripe');
  mkdirSync(tpDir, { recursive: true });
  writeFileSync(
    join(tpDir, 'stripe.md'),
    '---\nname: stripe\nkind: external_service\ntype: stripe\n---\n\n# stripe\n\nPayments.\n',
  );

  if (snapshotNodes) {
    mkdirSync(join(dir, 'graph'), { recursive: true });
    writeFileSync(join(dir, 'graph', 'graph.json'), JSON.stringify({ id: 'g-1', nodes: snapshotNodes }));
  }
  return dir;
}

test('writes id + snapshot position for an existing project node', () => {
  const projId = nodeId(GRAPH_ID, 'project', 'p1');
  const dir = seed({ snapshotNodes: [{ id: projId, position: { x: 10, y: 20 } }] });
  try {
    const res = writeNodeManifests({ sessionDir: dir });
    assert.equal(res.written, 3);
    const m = JSON.parse(readFileSync(join(dir, 'scan', 'projects', 'p1', 'manifest.json'), 'utf8'));
    assert.deepEqual(m, { id: projId, position: { x: 10, y: 20 } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('omits position for a node absent from the snapshot', () => {
  const dir = seed({ snapshotNodes: [] });
  try {
    writeNodeManifests({ sessionDir: dir });
    const m = JSON.parse(readFileSync(join(dir, 'scan', 'resources', 'mongo', 'manifest.json'), 'utf8'));
    assert.deepEqual(m, { id: nodeId(GRAPH_ID, 'database', 'mongo') });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('classifies resource vs third-party by folder', () => {
  const dir = seed({ snapshotNodes: [] });
  try {
    writeNodeManifests({ sessionDir: dir });
    const tp = JSON.parse(readFileSync(join(dir, 'scan', 'third-party', 'stripe', 'manifest.json'), 'utf8'));
    assert.equal(tp.id, nodeId(GRAPH_ID, 'external_api', 'stripe'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('does not write a file for synthesized admin nodes', () => {
  const dir = seed({ snapshotNodes: [] });
  try {
    writeNodeManifests({ sessionDir: dir });
    assert.ok(!existsSync(join(dir, 'scan', 'resources', 'mongo-admin')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('idempotent: an existing on-disk position wins over the snapshot', () => {
  const projId = nodeId(GRAPH_ID, 'project', 'p1');
  const dir = seed({ snapshotNodes: [{ id: projId, position: { x: 10, y: 20 } }] });
  try {
    writeFileSync(
      join(dir, 'scan', 'projects', 'p1', 'manifest.json'),
      JSON.stringify({ id: projId, position: { x: 999, y: 888 } }),
    );
    writeNodeManifests({ sessionDir: dir });
    const m = JSON.parse(readFileSync(join(dir, 'scan', 'projects', 'p1', 'manifest.json'), 'utf8'));
    assert.deepEqual(m.position, { x: 999, y: 888 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writes agentContext from the snapshot onto the node manifest', () => {
  const projId = nodeId(GRAPH_ID, 'project', 'p1');
  const dir = seed({ snapshotNodes: [{ id: projId, position: { x: 10, y: 20 }, agentContext: 'Run npm test in mcp/.' }] });
  try {
    writeNodeManifests({ sessionDir: dir });
    const m = JSON.parse(readFileSync(join(dir, 'scan', 'projects', 'p1', 'manifest.json'), 'utf8'));
    assert.equal(m.agentContext, 'Run npm test in mcp/.');
    assert.deepEqual(m.position, { x: 10, y: 20 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('idempotent: an on-disk agentContext edit wins over the snapshot', () => {
  const projId = nodeId(GRAPH_ID, 'project', 'p1');
  const dir = seed({ snapshotNodes: [{ id: projId, agentContext: 'snapshot ctx' }] });
  try {
    writeFileSync(
      join(dir, 'scan', 'projects', 'p1', 'manifest.json'),
      JSON.stringify({ id: projId, agentContext: 'user edited ctx' }),
    );
    writeNodeManifests({ sessionDir: dir });
    const m = JSON.parse(readFileSync(join(dir, 'scan', 'projects', 'p1', 'manifest.json'), 'utf8'));
    assert.equal(m.agentContext, 'user edited ctx');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a service project gets a manifest id computed under the service type', () => {
  const svcId = nodeId(GRAPH_ID, 'service', 'p1');
  const dir = seed({ projectRole: 'service', snapshotNodes: [{ id: svcId, position: { x: 5, y: 6 } }] });
  try {
    writeNodeManifests({ sessionDir: dir });
    const m = JSON.parse(readFileSync(join(dir, 'scan', 'projects', 'p1', 'manifest.json'), 'utf8'));
    assert.equal(m.id, svcId);
    assert.deepEqual(m.position, { x: 5, y: 6 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects when no graph_id is available', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-mat-np-'));
  try {
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ backend: {}, projects: [] }));
    assert.throws(() => writeNodeManifests({ sessionDir: dir }), /graph_id/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
