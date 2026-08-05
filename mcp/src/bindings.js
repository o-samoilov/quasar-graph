import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { quasarDir } from './paths.js';

function bindingsPath(home) {
  return join(quasarDir(home), 'cache', 'bindings.json');
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function loadBindings(home = homedir()) {
  return readJson(bindingsPath(home)) ?? {};
}

export function saveBindings(bindings, home = homedir()) {
  const path = bindingsPath(home);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(bindings, null, 2));
}

export function upsertEntry(entries, entry) {
  return [
    ...entries.filter((e) => !(e.graph_id === entry.graph_id && e.node_name === entry.node_name)),
    entry,
  ];
}
