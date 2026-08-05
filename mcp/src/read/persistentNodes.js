import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function readSnapshot(sessionDir, map) {
  const path = join(sessionDir, 'graph', 'graph.json');
  if (!existsSync(path)) return;
  const graph = JSON.parse(readFileSync(path, 'utf8'));
  for (const n of graph.nodes ?? []) {
    if (n && n.id) map.set(n.id, { position: n.position ?? null, agentContext: n.agentContext ?? null });
  }
}

function readFolderManifests(sessionDir, map) {
  for (const folder of ['projects', 'resources', 'third-party']) {
    const base = join(sessionDir, 'scan', folder);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(base, entry.name, 'manifest.json');
      if (!existsSync(path)) continue;
      const node = JSON.parse(readFileSync(path, 'utf8'));
      if (node && node.id) {
        map.set(node.id, { position: node.position ?? null, agentContext: node.agentContext ?? null });
      }
    }
  }
}

export function readPersistentNodes(sessionDir) {
  const map = new Map();
  readSnapshot(sessionDir, map);
  readFolderManifests(sessionDir, map);
  return map;
}

export function readPreviousNodes(sessionDir) {
  const map = new Map();
  const path = join(sessionDir, 'graph', 'graph.json');
  if (!existsSync(path)) return map;
  const graph = JSON.parse(readFileSync(path, 'utf8'));
  for (const n of graph.nodes ?? []) {
    if (n && n.id) map.set(n.id, n);
  }
  return map;
}

export function readGraphAgentContext(sessionDir) {
  const path = join(sessionDir, 'graph', 'graph.json');
  if (!existsSync(path)) return null;
  const graph = JSON.parse(readFileSync(path, 'utf8'));
  return graph.agentContext ?? null;
}
