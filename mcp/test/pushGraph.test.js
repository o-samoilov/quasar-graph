import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pushGraph } from '../src/tools/pushGraph.js';
import { nodeId } from '../src/transform/ids.js';

const GRAPH_ID = '019f6fc6-4a07-7264-b1fb-e15e968a7a65';

function writeSnapshot(dir, snapshot) {
  mkdirSync(join(dir, 'graph'), { recursive: true });
  writeFileSync(join(dir, 'graph', 'graph.json'), JSON.stringify(snapshot));
}

function fakeClient(calls) {
  return {
    scan: async (payload) => {
      calls.push(payload);
      return { status: 'ok' };
    },
  };
}

test('reads the snapshot, transforms it, POSTs to /scan, returns counts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-push-'));
  const calls = [];
  try {
    writeSnapshot(dir, {
      id: GRAPH_ID,
      scanPath: 'Projects/acme',
      agentContext: null,
      nodes: [
        { id: 'a', name: 'api', type: 'service', position: { x: 0, y: 0 } },
        { id: 'b', name: 'mongo', type: 'database', position: { x: 100, y: 0 } },
      ],
      edges: [{ id: 'e', sourceNodeId: 'a', targetNodeId: 'b', type: 'uses' }],
    });
    const res = await pushGraph({ sessionDir: dir }, { client: fakeClient(calls) });
    assert.deepEqual(
      { graphId: res.graphId, nodesPushed: res.nodesPushed, edgesPushed: res.edgesPushed },
      { graphId: GRAPH_ID, nodesPushed: 2, edgesPushed: 1 },
    );
    assert.equal(res.backend.status, 'ok');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].nodes[0].id, nodeId(GRAPH_ID, 'service', 'api'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fails with a hint when graph/graph.json is missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-push-'));
  try {
    await assert.rejects(
      () => pushGraph({ sessionDir: dir }, { client: fakeClient([]) }),
      /Run build_graph \(scan flow\) or pull_graph \(edit flow\)/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('surfaces validation errors and does not call the backend', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-push-'));
  const calls = [];
  try {
    writeSnapshot(dir, {
      id: GRAPH_ID,
      nodes: [{ id: 'a', name: '', type: 'service' }],
      edges: [],
    });
    await assert.rejects(
      () => pushGraph({ sessionDir: dir }, { client: fakeClient(calls) }),
      /not uploadable/,
    );
    assert.equal(calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('requires a session_dir', async () => {
  await assert.rejects(() => pushGraph({}, { client: fakeClient([]) }), /session_dir/);
});
