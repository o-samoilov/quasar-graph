import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadBindings, saveBindings, upsertEntry } from '../src/bindings.js';

function freshHome() {
  return mkdtempSync(join(tmpdir(), 'quasar-bindings-'));
}

test('loadBindings returns empty object when the file is missing', () => {
  assert.deepEqual(loadBindings(freshHome()), {});
});

test('loadBindings returns empty object when the file is unparseable', () => {
  const home = freshHome();
  const dir = join(home, '.quasar-graph', 'cache');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'bindings.json'), 'not json');
  assert.deepEqual(loadBindings(home), {});
});

test('loadBindings round-trips what saveBindings wrote', () => {
  const home = freshHome();
  const data = {
    'https://github.com/org/repo': [
      { node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' },
    ],
  };
  saveBindings(data, home);
  assert.deepEqual(loadBindings(home), data);
});

test('saveBindings creates the cache directory and writes the file', () => {
  const home = freshHome();
  saveBindings({ 'https://github.com/org/repo': [] }, home);
  assert.equal(existsSync(join(home, '.quasar-graph', 'cache', 'bindings.json')), true);
});

test('upsertEntry replaces the entry with the same graph_id and node_name', () => {
  const entries = [
    { node_name: 'api', project_path: 'old/api', project_id: 'p1', graph_id: 'g1' },
    { node_name: 'web', project_path: 'apps/web', project_id: 'p1', graph_id: 'g1' },
  ];
  const next = upsertEntry(entries, {
    node_name: 'api',
    project_path: 'backend/api',
    project_id: 'p1',
    graph_id: 'g1',
  });
  assert.equal(next.length, 2);
  assert.equal(next.find((e) => e.node_name === 'api').project_path, 'backend/api');
  assert.equal(next.find((e) => e.node_name === 'web').project_path, 'apps/web');
});

test('upsertEntry keeps entries for the same node in other graphs', () => {
  const entries = [{ node_name: 'api', project_path: 'backend/api', project_id: 'p1', graph_id: 'g1' }];
  const next = upsertEntry(entries, {
    node_name: 'api',
    project_path: 'backend/api',
    project_id: 'p2',
    graph_id: 'g2',
  });
  assert.equal(next.length, 2);
});
