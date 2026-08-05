# quasar-graph

A [Claude Code](https://claude.com/claude-code) plugin that turns a directory of projects into a living **architecture graph** — project and service nodes plus their databases, caches, queues, gateways, and third-party services, connected by dependency and ingress-route edges — and keeps that graph in sync with a quasar-graph backend.

Once a graph exists, the plugin uses it as a *map of your codebase*: answer cross-project questions, research code across many repositories, bind your current working project to its graph node, or clone an entire graph's projects onto a new machine.

## How it works

The scanner is implemented as **agent skills** (markdown instructions — no application code): Claude Code reads project manifests and config files, writes structured markdown per project, and a small bundled **Node.js MCP server** transforms the result into nodes/edges and uploads it to the backend.

Key design choices:

- **Config only, never source code.** The analyzer reads manifests (`package.json`, `pyproject.toml`, `go.mod`, …), `.env*` files (names only, never values), `docker-compose*.yml`, ORM configs, and the root `README.md`. Better to miss a dependency than to fabricate one.
- **Two edge layers.** Logical dependency edges (who calls / needs whom) are the source of truth; the gateway/ingress routing path (Traefik, nginx, …) is a separate, additive `routes` edge overlay — the two layers stay separable by edge type.
- **Deterministic ids.** Nodes and edges get UUIDv5 ids, so re-scans reuse the same ids and graph-owned fields (node positions, per-node agent instructions) survive across re-scans.
- **Human-in-the-loop.** The scan gates on your approval before deep analysis and again before upload, with an automated pre-upload review that flags likely mistakes (wrong-direction edges, misclassified resources, orphan nodes).
- **Offline-friendly.** Without the backend, a scan still produces a complete on-disk result you can inspect and upload later.

## Skills

| Command | What it does |
| --- | --- |
| `/quasar-graph:scan` | Scan a directory of projects and build/update a graph: catalog → deep analysis (parallel sub-agents) → resource aggregation → pre-upload review → upload. |
| `/quasar-graph:context` | Bind the **current working project** to its graph node (matched by git remote), then answer structural questions from the graph — who calls this service, what does it depend on, what routes traffic to it — and, with confirmation, look into dependent projects' code. |
| `/quasar-graph:research` | Graph-guided, read-only **code search across projects**: scope relevant nodes from the graph, auto-clone missing repos, dispatch per-project research sub-agents, and synthesize an answer with `file:line` references. |
| `/quasar-graph:clone` | Clone (and optionally install) all projects of a graph onto the local machine, with a deterministic clone plan (target paths, ssh/https, monorepo dedup). |
| `/quasar-graph:edit` | Edit an existing graph **without re-scanning**: pull the full snapshot, change positions, descriptions, agent context, nodes and edges in conversation, review a change summary, and push it back (full replace). |

Three internal skills (`analyze-project`, `research-project`, `install-project`) are dispatched by the orchestrators via sub-agents and are not meant to be invoked directly.

## The scan pipeline

1. **Phase 0 — Backend binding.** Pick the backend project and a new or existing graph. Skipped when the MCP server is unavailable (offline mode).
2. **Phase 1 — Catalog.** Glob marker files under the scan directory, classify each hit as a *project* or an *environment* (deployment/infra descriptor like a `devops/` compose tree), and stop at an approval gate where you adjust exclusions.
3. **Phase 2 — Deep analysis.** Sub-agents (batches of 3) analyze each project from its config files and write a `project.md` with machine-readable YAML frontmatter: language, framework, role, resources, env var names, and outbound connections.
4. **Phase 3 — Aggregate resources.** Dedupe resources across projects, classify them as self-hosted vs third-party, and write one file per resource. Per-node manifests materialize graph-owned fields (position, agent context) beside each markdown file for editing before upload.
5. **Phase 3.5 — Pre-upload review.** A read-only sub-agent reviews the whole assembled session and reports likely mistakes. Advisory only — you choose fix-first or upload-as-is.
6. **Phase 4 — Upload.** The MCP server transforms the session into nodes/edges and POSTs it to the backend, which fully replaces that project's graph. Scan-owned fields refresh every time; graph-owned fields are preserved.

Everything lands under `.quasar-graph/<session_id>/` in the invocation directory:

```
.quasar-graph/<session_id>/
  manifest.json                     # session control + backend binding
  graph/graph.json                  # downloaded snapshot (existing-graph mode)
  scan/
    projects/<name>/<name>.md       # one per scanned project
    projects/<name>/manifest.json   # graph-owned { id, position, agentContext }
    environments/<name>/<name>.md   # deployment/infra source (not a node)
    resources/<slug>/<slug>.md      # self-hosted resources
    third-party/<slug>/<slug>.md    # SaaS / external services
```

Scans are resumable: re-invoke with the same `session_id` and only pending entries are processed.

## Installation

Requires Claude Code and, for backend sync, Node.js ≥ 20 (the MCP server ships as a committed esbuild bundle, so no `npm install` is needed at install time).

Add the repo as a plugin marketplace and install the plugin:

```
/plugin marketplace add o-samoilov/quasar-graph
/plugin install quasar-graph@quasar-graph
```

The plugin needs no configuration at install time: the MCP server receives the backend URL (`https://api.quasar-graph.com`) as `QUASAR_BACKEND_URL` from `plugin.json`.

### Authentication

The MCP server authenticates to the backend as an OAuth 2.1 public client (Authorization Code + PKCE with a loopback redirect). Run the `login` tool once — it opens your browser; the refresh token is stored in `~/.quasar-graph/tokens.json` (mode 0600), while short-lived access tokens live only in process memory. `whoami` shows the current session and `logout` revokes and deletes local credentials.

Local preferences (projects root, clone protocol) live in `~/.quasar-graph/config.json`; regenerable derived state (project↔graph bindings) lives under `~/.quasar-graph/cache/`.

## MCP server

The bundled server (`mcp/`) exposes the tools the skills orchestrate: `login`, `whoami`, `logout`, `list_projects`, `list_graphs`, `create_graph`, `get_graph`, `pull_graph`, `write_node_manifests`, `build_graph`, `push_graph`, and `plan_clone`. It talks to the backend at `${QUASAR_BACKEND_URL}/api/v1/*`.

> The quasar-graph backend and frontend are separate applications and are not part of this repository — this repo implements the scanner skills plus the MCP client that reads from / syncs to that backend.

## Development

The skills are markdown and have no build step. The MCP server does:

```bash
cd mcp
npm install
npm test        # Node's built-in test runner, suites under mcp/test/
npm run build   # regenerates the committed bundle mcp/dist/index.js
```

The plugin runs the **bundled** `mcp/dist/index.js`, so rebuild after editing `mcp/src/` or `mcp/index.js`. See `docs/Setup.md` for the release flow and `references/` for how the skills' harness-agnostic action vocabulary maps onto concrete harness tools (useful when porting the skills beyond Claude Code).

## License

[MIT](LICENSE)
