import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readSession } from '../read/session.js';
import { readPersistentNodes, readPreviousNodes, readGraphAgentContext } from '../read/persistentNodes.js';
import { buildScanPayload } from '../transform/payload.js';
import { applyPersistentOverrides } from '../transform/persistent.js';
import { fillMissingNodeFields } from '../transform/fillMissing.js';
import { relativeToBase } from '../transform/relativePath.js';

export function buildGraph({ sessionDir, graphId }) {
  const session = readSession(sessionDir);
  const resolvedGraphId = graphId ?? session.backend?.graph_id;
  if (!resolvedGraphId) {
    throw new Error(
      'graph_id missing from manifest.backend. Select or create a backend graph (Phase 0) first.',
    );
  }

  const payload = buildScanPayload({ graphId: resolvedGraphId, session });
  const { nodes: filledNodes, backfilled } = fillMissingNodeFields(
    payload.nodes,
    readPreviousNodes(sessionDir),
  );
  const snapshot = {
    id: resolvedGraphId,
    agentContext: readGraphAgentContext(sessionDir),
    scanPath: relativeToBase(homedir(), session.scanDir ?? null),
    nodes: applyPersistentOverrides(filledNodes, readPersistentNodes(sessionDir)),
    edges: payload.edges,
  };

  const graphDir = join(sessionDir, 'graph');
  mkdirSync(graphDir, { recursive: true });
  const path = join(graphDir, 'graph.json');
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
  return {
    graphId: resolvedGraphId,
    path,
    nodes: snapshot.nodes.length,
    edges: snapshot.edges.length,
    backfilled,
  };
}
