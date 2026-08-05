import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function pullGraph({ sessionDir, graphId }, { client }) {
  if (!graphId) {
    throw new Error('graph_id is required. Pick a graph via list_graphs first.');
  }
  const graph = await client.getGraph(graphId);
  const graphDir = join(sessionDir, 'graph');
  mkdirSync(graphDir, { recursive: true });
  writeFileSync(join(graphDir, 'graph.json'), JSON.stringify(graph, null, 2));
  return { graphId, nodesWritten: (graph.nodes ?? []).length };
}
