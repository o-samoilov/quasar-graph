import { LoginRequiredError } from '../auth/errors.js';
import { fromWireGraph, toWireScanPayload } from './wire.js';

export function createClient(baseUrl, { fetch = globalThis.fetch, auth } = {}) {
  async function send(method, path, body, accessToken) {
    const opts = { method, headers: {} };
    if (accessToken) opts.headers.Authorization = `Bearer ${accessToken}`;
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(`${baseUrl}${path}`, opts);
  }

  async function request(method, path, body) {
    let res = await send(method, path, body, auth ? await auth.getAccessToken() : undefined);
    if (auth && res.status === 401) {
      const accessToken = await auth.handleUnauthorized();
      res = await send(method, path, body, accessToken);
      if (res.status === 401) throw new LoginRequiredError();
    }
    if (!res.ok) {
      const text = typeof res.text === 'function' ? await res.text() : '';
      throw new Error(`Backend ${method} ${path} failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  return {
    listProjects: () => request('GET', '/api/v1/projects'),
    listWorkspaces: () => request('GET', '/api/v1/workspaces'),
    createProject: ({ name, description, workspaceId }) =>
      request('POST', '/api/v1/projects', {
        workspace_id: workspaceId,
        name,
        ...(description === undefined ? {} : { description }),
      }),
    listGraphs: (projectId) =>
      request('GET', `/api/v1/graphs${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
    getGraph: async (id) => fromWireGraph(await request('GET', `/api/v1/graphs/${id}`)),
    createGraph: ({ name, projectId }) =>
      request('POST', '/api/v1/graphs', { name, project_id: projectId }),
    scan: async (payload) => fromWireGraph(await request('POST', '/api/v1/scan', toWireScanPayload(payload))),
  };
}
