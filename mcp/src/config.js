export function readConfig(env) {
  const raw = env.QUASAR_BACKEND_URL;
  if (!raw || !raw.trim()) {
    throw new Error('QUASAR_BACKEND_URL is not set. Configure the plugin Backend URL.');
  }
  return { backendUrl: raw.trim().replace(/\/+$/, '') };
}
