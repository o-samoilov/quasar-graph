function fromWireNodeData(data) {
  if (!data) return null;
  const { package_name, ...rest } = data;
  return package_name === undefined ? rest : { ...rest, packageName: package_name };
}

function fromWireNode({ graph_id, repo_url, project_path, agent_context, data, links, ...rest }) {
  return {
    ...rest,
    repoUrl: repo_url ?? null,
    projectPath: project_path ?? null,
    agentContext: agent_context ?? null,
    data: fromWireNodeData(data),
    links: links ?? [],
  };
}

function fromWireEdge({ graph_id, source_node_id, target_node_id, source_position, target_position, ...rest }) {
  return {
    ...rest,
    sourceNodeId: source_node_id,
    targetNodeId: target_node_id,
    sourcePosition: source_position,
    targetPosition: target_position,
  };
}

export function fromWireGraph({ workspace_id, project_id, scanned_at, scan_path, agent_context, nodes, edges, ...rest }) {
  return {
    ...rest,
    workspaceId: workspace_id ?? null,
    projectId: project_id ?? null,
    scannedAt: scanned_at ?? null,
    scanPath: scan_path ?? null,
    agentContext: agent_context ?? null,
    nodes: (nodes ?? []).map(fromWireNode),
    edges: (edges ?? []).map(fromWireEdge),
  };
}

function toWireNodeData(data) {
  if (!data) return null;
  const { packageName, ...rest } = data;
  return packageName === undefined ? rest : { ...rest, package_name: packageName };
}

function toWireNode({ repoUrl, projectPath, agentContext, data, ...rest }) {
  return {
    ...rest,
    repo_url: repoUrl,
    project_path: projectPath,
    agent_context: agentContext,
    data: toWireNodeData(data),
  };
}

function toWireEdge({ sourceNodeId, targetNodeId, sourcePosition, targetPosition, ...rest }) {
  return {
    ...rest,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    source_position: sourcePosition,
    target_position: targetPosition,
  };
}

export function toWireScanPayload({ graphId, nodes, edges, agentContext, scanPath }) {
  return {
    graph_id: graphId,
    nodes: nodes.map(toWireNode),
    edges: edges.map(toWireEdge),
    agent_context: agentContext,
    scan_path: scanPath,
  };
}
