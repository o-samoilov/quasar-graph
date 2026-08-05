# Setup

## MCP server bundle

The plugin runs the **bundled** MCP server (`mcp/dist/index.js`), not the sources. The bundle is built with esbuild and committed, so a marketplace install works without `npm install`.

### Build

```bash
cd mcp
npm install     # first time only
npm run build   # regenerates dist/index.js
```

Rebuild after any change to `mcp/index.js` or `mcp/src/` — otherwise the plugin keeps executing stale code. Tests and lint run against the sources (`dist/` is eslint-ignored).

### Release

```bash
cd mcp
npm test
npm run build
```

Then bump `version` in `.claude-plugin/plugin.json` (users only get updates when it changes), commit everything including `mcp/dist/index.js`, and push.

Users pick up the release via `/plugin marketplace update` + `/plugin update` (or auto-update, if enabled).
