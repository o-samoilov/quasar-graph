import { nodeId, edgeId } from './ids.js';
import { edgeAnchors } from './payload.js';

function collectErrors(snapshot, nodesInput, nodeInfos, edges, idMap) {
  const errors = [];
  if (!snapshot?.id) errors.push('snapshot has no graph id ("id" field)');
  if (!Array.isArray(nodesInput)) errors.push('snapshot has no nodes array');
  const seenTypeName = new Set();
  const seenIds = new Set();
  for (const info of nodeInfos) {
    const { rawId, name, type, label } = info;
    if (!name) errors.push(`node "${label}": name is empty`);
    if (!type) errors.push(`node "${label}": type is empty`);
    if (name && type) {
      const key = `${type}:${name}`;
      if (seenTypeName.has(key)) {
        errors.push(`nodes share (type, name) = (${type}, ${name}); they would collapse into one deterministic id`);
      }
      seenTypeName.add(key);
    }
    if (rawId) {
      if (seenIds.has(rawId)) errors.push(`nodes share in-file id "${rawId}"; edges cannot be rewired unambiguously`);
      seenIds.add(rawId);
    }
  }
  for (const edge of edges) {
    const label = edge?.id ?? `${edge?.sourceNodeId} -> ${edge?.targetNodeId}`;
    const source = idMap.get(edge?.sourceNodeId);
    const target = idMap.get(edge?.targetNodeId);
    if (!source) errors.push(`edge "${label}": sourceNodeId "${edge?.sourceNodeId}" matches no node in the file`);
    if (!target) errors.push(`edge "${label}": targetNodeId "${edge?.targetNodeId}" matches no node in the file`);
    if (typeof edge?.type !== 'string' || !edge.type.trim()) errors.push(`edge "${label}": type is empty`);
    if (source && target && source === target) errors.push(`edge "${label}": self-loop`);
  }
  return errors;
}

export function buildPushPayload(snapshot) {
  const graphId = snapshot?.id ?? null;
  const nodesInput = snapshot?.nodes;
  const nodes = Array.isArray(nodesInput) ? nodesInput : [];
  const edges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];

  const nodeInfos = nodes.map((node) => ({
    rawId: node?.id,
    name: typeof node?.name === 'string' ? node.name.trim() : '',
    type: typeof node?.type === 'string' ? node.type.trim() : '',
    label: node?.name || node?.id || 'unnamed',
  }));

  const idMap = new Map();
  if (graphId) {
    for (const info of nodeInfos) {
      if (info.rawId && info.name && info.type) idMap.set(info.rawId, nodeId(graphId, info.type, info.name));
    }
  }

  const errors = collectErrors(snapshot, nodesInput, nodeInfos, edges, idMap);
  if (errors.length) throw new Error(`graph.json is not uploadable:\n- ${errors.join('\n- ')}`);

  const posById = new Map();
  const outNodes = nodes.map((node, i) => {
    const { name, type } = nodeInfos[i];
    const id = nodeId(graphId, type, name);
    const position = node.position ?? { x: 0, y: 0 };
    posById.set(id, position);
    return {
      id,
      name,
      type,
      description: node.description ?? null,
      repoUrl: node.repoUrl ?? null,
      projectPath: node.projectPath ?? null,
      agentContext: node.agentContext ?? null,
      position,
      data: node.data ?? null,
      links: node.links ?? [],
    };
  });

  const seenEdgeIds = new Set();
  const outEdges = [];
  for (const edge of edges) {
    const sourceNodeId = idMap.get(edge.sourceNodeId);
    const targetNodeId = idMap.get(edge.targetNodeId);
    const id = edgeId(graphId, sourceNodeId, targetNodeId, edge.type);
    if (seenEdgeIds.has(id)) continue;
    seenEdgeIds.add(id);
    const { sourcePosition, targetPosition } = edgeAnchors(posById.get(sourceNodeId), posById.get(targetNodeId));
    outEdges.push({ id, sourceNodeId, targetNodeId, type: edge.type, sourcePosition, targetPosition });
  }

  return {
    graphId,
    nodes: outNodes,
    edges: outEdges,
    agentContext: snapshot.agentContext ?? null,
    scanPath: snapshot.scanPath ?? null,
  };
}
