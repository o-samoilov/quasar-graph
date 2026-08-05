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
- `list_projects()` — list backend projects; pick which one to upload a scan into.
- `list_graphs({ project_id? })` — list graphs, optionally filtered to one project.
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

## Configuration

Set via the `env` block of `plugin.json`'s MCP server entry (or exported manually for a standalone run):

- `QUASAR_BACKEND_URL` — backend base URL (e.g. `https://api.quasar-graph.com`). Required; the server refuses to start without it.

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

## Backend contract

The graph and project are bound up front (scan Phase 0, recorded in
`manifest.backend`); `build_graph` reads that binding to assemble `graph/graph.json`, and `push_graph` posts to
`POST /api/v1/scan`:

```jsonc
{
  "graphId": "<uuid>",
  "nodes": [{
    "id": "<uuidv5>",                 // v5(project_id + type + name)
    "name": "...", "type": "project|database|external_api|admin_panel",
    "description": "...|null",
    "position": { "x": 0, "y": 0 },
    "data": { "type": "<type>", ... },  // discriminated by node type
    "links": [{ "name": "...", "url": "https://..." }]
  }],
  "edges": [{
    "id": "<uuidv5>",                 // v5(graph_id + source + target + type)
    "sourceNodeId": "<uuidv5>", "targetNodeId": "<uuidv5>",
    "type": "...",
    "sourcePosition": "right", "targetPosition": "left"
  }]
}
```

The backend deletes all nodes/edges of the graph and re-inserts the payload (full
replace), keeping the client-supplied UUIDs as `_id` and stamping `scannedAt`. It
returns the resulting `GraphDetailDTO`. Layout is owned by the scanner; the backend
does not preserve previous positions. See the backend spec
`2026-06-04-scan-graph-replace-design.md`.
