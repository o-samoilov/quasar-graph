# Claude Code tool mapping

| Action | Claude Code tool |
| --- | --- |
| dispatch a sub-agent (general-purpose) | `Task` with `subagent_type: "general-purpose"`; a batch of 3 = three `Task` calls in a single message |
| load a skill | the `Skill` tool; a sub-agent prompt saying "Load the skill quasar-graph:<name>" resolves through it |
| selection prompt | `AskUserQuestion` (holds 2–4 options — above that, the skills fall back to a numbered table) |
| read / write / edit / search files | `Read` / `Write` / `Edit` / `Grep` / `Glob` |
| run a shell command | `Bash` |
| MCP tools | registered automatically by the plugin manifest (`.claude-plugin/plugin.json` → `mcp/dist/index.js`); callable by their short names (`login`, `list_projects`, `plan_clone`, …) |

Harness notes:

- The internal skills carry `user-invocable: false` in their frontmatter — hidden from the `/` slash menu, still loadable by `Task` sub-agents via the `Skill` tool. Do NOT add `disable-model-invocation: true`; that would block the `Skill` tool and break the orchestrators.
- `Write` creates intermediate directories automatically, so the analyzers can write to deep output paths directly.
