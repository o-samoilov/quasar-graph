import { mapKindToType, mapRoleToType } from './kinds.js';
import { nodeKey } from './key.js';

export function buildEdges(session, nodeKeys) {
  const edges = [];
  const seen = new Set();
  const add = (source, target, type) => {
    if (!nodeKeys.has(source) || !nodeKeys.has(target)) return;
    const dedupKey = `${source}|${target}|${type}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    edges.push({ source, target, type });
  };

  const projectType = new Map(session.projects.map((p) => [p.name, mapRoleToType(p.role)]));
  const projectKey = (name) => nodeKey(projectType.get(name) ?? 'project', name);

  const resourceKeyBySlug = new Map(
    session.resources.map((r) => [r.slug, nodeKey(mapKindToType(r.kind), r.slug)]),
  );
  const resolveTarget = (name) =>
    projectType.has(name) ? projectKey(name) : (resourceKeyBySlug.get(name) ?? null);

  for (const p of session.projects) {
    for (const c of p.connections ?? []) {
      add(projectKey(p.name), projectKey(c.project), c.via ?? 'connection');
    }
  }

  for (const r of session.resources) {
    const resourceKey = nodeKey(mapKindToType(r.kind), r.slug);
    for (const c of r.consumers ?? []) {
      add(projectKey(c.project), resourceKey, c.role ?? r.kind ?? 'uses');
    }
    for (const route of r.routes ?? []) {
      const target = resolveTarget(route.to);
      if (target) add(resourceKey, target, route.type ?? 'routes');
    }
  }

  return edges;
}
