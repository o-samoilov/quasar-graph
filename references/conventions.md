# Shared skill conventions

Every user-invocable quasar-graph skill (`scan`, `research`, `clone`, `context`, `edit`) is written against the conventions below. Read this file once when such a skill starts; the skill bodies reference these sections instead of repeating them. Per-skill specifics (which gates exist, what happens when auth ultimately fails, which entries a clone plan keeps) stay in the skill bodies.

## Platform adaptation

The skills name **actions**, not tools. Map each action to your platform's native tool (per-harness notes live in `references/<harness>-tools.md` beside this file):

- **dispatch a sub-agent (general-purpose)** — run a prompt in an isolated agent context and collect its final answer. No sub-agent capability → do that work inline yourself, one item at a time, following the referenced skill; never fabricate a dispatch call.
- **load a skill** — invoke it through the platform's skill mechanism; if there is none, read that skill's `SKILL.md` under the plugin's `skills/<name>/` directory and follow it.
- **selection prompt** — the platform's multiple-choice question tool; if there is none, show a numbered list and let the user answer in chat.
- **read / write / edit / search files, run a shell command** — the platform's standard file and shell tools.
- The `quasar-graph` MCP tools (`list_projects`, `plan_clone`, …) come from the bundled MCP server (`mcp/dist/index.js`), registered through the platform's MCP support.

## Selection UI

Prefer an interactive selection prompt over a plain text question wherever the choices are bounded, so the user selects instead of typing:

- **Fixed choices** (gates, yes/no, protocol, new-vs-existing) → always a selection prompt, recommended/default option first. Each skill lists its own fixed choices.
- **Backend lists (projects, graphs)** → conditional: a selection prompt holds only a small, bounded option set (typically **2–4**). If `list_projects` / `list_graphs` returns **≤ 4** items, present them as options (label = name, description = the item's own description or `nodes_count / scanned_at`). If it returns **> 4**, fall back to a numbered markdown table and ask the user to type a number or name.
- **Workspace labeling (projects)** → before asking which project, call `list_workspaces` once and keep the list for the session. With more than one workspace, put the workspace name inside the option **label** — `<project name> (<workspace name>)`, joining the project's `workspace_id` to the workspace list (fall back to the raw `workspace_id` when it matches nothing); the option description stays the project's own description and never mentions the workspace, so the two cannot blur together. In the numbered-table fallback, give the workspace its own column. With a single workspace, omit workspace names entirely. When the flow later creates a project, take `workspace_id` from this list instead of asking again.
- **Empty list** → do not open a selection prompt — report that there is nothing to choose and follow the skill's own empty-case rule.
- **Free-form inputs** (paths, names, queries) → plain text; there is nothing to enumerate.

## Login retry flow

When a backend MCP tool call fails with `Not authenticated with the quasar-graph backend`: tell the user a browser window will open for login, call the `login` tool, then retry the failed call once. If `login` returns `status: pending` with an `authorize_url`, show the URL, ask the user to open it in a browser on this machine, wait for their confirmation, then retry. If the retry still fails with the same error, apply the invoking skill's terminal rule (`scan` offers offline mode explicitly; `research` / `clone` / `context` stop — they have no offline mode). An auth failure is never the offline case.

## Repo identity & binding cache

- **Normalized repo URL:** the graph stores each node's `repoUrl` normalized by `normalizeRepoUrl` (`mcp/src/transform/repoUrl.js`): scp-style `git@host:org/repo.git`, `ssh://`, `git://`, and `https://` remotes all collapse to `https://host/org/repo` with no `.git` suffix. Skills that only need to bind the current working copy pass the **raw** remote URL to the `bind_context` tool, which applies these rules itself; a skill matching URLs on its own (e.g. against a pulled snapshot) must normalize with the same rules.
- **Binding cache:** `~/.quasar-graph/cache/bindings.json` maps a normalized repo URL to an **array** of `{ node_name, project_path, project_id, graph_id }` entries (`project_path` holds the node's `projectPath` value) (an array because one repo can hold several monorepo nodes and can appear in several graphs). The cache is **owned by the MCP server's `bind_context` tool** — it writes, repairs, and prunes entries; skills read it at most and never write it. Everything under `~/.quasar-graph/cache/` is regenerable derived data — deleting it is always safe.
