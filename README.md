# quasar-graph

A [Claude Code](https://claude.com/claude-code) plugin that turns a directory of projects into a living **architecture graph** — project and service nodes plus their databases, caches, queues, gateways, and third-party services, connected by dependency and ingress-route edges. The graph lives at [quasar-graph.com](https://quasar-graph.com): explore it in the web client, inspect any node, arrange the layout, share a deep link with a teammate.

Once a graph exists, the plugin uses it as a *map of your codebase*: answer cross-project questions, research code across many repositories, bind your current working project to its graph node, or clone an entire graph's projects onto a new machine.

## Install

```
/plugin marketplace add o-samoilov/quasar-graph
/plugin install quasar-graph@quasar-graph
```

Requires Claude Code and Node.js ≥ 20 for the bundled MCP server (a committed esbuild bundle — no `npm install`, no configuration). The first backend call opens your browser to sign in with your [quasar-graph.com](https://quasar-graph.com) account. Every skill that talks to the backend needs the server; only `scan` can run without it, keeping its result on disk for a later upload. Details: [installation docs](https://quasar-graph.com/docs/getting-started/install-mcp-plugin).

## Skills

| Command | What it does |
| --- | --- |
| `/quasar-graph:scan` | Scan a directory of projects and build/update a graph: catalog → deep analysis (parallel sub-agents) → resource aggregation → pre-upload review → upload. |
| `/quasar-graph:context` | Bind the **current working project** to its graph node (matched by git remote), then answer structural questions from the graph — who calls this service, what does it depend on, what routes traffic to it — and, with confirmation, look into dependent projects' code. |
| `/quasar-graph:research` | Graph-guided, read-only **code search across projects**: scope relevant nodes from the graph, auto-clone missing repos, dispatch per-project research sub-agents, and synthesize an answer with `file:line` references. |
| `/quasar-graph:clone` | Clone (and optionally install) all projects of a graph onto the local machine, with a deterministic clone plan (target paths, ssh/https, monorepo dedup). |
| `/quasar-graph:edit` | Edit an existing graph **without re-scanning**: pull the full snapshot, change positions, descriptions, agent context, nodes and edges in conversation, review a change summary, and push it back (full replace). |

Three internal skills (`analyze-project`, `research-project`, `install-project`) are dispatched by the orchestrators via sub-agents and are not meant to be invoked directly.

## How it works

The scanner is **agent skills** (markdown instructions — no application code): Claude Code reads project manifests and config files, writes structured markdown per project, and a small bundled **Node.js MCP server** (`mcp/`) transforms the result into nodes/edges and syncs it with the backend.

- **Config only, never source code.** The analyzer reads manifests, `.env*` files (names only, never values), compose files, ORM configs, and the root `README.md`. Better to miss a dependency than to fabricate one.
- **Two edge layers.** Logical dependency edges (who calls / needs whom) are the source of truth; the gateway/ingress routing path (Traefik, nginx, …) is a separate, additive `routes` overlay.
- **Deterministic ids.** Nodes and edges get UUIDv5 ids, so re-scans reuse the same ids and graph-owned fields (node positions, per-node agent instructions) survive.
- **Human-in-the-loop.** The scan gates on your approval before deep analysis and again before upload, with an automated pre-upload review that flags likely mistakes.

Full scan flow, phase by phase: [scan docs](https://quasar-graph.com/docs/agent-skills/scan).

## Links

- **Web client** — [quasar-graph.com](https://quasar-graph.com): browse and arrange graphs, share deep links across workspaces.
- **Documentation** — [quick start](https://quasar-graph.com/docs/getting-started/quick-start) · [agent skills](https://quasar-graph.com/docs/agent-skills/scan) · [workspaces and roles](https://quasar-graph.com/docs/workspaces/projects-and-graphs).
- **MCP server** — tools, configuration, release flow, backend contract: [`mcp/README.md`](mcp/README.md).

The quasar-graph backend and web client are separate applications and are not part of this repository — this repo implements the scanner skills plus the MCP client that syncs with them.

## Development

The skills are markdown and have no build step. The MCP server does:

```bash
cd mcp
npm install
npm test        # Node's built-in test runner, suites under mcp/test/
npm run build   # regenerates the committed bundle mcp/dist/index.js
```

The plugin runs the **bundled** `mcp/dist/index.js`, so rebuild after editing `mcp/src/` or `mcp/index.js`. See `references/` for how the skills' harness-agnostic action vocabulary maps onto concrete harness tools (useful when porting the skills beyond Claude Code).

## License

[MIT](LICENSE)
