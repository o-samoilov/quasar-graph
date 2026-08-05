import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { planClone } from '../src/tools/planClone.js';

const BASE = '/tmp/projects';

function graphWith(nodes) {
  return { id: 'g-1', name: 'g', nodes, edges: [] };
}
function clientFor(graph) {
  return { getGraph: async () => graph };
}
function inspectFrom(map) {
  return (targetPath) => map[targetPath] ?? { exists: false, isGitRepo: false, remoteUrl: null };
}

test('skips non-project/service nodes and nodes without a repoUrl', async () => {
  const graph = graphWith([
    { type: 'database', name: 'mongo', repoUrl: null, projectPath: null },
    { type: 'project', name: 'no-remote', repoUrl: null, projectPath: 'apps/no-remote' },
    { type: 'project', name: 'web', repoUrl: 'https://github.com/org/web', projectPath: 'apps/web' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].containedProjects[0], 'web');
  const reasons = plan.skipped.map((s) => `${s.name}:${s.reason}`).join('|');
  assert.match(reasons, /mongo:.*type/);
  assert.match(reasons, /no-remote:.*repoUrl/);
});

test('a node with repoUrl and projectPath is deployable whatever its type', async () => {
  const graph = graphWith([
    { type: 'admin_panel', name: 'admin', repoUrl: 'https://github.com/org/admin', projectPath: 'apps/admin' },
    { type: 'rest_api', name: 'core-api', repoUrl: 'https://github.com/org/core', projectPath: 'apps/core' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.skipped.length, 0);
  assert.deepEqual(
    plan.entries.map((e) => e.containedProjects[0]).sort(),
    ['admin', 'core-api'],
  );
});

test('clone when target absent; ssh protocol applied to repoUrl', async () => {
  const graph = graphWith([
    { type: 'service', name: 'api', repoUrl: 'https://github.com/org/api', projectPath: 'backend/api' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.deepEqual(plan.entries[0], {
    repoUrl: 'git@github.com:org/api.git',
    targetPath: join(BASE, 'backend/api'),
    action: 'clone',
    containedProjects: ['api'],
    agentContext: null,
  });
});

test('pull when target is the same repo (remote normalizes to graph repoUrl)', async () => {
  const target = join(BASE, 'apps/web');
  const graph = graphWith([
    { type: 'project', name: 'web', repoUrl: 'https://github.com/org/web', projectPath: 'apps/web' },
  ]);
  const inspect = inspectFrom({
    [target]: { exists: true, isGitRepo: true, remoteUrl: 'git@github.com:org/web.git' },
  });
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect },
  );
  assert.equal(plan.entries[0].action, 'pull');
});

test('skip when target exists with a different remote', async () => {
  const target = join(BASE, 'apps/web');
  const graph = graphWith([
    { type: 'project', name: 'web', repoUrl: 'https://github.com/org/web', projectPath: 'apps/web' },
  ]);
  const inspect = inspectFrom({
    [target]: { exists: true, isGitRepo: true, remoteUrl: 'git@github.com:other/thing.git' },
  });
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'https' },
    { client: clientFor(graph), inspect },
  );
  assert.equal(plan.entries[0].action, 'skip');
  assert.match(plan.entries[0].reason, /different or missing git remote/);
});

test('skips a project/service node that has a repoUrl but no projectPath', async () => {
  const graph = graphWith([
    { type: 'project', name: 'web', repoUrl: 'https://github.com/org/web', projectPath: null },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.entries.length, 0);
  assert.match(plan.skipped.map((s) => `${s.name}:${s.reason}`).join('|'), /web:.*projectPath/);
});

test('skip when target exists but is not a git repo', async () => {
  const target = join(BASE, 'apps/web');
  const graph = graphWith([
    { type: 'project', name: 'web', repoUrl: 'https://github.com/org/web', projectPath: 'apps/web' },
  ]);
  const inspect = inspectFrom({ [target]: { exists: true, isGitRepo: false, remoteUrl: null } });
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect },
  );
  assert.equal(plan.entries[0].action, 'skip');
  assert.match(plan.entries[0].reason, /not a git repo/);
});

test('monorepo: nodes sharing a repoUrl collapse to one entry at the common prefix', async () => {
  const graph = graphWith([
    { type: 'service', name: 'api', repoUrl: 'https://github.com/org/mono', projectPath: 'backend/api' },
    { type: 'service', name: 'worker', repoUrl: 'https://github.com/org/mono', projectPath: 'backend/worker' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].targetPath, join(BASE, 'backend'));
  assert.deepEqual(plan.entries[0].containedProjects.sort(), ['api', 'worker']);
});

test('monorepo: paths with no common prefix become a skip entry, not a clone into the shortest path', async () => {
  const graph = graphWith([
    { type: 'project', name: 'web', repoUrl: 'https://github.com/org/mono', projectPath: 'frontend/web' },
    { type: 'service', name: 'api', repoUrl: 'https://github.com/org/mono', projectPath: 'backend/api' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].action, 'skip');
  assert.match(plan.entries[0].reason, /no common path prefix/);
  assert.equal(plan.entries[0].targetPath, null);
});

test('monorepo entry carries containedPaths for post-clone layout verification', async () => {
  const graph = graphWith([
    { type: 'service', name: 'api', repoUrl: 'https://github.com/org/mono', projectPath: 'backend/api' },
    { type: 'service', name: 'worker', repoUrl: 'https://github.com/org/mono', projectPath: 'backend/worker' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.deepEqual(plan.entries[0].containedPaths.sort(), [
    join(BASE, 'backend/api'),
    join(BASE, 'backend/worker'),
  ]);
});

test('single-project entry has no containedPaths', async () => {
  const graph = graphWith([
    { type: 'service', name: 'api', repoUrl: 'https://github.com/org/api', projectPath: 'backend/api' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.ok(!('containedPaths' in plan.entries[0]));
});

test('unnormalized graph repoUrl still converts to the requested protocol', async () => {
  const graph = graphWith([
    { type: 'project', name: 'web', repoUrl: 'git@github.com:org/web.git', projectPath: 'apps/web' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'https' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.entries[0].repoUrl, 'https://github.com/org/web');
});

test('pull when graph repoUrl is unnormalized but points at the same repo', async () => {
  const target = join(BASE, 'apps/web');
  const graph = graphWith([
    { type: 'project', name: 'web', repoUrl: 'git@github.com:org/web.git', projectPath: 'apps/web' },
  ]);
  const inspect = inspectFrom({
    [target]: { exists: true, isGitRepo: true, remoteUrl: 'https://github.com/org/web.git' },
  });
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect },
  );
  assert.equal(plan.entries[0].action, 'pull');
});

test('ssh and https forms of the same repo collapse into one monorepo entry', async () => {
  const graph = graphWith([
    { type: 'service', name: 'api', repoUrl: 'git@github.com:org/mono.git', projectPath: 'backend/api' },
    { type: 'service', name: 'worker', repoUrl: 'https://github.com/org/mono', projectPath: 'backend/worker' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.entries.length, 1);
  assert.deepEqual(plan.entries[0].containedProjects.sort(), ['api', 'worker']);
  assert.equal(plan.entries[0].repoUrl, 'git@github.com:org/mono.git');
});

test('absolute projectPath is skipped instead of cloning outside base_dir', async () => {
  const graph = graphWith([
    { type: 'project', name: 'web', repoUrl: 'https://github.com/org/web', projectPath: '/Users/someone/Projects/web' },
    { type: 'service', name: 'api', repoUrl: 'https://github.com/org/api', projectPath: 'backend/api' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].containedProjects[0], 'api');
  assert.match(
    plan.skipped.map((s) => `${s.name}:${s.reason}`).join('|'),
    /web:.*absolute projectPath/,
  );
});

test('requires graphId and an absolute baseDir', async () => {
  await assert.rejects(
    () => planClone({ baseDir: BASE }, { client: clientFor(graphWith([])) }),
    /graph_id/,
  );
  await assert.rejects(
    () => planClone({ graphId: 'g-1', baseDir: 'relative/dir' }, { client: clientFor(graphWith([])) }),
    /absolute/,
  );
});

test('single-project entry carries the node agentContext', async () => {
  const graph = graphWith([
    { type: 'service', name: 'api', repoUrl: 'https://github.com/org/api', projectPath: 'backend/api', agentContext: 'run composer in the app container' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.entries[0].agentContext, 'run composer in the app container');
  assert.ok(!('agentContexts' in plan.entries[0]));
});

test('agentContext is null when the node has none', async () => {
  const graph = graphWith([
    { type: 'service', name: 'api', repoUrl: 'https://github.com/org/api', projectPath: 'backend/api' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.equal(plan.entries[0].agentContext, null);
});

test('monorepo entry carries per-project agentContexts', async () => {
  const graph = graphWith([
    { type: 'service', name: 'api', repoUrl: 'https://github.com/org/mono', projectPath: 'backend/api', agentContext: 'api ctx' },
    { type: 'service', name: 'worker', repoUrl: 'https://github.com/org/mono', projectPath: 'backend/worker' },
  ]);
  const plan = await planClone(
    { graphId: 'g-1', baseDir: BASE, protocol: 'ssh' },
    { client: clientFor(graph), inspect: inspectFrom({}) },
  );
  assert.ok(!('agentContext' in plan.entries[0]));
  assert.deepEqual(
    plan.entries[0].agentContexts.sort((a, b) => a.name.localeCompare(b.name)),
    [{ name: 'api', agentContext: 'api ctx' }, { name: 'worker', agentContext: null }],
  );
});
