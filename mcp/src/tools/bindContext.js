import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { isCodeNode } from '../transform/kinds.js';
import { normalizeRepoUrl } from '../transform/repoUrl.js';
import { loadBindings, saveBindings, upsertEntry } from '../bindings.js';
import { LoginRequiredError } from '../auth/errors.js';

function defaultInspect(path) {
  return existsSync(path);
}

function isSameOrAncestor(dir, target) {
  return target === dir || target.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
}

function matchCacheEntries(entries, baseDir, targetDir) {
  const byPath = entries.filter(
    (e) => e.project_path && isSameOrAncestor(join(baseDir, e.project_path), targetDir),
  );
  if (byPath.length > 0) return byPath;
  if (entries.length === 1 && !entries[0].project_path) return entries;
  return [];
}

function findNode(graph, nodeName) {
  return (graph.nodes ?? []).find((n) => isCodeNode(n) && n.name === nodeName);
}

function describeNeighbor(node, baseDir, inspect) {
  const base = { name: node.name, type: node.type, description: node.description ?? null };
  if (!isCodeNode(node)) {
    return { ...base, data: node.data ?? null, links: node.links ?? [], availability: 'resource' };
  }
  const repoUrl = node.repoUrl ?? null;
  if (node.projectPath && !isAbsolute(node.projectPath)) {
    const localPath = join(baseDir, node.projectPath);
    if (inspect(localPath)) return { ...base, local_path: localPath, availability: 'local' };
    return { ...base, local_path: localPath, repoUrl, availability: repoUrl ? 'cloneable' : 'unavailable' };
  }
  return { ...base, repoUrl, availability: repoUrl ? 'cloneable' : 'unavailable' };
}

function assembleBound({ resolvedVia, url, staleRemoved, graph, projectId, node, baseDir, inspect }) {
  const byId = new Map((graph.nodes ?? []).map((n) => [n.id, n]));
  const outbound = [];
  const inbound = [];
  const neighborIds = new Set();
  for (const edge of graph.edges ?? []) {
    if (edge.sourceNodeId === node.id) {
      const peer = byId.get(edge.targetNodeId);
      if (peer) {
        outbound.push({ type: edge.type, to: { name: peer.name, type: peer.type } });
        neighborIds.add(peer.id);
      }
    } else if (edge.targetNodeId === node.id) {
      const peer = byId.get(edge.sourceNodeId);
      if (peer) {
        inbound.push({ type: edge.type, from: { name: peer.name, type: peer.type } });
        neighborIds.add(peer.id);
      }
    }
  }
  return {
    status: 'bound',
    resolved_via: resolvedVia,
    normalized_url: url,
    stale_entries_removed: staleRemoved,
    node,
    graph: { graph_id: graph.id, graph_name: graph.name, project_id: projectId ?? null },
    edges: { outbound, inbound },
    neighbors: [...neighborIds].map((id) => describeNeighbor(byId.get(id), baseDir, inspect)),
  };
}

function persistBinding({ home, bindings, url, node, projectId, graphId, dropEntries = [] }) {
  const kept = (bindings[url] ?? []).filter((e) => !dropEntries.includes(e));
  const entry = {
    node_name: node.name,
    ...(node.projectPath && !isAbsolute(node.projectPath) ? { project_path: node.projectPath } : {}),
    project_id: projectId ?? null,
    graph_id: graphId,
  };
  bindings[url] = upsertEntry(kept, entry);
  saveBindings(bindings, home);
}

async function searchCandidates(client, url) {
  const projects = await client.listProjects();
  const graphLists = await Promise.all(projects.map((p) => client.listGraphs(p.id)));
  const refs = projects.flatMap((p, i) => (graphLists[i] ?? []).map((g) => ({ project: p, graphId: g.id })));
  const results = await Promise.allSettled(refs.map((r) => client.getGraph(r.graphId)));
  const candidates = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      if (result.reason instanceof LoginRequiredError) throw result.reason;
      return;
    }
    const graph = result.value;
    for (const node of graph.nodes ?? []) {
      if (!node.repoUrl || normalizeRepoUrl(node.repoUrl) !== url) continue;
      candidates.push({ project: refs[i].project, graph, node });
    }
  });
  return candidates;
}

export async function bindContext(
  { remoteUrl, targetDir, baseDir, choice },
  { client, home = homedir(), inspect = defaultInspect },
) {
  if (!remoteUrl) throw new Error('remote_url is required (output of `git remote get-url origin`).');
  if (!targetDir || !isAbsolute(targetDir)) {
    throw new Error('target_dir is required and must be an absolute path.');
  }
  if (!baseDir || !isAbsolute(baseDir)) {
    throw new Error('base_dir is required and must be an absolute path.');
  }

  const url = normalizeRepoUrl(remoteUrl);
  const bindings = loadBindings(home);
  const entries = bindings[url] ?? [];
  const matched = matchCacheEntries(entries, baseDir, targetDir);

  if (choice) {
    const graph = await client.getGraph(choice.graph_id);
    const node = findNode(graph, choice.node_name);
    if (!node) {
      throw new Error(
        `Node "${choice.node_name}" not found in graph ${choice.graph_id}. Re-run bind_context without choice.`,
      );
    }
    persistBinding({
      home, bindings, url, node,
      projectId: choice.project_id ?? null,
      graphId: choice.graph_id,
      dropEntries: matched,
    });
    return assembleBound({
      resolvedVia: 'choice', url, staleRemoved: 0, graph,
      projectId: choice.project_id ?? null, node, baseDir, inspect,
    });
  }

  let staleRemoved = 0;
  const validated = [];
  for (const entry of matched) {
    let graph;
    try {
      graph = await client.getGraph(entry.graph_id);
    } catch (err) {
      if (err instanceof LoginRequiredError) throw err;
      graph = null;
    }
    const node = graph ? findNode(graph, entry.node_name) : null;
    if (node) {
      validated.push({ entry, graph, node });
    } else {
      bindings[url] = (bindings[url] ?? []).filter((e) => e !== entry);
      staleRemoved += 1;
    }
  }
  if (staleRemoved > 0) saveBindings(bindings, home);

  if (validated.length === 1) {
    const { entry, graph, node } = validated[0];
    return assembleBound({
      resolvedVia: 'cache', url, staleRemoved, graph,
      projectId: entry.project_id, node, baseDir, inspect,
    });
  }
  if (validated.length > 1) {
    return {
      status: 'ambiguous',
      normalized_url: url,
      candidates: validated.map(({ entry, graph, node }) => ({
        node_name: node.name,
        node_description: node.description ?? null,
        project_path: node.projectPath ?? null,
        graph_id: graph.id,
        graph_name: graph.name,
        project_id: entry.project_id ?? null,
      })),
    };
  }

  const candidates = await searchCandidates(client, url);
  if (candidates.length === 0) return { status: 'not_found', normalized_url: url };

  let picked = candidates;
  if (candidates.length > 1) {
    const byPath = candidates.filter(
      (c) =>
        c.node.projectPath &&
        !isAbsolute(c.node.projectPath) &&
        isSameOrAncestor(join(baseDir, c.node.projectPath), targetDir),
    );
    if (byPath.length > 0) picked = byPath;
  }

  if (picked.length > 1) {
    return {
      status: 'ambiguous',
      normalized_url: url,
      candidates: picked.map((c) => ({
        node_name: c.node.name,
        node_description: c.node.description ?? null,
        project_path: c.node.projectPath ?? null,
        graph_id: c.graph.id,
        graph_name: c.graph.name,
        project_id: c.project.id,
      })),
    };
  }

  const { project, graph, node } = picked[0];
  persistBinding({ home, bindings, url, node, projectId: project.id, graphId: graph.id });
  return assembleBound({
    resolvedVia: 'search', url, staleRemoved, graph,
    projectId: project.id, node, baseDir, inspect,
  });
}
