import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPersistentNodes, readPreviousNodes } from '../src/read/persistentNodes.js';

function seed() {
  const dir = mkdtempSync(join(tmpdir(), 'qg-pnodes-'));
  mkdirSync(join(dir, 'graph'), { recursive: true });
  writeFileSync(
    join(dir, 'graph', 'graph.json'),
    JSON.stringify({
      id: 'g-1',
      nodes: [
        { id: 'admin-1', position: { x: 5, y: 6 } },
        { id: 'proj-1', position: { x: 1, y: 2 } },
      ],
    }),
  );
  const projDir = join(dir, 'scan', 'projects', 'p1');
  mkdirSync(projDir, { recursive: true });
  writeFileSync(join(projDir, 'manifest.json'), JSON.stringify({ id: 'proj-1', position: { x: 100, y: 200 } }));
  return dir;
}

test('merges snapshot positions with per-folder manifests (folder wins)', () => {
  const dir = seed();
  try {
    const map = readPersistentNodes(dir);
    assert.deepEqual(map.get('admin-1').position, { x: 5, y: 6 });
    assert.deepEqual(map.get('proj-1').position, { x: 100, y: 200 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('carries agentContext from snapshot, with the per-folder manifest winning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-pnodes-ctx-'));
  mkdirSync(join(dir, 'graph'), { recursive: true });
  writeFileSync(
    join(dir, 'graph', 'graph.json'),
    JSON.stringify({
      nodes: [
        { id: 'admin-1', position: { x: 5, y: 6 }, agentContext: 'admin ctx' },
        { id: 'proj-1', position: { x: 1, y: 2 }, agentContext: 'snapshot ctx' },
      ],
    }),
  );
  const projDir = join(dir, 'scan', 'projects', 'p1');
  mkdirSync(projDir, { recursive: true });
  writeFileSync(join(projDir, 'manifest.json'), JSON.stringify({ id: 'proj-1', agentContext: 'folder ctx' }));
  try {
    const map = readPersistentNodes(dir);
    assert.equal(map.get('admin-1').agentContext, 'admin ctx');
    assert.equal(map.get('proj-1').agentContext, 'folder ctx');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('returns an empty Map when neither source exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-pnodes-empty-'));
  try {
    assert.equal(readPersistentNodes(dir).size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reads a per-folder manifest with no snapshot present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-pnodes-nosnap-'));
  try {
    const resDir = join(dir, 'scan', 'resources', 'mongo');
    mkdirSync(resDir, { recursive: true });
    writeFileSync(join(resDir, 'manifest.json'), JSON.stringify({ id: 'res-1', position: { x: 7, y: 8 } }));
    const map = readPersistentNodes(dir);
    assert.deepEqual(map.get('res-1').position, { x: 7, y: 8 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readPreviousNodes returns full snapshot nodes keyed by id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-prev-'));
  try {
    mkdirSync(join(dir, 'graph'), { recursive: true });
    writeFileSync(
      join(dir, 'graph', 'graph.json'),
      JSON.stringify({
        id: 'g1',
        nodes: [
          {
            id: 'n1',
            name: 'mongo',
            type: 'database',
            description: 'old desc',
            data: { engine: 'mongodb', port: 27017 },
            links: [{ name: 'Admin Panel', url: 'http://localhost:8081' }],
          },
        ],
      }),
    );
    const map = readPreviousNodes(dir);
    assert.equal(map.size, 1);
    assert.equal(map.get('n1').description, 'old desc');
    assert.deepEqual(map.get('n1').data, { engine: 'mongodb', port: 27017 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readPreviousNodes returns an empty map when there is no snapshot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-prev-'));
  try {
    assert.equal(readPreviousNodes(dir).size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reads a per-folder manifest from third-party', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qg-pnodes-tp-'));
  try {
    const tpDir = join(dir, 'scan', 'third-party', 'stripe');
    mkdirSync(tpDir, { recursive: true });
    writeFileSync(join(tpDir, 'manifest.json'), JSON.stringify({ id: 'tp-1', position: { x: 9, y: 9 } }));
    const map = readPersistentNodes(dir);
    assert.deepEqual(map.get('tp-1').position, { x: 9, y: 9 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
