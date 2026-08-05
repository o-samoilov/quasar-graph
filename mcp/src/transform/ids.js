import { createHash } from 'node:crypto';

const NAMESPACE = '9e1f0a52-3d7b-4c8e-9a6f-2b1c4d5e6f70';

function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, '');
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToUuid(buf) {
  const hex = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidv5(name, namespace = NAMESPACE) {
  const hash = createHash('sha1')
    .update(uuidToBytes(namespace))
    .update(Buffer.from(name, 'utf8'))
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  return bytesToUuid(bytes);
}

// Identity is graph-scoped: project-scoped ids made same-name nodes from two graphs collide on one UUID.
export function nodeId(graphId, type, name) {
  return uuidv5(`node:${graphId}:${type}:${name}`);
}

export function edgeId(graphId, sourceNodeId, targetNodeId, type) {
  return uuidv5(`edge:${graphId}:${sourceNodeId}:${targetNodeId}:${type}`);
}
