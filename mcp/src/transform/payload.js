import { buildNodes } from './nodes.js';
import { buildEdges } from './edges.js';
import { applyLayout } from './layout.js';
import { nodeId, edgeId } from './ids.js';

export function edgeAnchors(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourcePosition: 'right', targetPosition: 'left' }
      : { sourcePosition: 'left', targetPosition: 'right' };
  }
  return dy >= 0
    ? { sourcePosition: 'bottom', targetPosition: 'top' }
    : { sourcePosition: 'top', targetPosition: 'bottom' };
}

export function buildScanPayload({ graphId, session }) {
  const built = buildNodes(session);
  const nodeKeys = new Set(built.map((n) => n.key));
  const keyEdges = buildEdges(session, nodeKeys);
  const laidOut = applyLayout(built, keyEdges);

  const keyToId = new Map();
  const posById = new Map();
  const nodes = laidOut.map((n) => {
    const id = nodeId(graphId, n.type, n.name);
    keyToId.set(n.key, id);
    posById.set(id, n.position);
    return {
      id,
      name: n.name,
      type: n.type,
      description: n.description ?? null,
      repoUrl: n.repoUrl ?? null,
      projectPath: n.projectPath ?? null,
      agentContext: n.agentContext ?? null,
      position: n.position,
      data: n.data ?? null,
      links: n.links ?? [],
    };
  });

  const edges = [];
  for (const e of keyEdges) {
    const sourceNodeId = keyToId.get(e.source);
    const targetNodeId = keyToId.get(e.target);
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) continue;
    const { sourcePosition, targetPosition } = edgeAnchors(
      posById.get(sourceNodeId),
      posById.get(targetNodeId),
    );
    edges.push({
      id: edgeId(graphId, sourceNodeId, targetNodeId, e.type),
      sourceNodeId,
      targetNodeId,
      type: e.type,
      sourcePosition,
      targetPosition,
    });
  }

  return { graphId, nodes, edges };
}
