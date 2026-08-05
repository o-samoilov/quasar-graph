import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromWireGraph, toWireScanPayload } from '../src/backend/wire.js';

test('fromWireGraph renames graph, node, and edge keys to internal camelCase', () => {
  const wire = {
    id: 'g1',
    workspace_id: 'w1',
    project_id: 'p1',
    name: 'acme',
    scanned_at: '2026-07-28T00:00:00Z',
    scan_path: 'Projects/acme',
    agent_context: 'graph ctx',
    nodes: [
      {
        id: 'n1',
        graph_id: 'g1',
        name: 'api',
        type: 'service',
        description: 'API',
        repo_url: 'https://github.com/org/api',
        project_path: 'backend/api',
        agent_context: 'node ctx',
        position: { x: 1, y: 2 },
        data: { engine: null, port: 8080, hostname: null, technologies: ['php'], package_name: null },
        links: [{ id: 'l1', name: 'Admin Panel', url: 'https://admin.local' }],
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
  };
  assert.deepEqual(fromWireGraph(wire), {
    id: 'g1',
    workspaceId: 'w1',
    projectId: 'p1',
    name: 'acme',
    scannedAt: '2026-07-28T00:00:00Z',
    scanPath: 'Projects/acme',
    agentContext: 'graph ctx',
    nodes: [
      {
        id: 'n1',
        name: 'api',
        type: 'service',
        description: 'API',
        repoUrl: 'https://github.com/org/api',
        projectPath: 'backend/api',
        agentContext: 'node ctx',
        position: { x: 1, y: 2 },
        data: { engine: null, port: 8080, hostname: null, technologies: ['php'], packageName: null },
        links: [{ id: 'l1', name: 'Admin Panel', url: 'https://admin.local' }],
      },
    ],
    edges: [
      {
        id: 'e1',
        sourceNodeId: 'n1',
        targetNodeId: 'n2',
        type: 'rest_api',
        sourcePosition: 'right',
        targetPosition: 'left',
      },
    ],
  });
});

test('fromWireGraph tolerates missing collections and null node data', () => {
  const graph = fromWireGraph({
    id: 'g1',
    name: 'x',
    nodes: [{ id: 'n1', name: 'a', type: 'project', data: null }],
  });
  assert.deepEqual(graph.edges, []);
  assert.equal(graph.nodes[0].data, null);
  assert.deepEqual(graph.nodes[0].links, []);
  assert.equal(graph.scanPath, null);
  assert.equal(graph.agentContext, null);
});

test('toWireScanPayload renames payload keys to snake_case', () => {
  const payload = {
    graphId: 'g1',
    agentContext: null,
    scanPath: 'Projects/acme',
    nodes: [
      {
        id: 'n1',
        name: 'sdk',
        type: 'library',
        description: null,
        repoUrl: null,
        projectPath: 'libs/sdk',
        agentContext: null,
        position: { x: 0, y: 0 },
        data: { technologies: ['ts'], packageName: '@acme/sdk' },
        links: [],
      },
    ],
    edges: [
      {
        id: 'e1',
        sourceNodeId: 'n1',
        targetNodeId: 'n2',
        type: 'client_of',
        sourcePosition: 'left',
        targetPosition: 'right',
      },
    ],
  };
  assert.deepEqual(toWireScanPayload(payload), {
    graph_id: 'g1',
    agent_context: null,
    scan_path: 'Projects/acme',
    nodes: [
      {
        id: 'n1',
        name: 'sdk',
        type: 'library',
        description: null,
        repo_url: null,
        project_path: 'libs/sdk',
        agent_context: null,
        position: { x: 0, y: 0 },
        data: { technologies: ['ts'], package_name: '@acme/sdk' },
        links: [],
      },
    ],
    edges: [
      {
        id: 'e1',
        source_node_id: 'n1',
        target_node_id: 'n2',
        type: 'client_of',
        source_position: 'left',
        target_position: 'right',
      },
    ],
  });
});

test('toWireScanPayload keeps data without packageName untouched and null data null', () => {
  const base = { description: null, repoUrl: null, projectPath: null, agentContext: null, position: { x: 0, y: 0 }, links: [] };
  const out = toWireScanPayload({
    graphId: 'g1',
    agentContext: null,
    scanPath: null,
    nodes: [
      { id: 'n1', name: 'db', type: 'database', data: { engine: 'postgres', port: 5432 }, ...base },
      { id: 'n2', name: 'web', type: 'project', data: null, ...base },
    ],
    edges: [],
  });
  assert.deepEqual(out.nodes[0].data, { engine: 'postgres', port: 5432 });
  assert.equal(out.nodes[1].data, null);
});
