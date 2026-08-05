import { mapKindToType, mapRoleToType } from './kinds.js';
import { nodeKey } from './key.js';
import { normalizeRepoUrl } from './repoUrl.js';
import { relativeToBase } from './relativePath.js';

function projectNode(p, scanDir) {
  const technologies = [p.language, p.framework].filter(Boolean);
  const type = mapRoleToType(p.role);
  const data =
    type === 'service'
      ? { technologies, port: p.port ?? null }
      : type === 'library'
        ? { technologies, packageName: p.packageName ?? null }
        : { technologies };
  const links = Array.isArray(p.links) ? [...p.links] : [];
  if (p.adminUrl && !links.some((l) => l.url === p.adminUrl)) {
    links.push({ name: 'Admin Panel', url: p.adminUrl });
  }
  return {
    key: nodeKey(type, p.name),
    type,
    name: p.name,
    description: p.description ?? null,
    repoUrl: normalizeRepoUrl(p.repoUrl ?? null),
    projectPath: relativeToBase(scanDir, p.projectPath ?? null),
    data,
    links,
  };
}

const ENGINE_TYPES = new Set(['database', 'cache', 'queue', 'storage', 'search', 'realtime']);

function resourceNode(r) {
  const type = mapKindToType(r.kind);
  const data = ENGINE_TYPES.has(type)
    ? { engine: r.engine || r.type || null, port: r.port ?? null }
    : { hostname: r.host || null };
  const links = Array.isArray(r.links) ? [...r.links] : [];
  if (r.adminUrl && !links.some((l) => l.url === r.adminUrl)) {
    links.push({ name: 'Admin Panel', url: r.adminUrl });
  }
  return {
    key: nodeKey(type, r.slug),
    type,
    name: r.slug,
    description: r.description ?? null,
    data,
    links,
  };
}

export function buildNodes(session) {
  const nodes = [];
  for (const p of session.projects) nodes.push(projectNode(p, session.scanDir));
  for (const r of session.resources) nodes.push(resourceNode(r));
  return nodes;
}
