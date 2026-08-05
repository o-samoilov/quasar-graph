import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listSessions } from '../src/tools/listSessions.js';

function seed() {
  return mkdtempSync(join(tmpdir(), 'qg-sessions-'));
}

function writeSession(cwd, sessionId, manifest) {
  const dir = join(cwd, '.quasar-graph', sessionId);
  mkdirSync(dir, { recursive: true });
  if (manifest !== undefined) writeFileSync(join(dir, 'manifest.json'), manifest);
  return dir;
}

test('summarizes a bound session with status counts across projects and environments', () => {
  const cwd = seed();
  writeSession(
    cwd,
    '20260724-0043-6f58ed',
    JSON.stringify({
      session_id: '20260724-0043-6f58ed',
      created_at: '2026-07-24T00:43:11Z',
      scan_dir: '/abs/projects',
      backend: { graph_id: 'g-1', graph_name: 'acme' },
      projects: [
        { name: 'a', status: 'done' },
        { name: 'b', status: 'pending' },
        { name: 'c', status: 'skipped' },
      ],
      environments: [{ name: 'devops', status: 'done' }],
    }),
  );

  const { sessions, skipped_dirs } = listSessions({ cwd });

  assert.equal(skipped_dirs, 0);
  assert.deepEqual(sessions, [
    {
      session_id: '20260724-0043-6f58ed',
      created_at: '2026-07-24T00:43:11Z',
      scan_dir: '/abs/projects',
      graph_name: 'acme',
      graph_id: 'g-1',
      counts: { done: 2, pending: 1, skipped: 1 },
    },
  ]);
  rmSync(cwd, { recursive: true, force: true });
});

test('reports an offline session with no backend block', () => {
  const cwd = seed();
  writeSession(cwd, '20260722-1405-a60409', JSON.stringify({ scan_dir: '/abs/projects', projects: [] }));

  const { sessions } = listSessions({ cwd });

  assert.equal(sessions[0].graph_name, null);
  assert.equal(sessions[0].graph_id, null);
  assert.deepEqual(sessions[0].counts, { done: 0, pending: 0, skipped: 0 });
  rmSync(cwd, { recursive: true, force: true });
});

test('sorts newest first and skips directories without a readable manifest', () => {
  const cwd = seed();
  writeSession(cwd, '20260716-0207-b36569', JSON.stringify({ projects: [] }));
  writeSession(cwd, '20260724-0043-6f58ed', JSON.stringify({ projects: [] }));
  writeSession(cwd, '20260722-2353-973c25');
  writeSession(cwd, '20260723-0117-4589c8', '{ not json');

  const { sessions, skipped_dirs } = listSessions({ cwd });

  assert.deepEqual(
    sessions.map((s) => s.session_id),
    ['20260724-0043-6f58ed', '20260716-0207-b36569'],
  );
  assert.equal(skipped_dirs, 2);
  rmSync(cwd, { recursive: true, force: true });
});

test('returns an empty list when no scan has ever run here', () => {
  const cwd = seed();

  assert.deepEqual(listSessions({ cwd }), { sessions: [], skipped_dirs: 0 });
  rmSync(cwd, { recursive: true, force: true });
});

test('requires cwd', () => {
  assert.throws(() => listSessions({}), /cwd is required/);
});
