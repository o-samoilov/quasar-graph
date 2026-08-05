import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/tools/createProject.js';

function fakeClient({ workspaces = [] } = {}) {
  const calls = [];
  return {
    calls,
    async listWorkspaces() {
      calls.push('listWorkspaces');
      return workspaces;
    },
    async createProject(args) {
      calls.push(args);
      return { id: 'p1', workspace_id: args.workspaceId, name: args.name };
    },
  };
}

test('explicit workspace_id skips the workspace lookup', async () => {
  const client = fakeClient();
  const res = await createProject({ name: 'acme', workspaceId: 'w2' }, { client });
  assert.equal(res.id, 'p1');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].workspaceId, 'w2');
});

test('a single workspace becomes the default', async () => {
  const client = fakeClient({ workspaces: [{ id: 'w1', name: "Sam's Workspace", role: 'owner' }] });
  const res = await createProject({ name: 'acme', description: 'demo' }, { client });
  assert.equal(res.workspace_id, 'w1');
  assert.deepEqual(client.calls[0], 'listWorkspaces');
  assert.equal(client.calls[1].workspaceId, 'w1');
  assert.equal(client.calls[1].description, 'demo');
});

test('several workspaces without workspace_id throw with the options listed', async () => {
  const client = fakeClient({
    workspaces: [
      { id: 'w1', name: 'A', role: 'owner' },
      { id: 'w2', name: 'B', role: 'member' },
    ],
  });
  await assert.rejects(() => createProject({ name: 'acme' }, { client }), /A \(w1\), B \(w2\)/);
});

test('no workspaces at all throws asking for workspace_id', async () => {
  const client = fakeClient();
  await assert.rejects(() => createProject({ name: 'acme' }, { client }), /workspace_id/);
});
