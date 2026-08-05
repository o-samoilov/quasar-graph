# Per-harness tool mappings

The quasar-graph skills name **actions**, not tools (see `conventions.md` here — every user-invocable skill loads it via its "Conventions" section). Each file here translates that action vocabulary into one harness's real tool names. The skill bodies are shared verbatim by every harness — porting never edits `skills/*/SKILL.md`; it adds a `<harness>-tools.md` file here and wires up the two harness-side integrations below.

## The action vocabulary

| Action | Meaning |
| --- | --- |
| dispatch a sub-agent (general-purpose) | run a prompt in an isolated agent context and collect its final answer |
| load a skill | make the model load and follow a `skills/<name>/SKILL.md` |
| selection prompt | interactive multiple-choice question to the user |
| read / write / edit / search files | standard file tools |
| run a shell command | standard shell tool |
| MCP tools (`login`, `list_projects`, `plan_clone`, …) | the bundled quasar-graph MCP server |

Every mapping file answers, for its harness: which tool implements each action, and what to do when the capability is missing. The universal degradations are already written into `conventions.md`: no sub-agent tool → do the work inline, sequentially, following the referenced skill (never fabricate a dispatch call); no skill tool → read the skill's `SKILL.md` and follow it; no selection tool → numbered list answered in chat.

## Adding a harness

1. **Do not edit skill bodies.** If a skill seems to need a harness-specific change, the change belongs in the mapping file or the wording is wrong for every harness — fix it once, portably.
2. Add `references/<harness>-tools.md` covering the table above, plus any harness quirks (config flags, option-count caps, sandbox limits).
3. **Register the bundled MCP server** through the harness's MCP support: command `node <plugin>/mcp/dist/index.js` (Node ≥ 20), env `QUASAR_BACKEND_URL` set to the backend URL. Without it, `scan` degrades to offline mode and `research` / `clone` / `context` refuse to run.
4. **Make the skills discoverable** through the harness's own skill/plugin mechanism so `skills/*/SKILL.md` load on demand. The three internal skills (`analyze-project`, `research-project`, `install-project`) must stay out of the user-facing command list but remain loadable by sub-agents.
