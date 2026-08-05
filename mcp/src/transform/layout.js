import dagre from '@dagrejs/dagre';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

export function applyLayout(nodes, edges = []) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 160, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) g.setNode(n.key, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const { x, y } = g.node(n.key);
    return {
      ...n,
      position: { x: Math.round(x - NODE_WIDTH / 2), y: Math.round(y - NODE_HEIGHT / 2) },
    };
  });
}
