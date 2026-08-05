import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { isCodeNode } from '../transform/kinds.js';
import { normalizeRepoUrl, denormalizeRepoUrl } from '../transform/repoUrl.js';

function commonPathPrefix(paths) {
  if (paths.length === 0) return '';
  const split = paths.map((p) => p.split('/'));
  const first = split[0];
  const prefix = [];
  for (let i = 0; i < first.length; i++) {
    const seg = first[i];
    if (split.every((s) => s[i] === seg)) prefix.push(seg);
    else break;
  }
  return prefix.join('/');
}

function defaultInspect(targetPath) {
  if (!existsSync(targetPath)) return { exists: false, isGitRepo: false, remoteUrl: null };
  try {
    const out = execFileSync('git', ['-C', targetPath, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return { exists: true, isGitRepo: out.length > 0, remoteUrl: out || null };
  } catch {
    return { exists: true, isGitRepo: false, remoteUrl: null };
  }
}

export async function planClone({ graphId, baseDir, protocol = 'ssh' }, { client, inspect = defaultInspect }) {
  if (!graphId) throw new Error('graph_id is required. Pick a graph via list_graphs first.');
  if (!baseDir || !isAbsolute(baseDir)) {
    throw new Error('base_dir is required and must be an absolute path.');
  }
  const proto = protocol === 'https' ? 'https' : 'ssh';

  const graph = await client.getGraph(graphId);
  const nodes = graph.nodes ?? [];

  const skipped = [];
  const deployable = [];
  for (const n of nodes) {
    if (!isCodeNode(n)) {
      skipped.push({ name: n.name, reason: `not a code node (type: ${n.type})` });
    } else if (!n.repoUrl) {
      skipped.push({ name: n.name, reason: 'no repoUrl (project has no git remote)' });
    } else if (!n.projectPath) {
      skipped.push({ name: n.name, reason: 'no projectPath' });
    } else if (isAbsolute(n.projectPath)) {
      skipped.push({
        name: n.name,
        reason: `absolute projectPath (${n.projectPath}) cannot be rebased onto base_dir`,
      });
    } else {
      deployable.push(n);
    }
  }

  const groups = new Map();
  for (const n of deployable) {
    const canonicalUrl = normalizeRepoUrl(n.repoUrl);
    const g = groups.get(canonicalUrl) ?? { repoUrl: canonicalUrl, paths: [], names: [], contexts: [] };
    g.paths.push(n.projectPath);
    g.names.push(n.name);
    g.contexts.push({ name: n.name, agentContext: n.agentContext ?? null });
    groups.set(canonicalUrl, g);
  }

  const entries = [];
  for (const g of groups.values()) {
    const cloneUrl = denormalizeRepoUrl(g.repoUrl, proto);
    const contextField =
      g.contexts.length === 1
        ? { agentContext: g.contexts[0].agentContext }
        : { agentContexts: g.contexts };
    const pathsField =
      g.paths.length === 1 ? {} : { containedPaths: g.paths.map((p) => join(baseDir, p)) };

    const relPath = g.paths.length === 1 ? g.paths[0] : commonPathPrefix(g.paths);
    if (!relPath) {
      entries.push({
        repoUrl: cloneUrl,
        targetPath: null,
        action: 'skip',
        reason: 'projects from this repo share no common path prefix; cannot pick a clone target',
        containedProjects: g.names,
        ...pathsField,
        ...contextField,
      });
      continue;
    }

    const targetPath = join(baseDir, relPath);
    const info = inspect(targetPath);
    let action;
    let reason;
    if (!info.exists) {
      action = 'clone';
    } else if (info.isGitRepo && info.remoteUrl && normalizeRepoUrl(info.remoteUrl) === g.repoUrl) {
      action = 'pull';
    } else {
      action = 'skip';
      reason = info.isGitRepo
        ? 'directory exists with a different or missing git remote'
        : 'directory exists and is not a git repo';
    }

    entries.push({
      repoUrl: cloneUrl,
      targetPath,
      action,
      ...(reason ? { reason } : {}),
      containedProjects: g.names,
      ...pathsField,
      ...contextField,
    });
  }

  return { baseDir, protocol: proto, entries, skipped };
}
