const OVERLAY_FIELDS = ['position', 'agentContext'];

export function applyPersistentOverrides(nodes, overridesById, fields = OVERLAY_FIELDS) {
  if (!overridesById || overridesById.size === 0) return nodes;
  return nodes.map((node) => {
    const override = overridesById.get(node.id);
    if (!override) return node;
    const merged = { ...node };
    for (const field of fields) {
      if (override[field] !== undefined && override[field] !== null) {
        merged[field] = override[field];
      }
    }
    return merged;
  });
}
