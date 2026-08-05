import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readSession } from '../read/session.js';
import { nodeId } from '../transform/ids.js';
import { mapKindToType, mapRoleToType } from '../transform/kinds.js';

function snapshotOverlay(sessionDir) {
  const path = join(sessionDir, 'graph', 'graph.json');
  const map = new Map();
  if (!existsSync(path)) return map;
  const graph = JSON.parse(readFileSync(path, 'utf8'));
  for (const n of graph.nodes ?? []) {
    if (!n || !n.id) continue;
    const overlay = {};
    if (n.position != null) overlay.position = n.position;
    if (n.agentContext != null) overlay.agentContext = n.agentContext;
    map.set(n.id, overlay);
  }
  return map;
}

function writeNodeManifest(folderPath, id, snapshot = {}) {
  const path = join(folderPath, 'manifest.json');
  let position = snapshot.position ?? null;
  let agentContext = snapshot.agentContext ?? null;
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, 'utf8'));
    if (existing && existing.position != null) position = existing.position;
    if (existing && existing.agentContext != null) agentContext = existing.agentContext;
  }
  const out = { id };
  if (position != null) out.position = position;
  if (agentContext != null) out.agentContext = agentContext;
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(path, JSON.stringify(out, null, 2));
}

export function writeNodeManifests({ sessionDir, graphId }) {
  const session = readSession(sessionDir);
  const resolvedGraphId = graphId ?? session.backend?.graph_id;
  if (!resolvedGraphId) {
    throw new Error('graph_id missing from manifest.backend. Bind the session (Phase 0) first.');
  }
  const overlay = snapshotOverlay(sessionDir);
  let written = 0;

  for (const p of session.projects) {
    const id = nodeId(resolvedGraphId, mapRoleToType(p.role), p.name);
    writeNodeManifest(join(sessionDir, 'scan', 'projects', p.name), id, overlay.get(id));
    written++;
  }
  for (const r of session.resources) {
    const type = mapKindToType(r.kind);
    const id = nodeId(resolvedGraphId, type, r.slug);
    const folder = r.selfHosted ? 'resources' : 'third-party';
    writeNodeManifest(join(sessionDir, 'scan', folder, r.slug), id, overlay.get(id));
    written++;
  }
  return { written };
}
