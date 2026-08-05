# Codex tool mapping

| Action | Codex equivalent |
| --- | --- |
| dispatch a sub-agent (general-purpose) | `spawn_agent` / `wait_agent` / `close_agent` — requires `[features] multi_agent = true` in `~/.codex/config.toml`; close each sub-agent when it has finished. Without the flag, use the inline fallback from the Platform adaptation section of `conventions.md` |
| load a skill | Codex discovers `skills/` natively; inside a sub-agent, the prompt's fallback applies — read the skill's `SKILL.md` and follow it |
| selection prompt | no dedicated tool — show a numbered list and let the user answer in chat |
| read / write / edit / search files, shell | Codex's standard file and shell tools |
| MCP tools | register the bundled server in `~/.codex/config.toml`: an `[mcp_servers.quasar-graph]` entry with `command = "node"`, `args = ["<plugin>/mcp/dist/index.js"]`, and `env = { QUASAR_BACKEND_URL = "<backend url>" }` (Node ≥ 20) |

Harness notes:

- The `login` MCP tool opens a browser for OAuth; in a sandboxed Codex session the browser may not open — use the `authorize_url` fallback the skills already describe (show the URL, the user opens it themselves).
- Clone/install phases run git and package managers through the shell; a read-only sandbox blocks them — surface that instead of retrying.
