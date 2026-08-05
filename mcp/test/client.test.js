import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/backend/client.js';
import { LoginRequiredError } from '../src/auth/errors.js';

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, opts });
    const route = routes[`${opts.method ?? 'GET'} ${url}`];
    if (!route) return { ok: false, status: 404, text: async () => 'not found' };
    return { ok: true, status: 200, json: async () => route };
  };
  fn.calls = calls;
  return fn;
}

test('listProjects GETs the projects collection', async () => {
  const fetch = fakeFetch({ 'GET https://api.local/api/v1/projects': [{ id: 'p1', name: 'acme' }] });
  const client = createClient('https://api.local', { fetch });
  assert.deepEqual(await client.listProjects(), [{ id: 'p1', name: 'acme' }]);
});

test('createGraph POSTs name and project_id', async () => {
  const fetch = fakeFetch({ 'POST https://api.local/api/v1/graphs': { id: 'g1', name: 'projects' } });
  const client = createClient('https://api.local', { fetch });
  const graph = await client.createGraph({ name: 'projects', projectId: 'p1' });
  assert.equal(graph.id, 'g1');
  const body = JSON.parse(fetch.calls[0].opts.body);
  assert.deepEqual(body, { name: 'projects', project_id: 'p1' });
});

test('createProject POSTs workspace_id, name and description', async () => {
  const fetch = fakeFetch({ 'POST https://api.local/api/v1/projects': { id: 'p1', name: 'Test' } });
  const client = createClient('https://api.local', { fetch });
  const project = await client.createProject({ name: 'Test', description: 'demo project', workspaceId: 'w1' });
  assert.equal(project.id, 'p1');
  assert.deepEqual(JSON.parse(fetch.calls[0].opts.body), {
    workspace_id: 'w1',
    name: 'Test',
    description: 'demo project',
  });
});

test('createProject without a description sends only workspace_id and name', async () => {
  const fetch = fakeFetch({ 'POST https://api.local/api/v1/projects': { id: 'p1', name: 'Test' } });
  const client = createClient('https://api.local', { fetch });
  await client.createProject({ name: 'Test', workspaceId: 'w1' });
  assert.deepEqual(JSON.parse(fetch.calls[0].opts.body), { workspace_id: 'w1', name: 'Test' });
});

test('scan POSTs the snake_case wire payload', async () => {
  const fetch = fakeFetch({ 'POST https://api.local/api/v1/scan': { id: 'g1', nodes: [], edges: [] } });
  const client = createClient('https://api.local', { fetch });
  const res = await client.scan({ graphId: 'g1', nodes: [], edges: [], agentContext: null, scanPath: null });
  assert.equal(res.id, 'g1');
  const call = fetch.calls[0];
  assert.equal(call.opts.method, 'POST');
  assert.equal(call.opts.headers['Content-Type'], 'application/json');
  const body = JSON.parse(call.opts.body);
  assert.equal(body.graph_id, 'g1');
  assert.equal(body.agent_context, null);
  assert.equal(body.scan_path, null);
  assert.equal('graphId' in body, false);
});

test('non-2xx throws with status', async () => {
  const fetch = fakeFetch({});
  const client = createClient('https://api.local', { fetch });
  await assert.rejects(() => client.listGraphs(), /404/);
});

test('listGraphs without a projectId GETs the unfiltered collection', async () => {
  const fetch = fakeFetch({ 'GET https://api.local/api/v1/graphs': [{ id: 'g1' }] });
  const client = createClient('https://api.local', { fetch });
  assert.deepEqual(await client.listGraphs(), [{ id: 'g1' }]);
});

test('listGraphs with a projectId appends the project_id query param', async () => {
  const fetch = fakeFetch({ 'GET https://api.local/api/v1/graphs?project_id=p-1': [{ id: 'g1' }] });
  const client = createClient('https://api.local', { fetch });
  assert.deepEqual(await client.listGraphs('p-1'), [{ id: 'g1' }]);
  assert.equal(fetch.calls[0].url, 'https://api.local/api/v1/graphs?project_id=p-1');
});

function fakeAuth() {
  const calls = { get: 0, unauthorized: 0 };
  return {
    calls,
    async getAccessToken() {
      calls.get += 1;
      return 'at-1';
    },
    async handleUnauthorized() {
      calls.unauthorized += 1;
      return 'at-2';
    },
  };
}

test('with auth, requests carry Authorization: Bearer', async () => {
  const fetch = fakeFetch({ 'GET https://api.local/api/v1/projects': [] });
  const auth = fakeAuth();
  const client = createClient('https://api.local', { fetch, auth });
  await client.listProjects();
  assert.equal(fetch.calls[0].opts.headers.Authorization, 'Bearer at-1');
  assert.equal(auth.calls.get, 1);
});

test('401 triggers one refresh and one retry with the new token', async () => {
  const auth = fakeAuth();
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (calls.length === 1) return { ok: false, status: 401, text: async () => '' };
    return { ok: true, status: 200, json: async () => [{ id: 'p1' }] };
  };
  const client = createClient('https://api.local', { fetch, auth });
  assert.deepEqual(await client.listProjects(), [{ id: 'p1' }]);
  assert.equal(auth.calls.unauthorized, 1);
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer at-2');
});

test('a second consecutive 401 throws LoginRequiredError', async () => {
  const auth = fakeAuth();
  const fetch = async () => ({ ok: false, status: 401, text: async () => '' });
  const client = createClient('https://api.local', { fetch, auth });
  await assert.rejects(() => client.listProjects(), LoginRequiredError);
  assert.equal(auth.calls.unauthorized, 1);
});

test('non-401 errors do not touch handleUnauthorized', async () => {
  const auth = fakeAuth();
  const fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const client = createClient('https://api.local', { fetch, auth });
  await assert.rejects(() => client.listProjects(), /500/);
  assert.equal(auth.calls.unauthorized, 0);
});

test('without auth, no Authorization header is sent (back-compat)', async () => {
  const fetch = fakeFetch({ 'GET https://api.local/api/v1/projects': [] });
  const client = createClient('https://api.local', { fetch });
  await client.listProjects();
  assert.equal('Authorization' in fetch.calls[0].opts.headers, false);
});

test('listWorkspaces GETs the workspaces collection', async () => {
  const fetch = fakeFetch({
    'GET https://api.local/api/v1/workspaces': [{ id: 'w1', name: 'Sam', role: 'owner' }],
  });
  const client = createClient('https://api.local', { fetch });
  assert.deepEqual(await client.listWorkspaces(), [{ id: 'w1', name: 'Sam', role: 'owner' }]);
});

test('getGraph converts the wire response to the internal camelCase shape', async () => {
  const fetch = fakeFetch({
    'GET https://api.local/api/v1/graphs/g1': {
      id: 'g1',
      workspace_id: 'w1',
      project_id: 'p1',
      name: 'acme',
      scanned_at: null,
      scan_path: 'Projects/acme',
      agent_context: null,
      nodes: [
        {
          id: 'n1',
          graph_id: 'g1',
          name: 'api',
          type: 'service',
          description: null,
          repo_url: 'https://github.com/org/api',
          project_path: 'backend/api',
          agent_context: null,
          position: { x: 0, y: 0 },
          data: { engine: null, port: 8080, hostname: null, technologies: [], package_name: null },
          links: [],
        },
      ],
      edges: [
        {
          id: 'e1',
          graph_id: 'g1',
          source_node_id: 'n1',
          target_node_id: 'n2',
          type: 'rest_api',
          source_position: 'right',
          target_position: 'left',
        },
      ],
    },
  });
  const client = createClient('https://api.local', { fetch });
  const graph = await client.getGraph('g1');
  assert.equal(graph.scanPath, 'Projects/acme');
  assert.equal(graph.nodes[0].repoUrl, 'https://github.com/org/api');
  assert.equal(graph.nodes[0].projectPath, 'backend/api');
  assert.equal(graph.nodes[0].data.packageName, null);
  assert.equal(graph.edges[0].sourceNodeId, 'n1');
  assert.equal(graph.edges[0].targetNodeId, 'n2');
});
