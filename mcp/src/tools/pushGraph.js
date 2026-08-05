import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildPushPayload } from '../transform/pushPayload.js';

export async function pushGraph({ sessionDir }, { client }) {
  if (!sessionDir) throw new Error('session_dir is required.');
  const snapshotPath = join(sessionDir, 'graph', 'graph.json');
  if (!existsSync(snapshotPath)) {
    throw new Error(
      `graph/graph.json not found under ${sessionDir}. Run build_graph (scan flow) or pull_graph (edit flow) first, then retry.`,
    );
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const payload = buildPushPayload(snapshot);
  const backend = await client.scan(payload);
  return {
    graphId: payload.graphId,
    nodesPushed: payload.nodes.length,
    edgesPushed: payload.edges.length,
    backend: backend ?? null,
  };
}
