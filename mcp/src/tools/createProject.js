export async function createProject({ name, description, workspaceId }, { client }) {
  let resolved = workspaceId;
  if (!resolved) {
    const workspaces = await client.listWorkspaces();
    if (workspaces.length === 0) {
      throw new Error(
        'workspace_id is required, but the user has no workspaces. Create a workspace in the quasar-graph backend first, then retry.',
      );
    }
    if (workspaces.length !== 1) {
      const options = workspaces.map((w) => `${w.name} (${w.id})`).join(', ');
      throw new Error(
        `workspace_id is required: the user has ${workspaces.length} workspaces — ${options}. Ask which workspace to use, then retry with workspace_id.`,
      );
    }
    resolved = workspaces[0].id;
  }
  return client.createProject({ name, description, workspaceId: resolved });
}
