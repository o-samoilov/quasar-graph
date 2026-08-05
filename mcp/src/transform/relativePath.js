import { relative, sep } from 'node:path';

export function relativeToBase(base, absPath) {
  if (!base || !absPath) return absPath ?? null;
  const rel = relative(base, absPath);
  if (rel === '') return '.';
  if (rel.startsWith('..')) return absPath;
  return rel.split(sep).join('/');
}
