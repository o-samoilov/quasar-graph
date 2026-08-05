const OWN_TYPE_KINDS = new Set([
  'database',
  'cache',
  'queue',
  'storage',
  'gateway',
  'monitoring',
  'auth_provider',
  'cdn',
  'search',
  'realtime',
]);

export function mapKindToType(kind) {
  if (OWN_TYPE_KINDS.has(kind)) return kind;
  if (kind === 'external_service') return 'external_api';
  return 'other';
}

export function mapRoleToType(role) {
  if (role === 'service') return 'service';
  if (role === 'library') return 'library';
  if (role === 'admin_panel') return 'admin_panel';
  return 'project';
}

const CODE_NODE_TYPES = new Set(['project', 'service', 'library', 'admin_panel']);

export function isCodeNode(node) {
  return Boolean(node.repoUrl || node.projectPath) || CODE_NODE_TYPES.has(node.type);
}
