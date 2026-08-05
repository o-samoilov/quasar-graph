import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDoc, firstParagraph } from './markdown.js';

function readProject(sessionDir, entry) {
  const name = entry.name;
  const path = join(sessionDir, 'scan', 'projects', name, `${name}.md`);
  if (!existsSync(path)) return null;
  const { data, content } = parseDoc(path);
  return {
    name,
    language: data.language ?? null,
    framework: data.framework ?? null,
    role: data.role ?? null,
    port: data.port ?? null,
    packageName: data.package_name ?? null,
    adminUrl: data.admin_url ?? null,
    links: Array.isArray(data.links)
      ? data.links.filter((l) => l && l.name && l.url).map((l) => ({ name: l.name, url: l.url }))
      : [],
    description: firstParagraph(content),
    projectPath: entry.path ?? null,
    repoUrl: entry.repo_url ?? null,
    connections: Array.isArray(data.connections) ? data.connections : [],
  };
}

function readResourceDir(sessionDir, folder, selfHosted) {
  const base = join(sessionDir, 'scan', folder);
  if (!existsSync(base)) return [];
  const out = [];
  for (const slug of readdirSync(base)) {
    const path = join(base, slug, `${slug}.md`);
    if (!existsSync(path)) continue;
    const { data, content } = parseDoc(path);
    out.push({
      slug,
      kind: data.kind ?? null,
      type: data.type ?? null,
      host: data.host ?? data.hostname ?? null,
      port: data.port ?? null,
      engine: data.engine ?? data.type ?? null,
      adminUrl: data.admin_url ?? null,
      links: Array.isArray(data.links)
        ? data.links.filter((l) => l && l.name && l.url).map((l) => ({ name: l.name, url: l.url }))
        : [],
      description: firstParagraph(content),
      selfHosted,
      consumers: (Array.isArray(data.consumers) ? data.consumers : []).map((c) => ({
        project: c.project,
        env: c.env,
        role: c.role,
      })),
      routes: (Array.isArray(data.routes) ? data.routes : [])
        .map((r) => (typeof r === 'string' ? { to: r } : { to: r.to, type: r.type }))
        .filter((r) => r.to),
    });
  }
  return out;
}

export function readSession(sessionDir, scanDir) {
  const manifestPath = join(sessionDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No manifest.json in ${sessionDir}. Run the scan first.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const projects = (manifest.projects ?? [])
    .filter((p) => p.status === 'done')
    .map((p) => readProject(sessionDir, p))
    .filter(Boolean);
  const resources = [
    ...readResourceDir(sessionDir, 'resources', true),
    ...readResourceDir(sessionDir, 'third-party', false),
  ];
  return {
    scanDir: scanDir ?? manifest.scan_dir,
    backend: manifest.backend ?? null,
    projects,
    resources,
  };
}
