const SCALAR_FIELDS = ['description', 'repoUrl', 'projectPath'];

function isMissing(value) {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
}

function fillNode(node, previous) {
  const merged = { ...node };
  let filled = 0;
  for (const field of SCALAR_FIELDS) {
    if (isMissing(merged[field]) && !isMissing(previous[field])) {
      merged[field] = previous[field];
      filled += 1;
    }
  }
  if (previous.data && typeof previous.data === 'object') {
    const data = { ...(merged.data ?? {}) };
    for (const [key, value] of Object.entries(previous.data)) {
      if (isMissing(data[key]) && !isMissing(value)) {
        data[key] = value;
        filled += 1;
      }
    }
    merged.data = data;
  }
  const freshLinks = Array.isArray(merged.links) ? merged.links : [];
  const freshUrls = new Set(freshLinks.map((l) => l?.url));
  const inherited = (previous.links ?? []).filter((l) => l?.url && !freshUrls.has(l.url));
  if (inherited.length > 0) {
    merged.links = [...freshLinks, ...inherited];
    filled += inherited.length;
  }
  return { node: merged, filled };
}

export function fillMissingNodeFields(nodes, previousById) {
  if (!previousById || previousById.size === 0) return { nodes, backfilled: 0 };
  let backfilled = 0;
  const merged = nodes.map((node) => {
    const previous = previousById.get(node.id);
    if (!previous) return node;
    const result = fillNode(node, previous);
    backfilled += result.filled;
    return result.node;
  });
  return { nodes: merged, backfilled };
}
