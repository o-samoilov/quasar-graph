# quasar-graph MCP server

Bundled MCP server for the `quasar-graph` plugin. Reads a scan session, transforms
it into a project's graph (nodes/edges with deterministic UUIDs), and uploads via
`POST /api/v1/scan`, which fully replaces the graph contents.

## Tools

- `login()` — interactive OAuth login (Authorization Code + PKCE, loopback redirect);
  stores the refresh token in `~/.quasar-graph/tokens.json`. Call when another
  tool fails with "Not authenticated", then retry.
- `whoami()` — report auth state: `{ logged_in, backend_url, user_id, email, token_expires_at }`.
  Performs a silent refresh, so `logged_in: true` means the session actually works;
  not being logged in is a normal response, not an error.
- `logout()` — revoke the refresh token on the backend (best-effort) and delete the
  local credentials. Idempotent; returns `{ logged_out, revoked }`.
- `list_sessions({ cwd })` — list local scan sessions under `<cwd>/.quasar-graph/`,
  newest first, each with its bound graph, `scan_dir` and done/pending/skipped counts.
  Local-only and read-only; no backend call, no authentication.
- `list_projects()` — list backend projects; pick which one to upload a scan into.
- `list_workspaces()` — list the workspaces the user belongs to (id, name, role);
  every backend project lives in a workspace.
- `list_graphs({ project_id? })` — list graphs, optionally filtered to one project.
- `create_project({ name, description?, workspace_id? })` — create a backend project
  in a workspace; when `workspace_id` is omitted and the user has exactly one
  workspace, it is resolved automatically.
- `create_graph({ project_id, name })` — create a new empty graph for a project.
- `get_graph({ graph_id })` — fetch one graph with nodes and edges.
- `pull_graph({ session_dir, graph_id })` — download an existing graph's full snapshot
  into `<session_dir>/graph/graph.json`, so a re-scan preserves graph-owned fields.
- `write_node_manifests({ session_dir, graph_id? })` — Phase 3 tail, local-only: compute
  each node id and write a per-node `manifest.json` (`{ id, position, agentContext }`)
  beside each project/resource `.md`. Idempotent; an on-disk edit wins over the snapshot.
- `build_graph({ session_dir, graph_id? })` — assemble a completed scan session into
  `<session_dir>/graph/graph.json` (deterministic ids, persistent-field overlay); upload it
  with `push_graph`.
- `push_graph({ session_dir })` — read `<session_dir>/graph/graph.json` (assembled by
  `build_graph` or pulled and edited), validate it, recompute deterministic ids, and POST
  it to the backend `/scan` endpoint, which fully replaces the graph contents.
- `plan_clone({ graph_id, base_dir, protocol? })` — read-only clone plan for a graph:
  target paths under `base_dir`, ssh/https URL, monorepo dedup, clone/pull/skip.
- `bind_context({ remote_url, target_dir, base_dir, choice? })` — resolve a local
  working copy to its graph node: normalize the remote URL, check/repair the binding
  cache (`~/.quasar-graph/cache/bindings.json`), fall back to searching every graph;
  returns the bound node with its edges and each neighbor's local availability.

## Configuration

Set via the `env` block of `plugin.json`'s MCP server entry (or exported manually for a standalone run):

- `QUASAR_BACKEND_URL` — backend base URL (e.g. `https://api.quasar-graph.com`, the API of the [quasar-graph.com](https://quasar-graph.com) product). Required; the server refuses to start without it.

The server authenticates as the OAuth 2.1 public client `quasar-mcp` (`src/auth/`):
the refresh token persists in `~/.quasar-graph/tokens.json` (0600, keyed by
backend URL), the short-lived access JWT stays in process memory, and the HTTP client
in `src/backend/client.js` injects `Authorization: Bearer` and retries once after a
silent refresh on 401.

## Development

```bash
cd mcp
npm install
npm test        # node --test
```

## Release

The plugin runs the **committed bundle** `dist/index.js`, not the sources — rebuild
after any change to `index.js` or `src/`, otherwise the plugin keeps executing stale
code. Tests and lint run against the sources (`dist/` is eslint-ignored).

```bash
cd mcp
npm run lint
npm test
npm run build   # regenerates the committed bundle dist/index.js
```

Then bump `version` in `.claude-plugin/plugin.json` (users only get updates when it
changes), commit everything including `dist/index.js`, and push. Users pick up the
release via `/plugin marketplace update` + `/plugin update` (or auto-update, if
enabled).

The plugin `version` is independent of this package's own `version` in
`package.json`: bump the plugin version on every release, whether it changes skills
or server code; the package version only matters for a standalone npm publication
of `mcp/`.

## Backend contract

The graph and project are bound up front (scan Phase 0, recorded in
`manifest.backend`); `build_graph` reads that binding to assemble `graph/graph.json`, and `push_graph` posts to
`POST /api/v1/scan`:

The wire format is snake_case (`src/backend/wire.js` converts from the client's
internal camelCase at the boundary). Node `data` is one flat five-field schema
shared by every node type — `engine`, `port`, `hostname`, `technologies`,
`package_name`, all nullable; the transform emits a per-type subset.

```jsonc
{
  "graph_id": "<uuid>",
  "scan_path": "Projects/acme",       // scan root, relative to $HOME
  "agent_context": "...|null",        // graph-level agent instructions
  "nodes": [{
    "id": "<uuidv5>",                 // v5("node:<graph_id>:<type>:<name>")
    "name": "...",
    "type": "project|service|library|admin_panel|database|cache|queue|storage|search|realtime|gateway|monitoring|auth_provider|cdn|external_api|other",
    "description": "...|null",
    "position": { "x": 0, "y": 0 },
    "repo_url": "https://...|null",
    "project_path": "frontend/acme-site|null",  // relative to scan_path
    "agent_context": "...|null",
    "data": { "engine": null, "port": null, "hostname": null, "technologies": null, "package_name": null },
    "links": [{ "name": "...", "url": "https://..." }]
  }],
  "edges": [{
    "id": "<uuidv5>",                 // v5("edge:<graph_id>:<source_node_id>:<target_node_id>:<type>")
    "source_node_id": "<uuidv5>", "target_node_id": "<uuidv5>",
    "type": "...",
    "source_position": "right", "target_position": "left"
  }]
}
```

The backend deletes all nodes/edges of the graph and re-inserts the payload (full
replace), keeping the client-supplied UUIDs as `_id` and stamping `scannedAt`. It
returns the resulting `GraphDetailDTO`. Layout is owned by the scanner; the backend
does not preserve previous positions.
