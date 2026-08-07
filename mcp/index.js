import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readConfig } from './src/config.js';
import { createClient } from './src/backend/client.js';
import { createTokenStore } from './src/auth/store.js';
import { createOAuthClient } from './src/auth/oauthClient.js';
import { createTokenProvider } from './src/auth/tokenProvider.js';
import { startLogin } from './src/auth/loginFlow.js';
import { whoami } from './src/tools/whoami.js';
import { logout } from './src/tools/logout.js';
import { listSessions } from './src/tools/listSessions.js';
import { pullGraph } from './src/tools/pullGraph.js';
import { writeNodeManifests } from './src/tools/writeNodeManifests.js';
import { buildGraph } from './src/tools/buildGraph.js';
import { pushGraph } from './src/tools/pushGraph.js';
import { planClone } from './src/tools/planClone.js';
import { bindContext } from './src/tools/bindContext.js';
import { createProject } from './src/tools/createProject.js';

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function fail(err) {
  return { isError: true, content: [{ type: 'text', text: String(err?.message ?? err) }] };
}

async function main() {
  const config = readConfig(process.env);
  const store = createTokenStore();
  const oauthClient = createOAuthClient(config.backendUrl);
  const auth = createTokenProvider({ backendUrl: config.backendUrl, store, oauthClient });
  const client = createClient(config.backendUrl, { auth });

  const server = new McpServer(
    { name: 'quasar-graph', version: '1.0.0' },
    {
      instructions:
        'quasar-graph maintains a backend graph of the user\'s projects: project/service nodes plus their databases, caches, queues, gateways and third-party services, connected by dependency and ingress-route edges. ' +
        'When the user asks structural questions about the project they are working in — who calls this service, what does it depend on, which backend/services it talks to, where a database/cache/queue comes from, who consumes its API, what routes traffic to it — invoke the quasar-graph:context skill first (it binds the current project to its graph node once per session), then answer from the graph instead of searching code. ' +
        'Invoke it even when the repository\'s own docs (CLAUDE.md, README) seem to answer the question — the graph is the source of truth for cross-project structure. ' +
        'For questions across many projects\' code use quasar-graph:research; to index projects into a graph use quasar-graph:scan; to clone a graph\'s projects locally use quasar-graph:clone; to edit an existing graph (positions, descriptions, nodes/edges) without re-scanning use quasar-graph:edit. ' +
        'Every tool except login requires authentication: on a "Not authenticated" error run the login tool, then retry.',
    },
  );

  server.registerTool(
    'login',
    {
      title: 'Log in to the quasar-graph backend',
      description:
        'Interactive OAuth login: opens the browser for consent and stores tokens locally. Call this when another tool fails with "Not authenticated", then retry that tool. Use whoami to inspect the current session and logout to sign out.',
      inputSchema: {},
    },
    async () => {
      try {
        const { authorizeUrl, opened, completion } = await startLogin({
          backendUrl: config.backendUrl,
          oauthClient,
          tokenProvider: auth,
        });
        if (!opened) {
          // Browser did not open: return the URL immediately; the loopback and code exchange finish in the background.
          completion.catch(() => {});
          return ok({
            status: 'pending',
            authorize_url: authorizeUrl,
            message:
              'Could not open a browser automatically. Open authorize_url in a browser on THIS machine within 5 minutes; the login completes in the background. Then retry the original tool.',
          });
        }
        await completion;
        return ok({ status: 'ok', message: 'Logged in. Retry the original tool.' });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'whoami',
    {
      title: 'Show current auth state',
      description:
        'Report whether this MCP server is logged in to the quasar-graph backend and as whom (user id, email, access-token expiry). Performs a silent token refresh, so logged_in: true means the session actually works. Not being logged in is a normal response, not an error.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await whoami({ backendUrl: config.backendUrl, auth, oauthClient }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'logout',
    {
      title: 'Log out of the quasar-graph backend',
      description:
        'Revoke the refresh token on the backend (best-effort) and delete the local credentials for this backend. Idempotent: logging out without a session succeeds with revoked: false. Run login to sign in again, e.g. as a different user.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await logout({ backendUrl: config.backendUrl, store, auth, oauthClient }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_sessions',
    {
      title: 'List local scan sessions',
      description:
        'List the scan sessions under <cwd>/.quasar-graph/, newest first, each with its bound graph, scan_dir and status counts (done/pending/skipped across projects + environments). Use it at the start of a scan to offer "new session" vs resuming one. Local and read-only: no backend call, no authentication. Directories without a readable manifest.json (edit sessions, aborted scans) are not scan sessions and are only counted as skipped_dirs.',
      inputSchema: {
        cwd: z.string().describe('Absolute path of the directory the scan is invoked from (holds .quasar-graph/)'),
      },
    },
    async ({ cwd }) => {
      try {
        return ok(listSessions({ cwd }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'List all projects on the backend. Use this to pick the project to upload a scan into.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await client.listProjects());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_workspaces',
    {
      title: 'List workspaces',
      description:
        'List the workspaces the user belongs to (id, name, role). Every backend project lives in a workspace; use this to pick the workspace_id for create_project when the user has more than one.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await client.listWorkspaces());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_graphs',
    {
      title: 'List graphs',
      description: 'List graphs on the backend, optionally filtered to one project.',
      inputSchema: { project_id: z.string().optional().describe('UUID of the project to filter graphs by') },
    },
    async ({ project_id }) => {
      try {
        return ok(await client.listGraphs(project_id));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create project',
      description:
        'Create a new backend project inside a workspace. When workspace_id is omitted and the user has exactly one workspace, that workspace is used; otherwise the call fails listing the options — pick one via list_workspaces and retry. Returns the created project (id, workspace_id, name, description).',
      inputSchema: {
        name: z.string().describe('Name for the new project'),
        description: z.string().optional().describe('Optional project description'),
        workspace_id: z.string().optional().describe('UUID of the workspace to create the project in (from list_workspaces)'),
      },
    },
    async ({ name, description, workspace_id }) => {
      try {
        return ok(await createProject({ name, description, workspaceId: workspace_id }, { client }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'create_graph',
    {
      title: 'Create graph',
      description: 'Create a new empty graph for a backend project. Returns the created graph (id, name, project_id, workspace_id).',
      inputSchema: {
        project_id: z.string().describe('UUID of the backend project (from list_projects)'),
        name: z.string().describe('Name for the new graph'),
      },
    },
    async ({ project_id, name }) => {
      try {
        return ok(await client.createGraph({ name, projectId: project_id }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_graph',
    {
      title: 'Get graph',
      description: 'Fetch one graph with its nodes and edges.',
      inputSchema: { graph_id: z.string().describe('Graph UUID') },
    },
    async ({ graph_id }) => {
      try {
        return ok(await client.getGraph(graph_id));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'pull_graph',
    {
      title: 'Pull graph into session',
      description:
        'Download an existing graph and write its full snapshot (graph/graph.json) into the session, so a re-scan preserves graph-owned fields (position, agentContext).',
      inputSchema: {
        session_dir: z.string().describe('Absolute path to the scan output dir, <cwd>/.quasar-graph/<session_id>'),
        graph_id: z.string().describe('UUID of the graph to pull (from list_graphs)'),
      },
    },
    async ({ session_dir, graph_id }) => {
      try {
        return ok(await pullGraph({ sessionDir: session_dir, graphId: graph_id }, { client }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'write_node_manifests',
    {
      title: 'Write per-node manifests into scan folders',
      description:
        'Late-join step (Phase 3 tail): read graph/graph.json + the scan/ folders, compute each node id, and write a per-node manifest.json ({ id, position, agentContext }) beside each project/resource .md. Idempotent; a user-edited position/agentContext wins. Run before Phase 3.5 so positions are visible in review.',
      inputSchema: {
        session_dir: z.string().describe('Absolute path to the scan output dir, <cwd>/.quasar-graph/<session_id>'),
        graph_id: z.string().optional().describe('Override for manifest.backend.graph_id'),
      },
    },
    async ({ session_dir, graph_id }) => {
      try {
        return ok(writeNodeManifests({ sessionDir: session_dir, graphId: graph_id }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'build_graph',
    {
      title: 'Assemble the scan session into graph/graph.json',
      description:
        'Phase 3 tail: read a scan session (manifest + scan/ markdown), transform it into nodes/edges (deterministic UUIDs), overlay graph-owned per-node fields (position, agentContext) from per-folder manifest.json over the previous graph/graph.json snapshot, backfill scan-owned node fields the fresh scan left empty (description, repoUrl, projectPath, data keys, links by URL) from that snapshot (fresh values win; count reported as backfilled), and overwrite <session_dir>/graph/graph.json with the assembled snapshot. Local-only — upload it with push_graph.',
      inputSchema: {
        session_dir: z.string().describe('Absolute path to the scan output dir, <cwd>/.quasar-graph/<session_id>'),
        graph_id: z.string().optional().describe('Override for manifest.backend.graph_id'),
      },
    },
    async ({ session_dir, graph_id }) => {
      try {
        return ok(buildGraph({ sessionDir: session_dir, graphId: graph_id }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'push_graph',
    {
      title: 'Push edited graph snapshot to backend',
      description:
        'Read <session_dir>/graph/graph.json, validate it, recompute deterministic node/edge ids and anchors, and upload it to the backend /scan endpoint, which fully replaces the graph contents. The single upload path: a scan session pushes the snapshot assembled by build_graph; the edit flow pushes a snapshot downloaded by pull_graph and edited in place.',
      inputSchema: {
        session_dir: z
          .string()
          .describe('Absolute path to the session dir holding graph/graph.json, <cwd>/.quasar-graph/<session_id>'),
      },
    },
    async ({ session_dir }) => {
      try {
        return ok(await pushGraph({ sessionDir: session_dir }, { client }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'plan_clone',
    {
      title: 'Plan cloning a graph (clone plan)',
      description:
        'Resolve a graph into a deterministic clone plan: for each code node with a git remote (any node carrying repoUrl/projectPath, whatever its type), compute the local target path (base_dir + projectPath), translate the repo URL to the chosen protocol (ssh|https), dedup monorepo nodes that share a repo, and classify each target as clone/pull/skip by inspecting the local filesystem. Read-only; the clone skill runs the actual git commands.',
      inputSchema: {
        graph_id: z.string().describe('UUID of the graph to clone (from list_graphs)'),
        base_dir: z.string().describe('Absolute path of the local root to clone projects into (e.g. /Users/me/Projects)'),
        protocol: z
          .preprocess((v) => (typeof v === 'string' ? v.toLowerCase() : undefined), z.enum(['ssh', 'https']).optional())
          .describe('Clone protocol; defaults to ssh'),
      },
    },
    async ({ graph_id, base_dir, protocol }) => {
      try {
        return ok(await planClone({ graphId: graph_id, baseDir: base_dir, protocol }, { client }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'bind_context',
    {
      title: 'Bind a working copy to its graph node',
      description:
        'Resolve which graph node corresponds to a local working copy: normalize the git remote URL, check the local binding cache (~/.quasar-graph/cache/bindings.json), validate or repair cached entries against the backend, fall back to searching every graph, and return the bound node with its inbound/outbound edges and each neighbor\'s local availability. Returns status bound | ambiguous (pick a candidate and retry with choice) | not_found. Read-only on the backend; owns and maintains the binding cache.',
      inputSchema: {
        remote_url: z.string().describe('Raw output of `git remote get-url origin` in the target directory'),
        target_dir: z.string().describe('Absolute path of the directory being bound'),
        base_dir: z.string().describe('Absolute path of the local projects root (base_dir from ~/.quasar-graph/config.json)'),
        choice: z
          .object({
            graph_id: z.string(),
            node_name: z.string(),
            project_id: z.string().optional(),
          })
          .optional()
          .describe('Candidate chosen by the user after a previous ambiguous result (echo its fields back)'),
      },
    },
    async ({ remote_url, target_dir, base_dir, choice }) => {
      try {
        return ok(
          await bindContext(
            { remoteUrl: remote_url, targetDir: target_dir, baseDir: base_dir, choice },
            { client },
          ),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`[quasar-graph] startup failed: ${err.message}`);
  process.exit(1);
});
