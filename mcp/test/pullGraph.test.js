import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pullGraph } from '../src/tools/pullGraph.js';

const graph = {
  id: 'g-1',
  name: 'projects',
  nodes: [
    { id: 'n-a', type: 'project', name: 'A', position: { x: 10, y: 20 }, description: 'A desc' },
    { id: 'n-b', type: 'database', name: 'mongo', position: { x: 640, y: 0 }, description: null },
  ],
  edges: [{ id: 'e-1', sourceNodeId: 'n-a', targetNodeId: 'n-b', type: 'uses' }],
};

function fakeClient() {
  return { getGraph: async (id) => ({ ...graph, requestedId: id }) };
}

test('writes only graph.json (no per-node buffer), returns count', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-pull-'));
  try {
    const res = await pullGraph({ sessionDir: dir, graphId: 'g-1' }, { client: fakeClient() });
    assert.equal(res.nodesWritten, 2);

    assert.ok(existsSync(join(dir, 'graph', 'graph.json')));
    const snapshot = JSON.parse(readFileSync(join(dir, 'graph', 'graph.json'), 'utf8'));
    assert.equal(snapshot.id, 'g-1');
    assert.equal(snapshot.nodes.length, 2);

    assert.ok(!existsSync(join(dir, 'graph', 'nodes')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('requires a graph_id', async () => {
  await assert.rejects(() => pullGraph({ sessionDir: '/tmp/x' }, { client: fakeClient() }), /graph_id/);
});
