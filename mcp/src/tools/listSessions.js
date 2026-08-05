import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function countStatuses(manifest) {
  const counts = { done: 0, pending: 0, skipped: 0 };
  const entries = [...(manifest.projects ?? []), ...(manifest.environments ?? [])];
  for (const entry of entries) {
    if (entry && Object.hasOwn(counts, entry.status)) counts[entry.status]++;
  }
  return counts;
}

function readSummary(sessionsRoot, sessionId) {
  const path = join(sessionsRoot, sessionId, 'manifest.json');
  if (!existsSync(path)) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  return {
    session_id: sessionId,
    created_at: manifest.created_at ?? null,
    scan_dir: manifest.scan_dir ?? null,
    graph_name: manifest.backend?.graph_name ?? null,
    graph_id: manifest.backend?.graph_id ?? null,
    counts: countStatuses(manifest),
  };
}

export function listSessions({ cwd }) {
  if (!cwd) throw new Error('cwd is required: pass the absolute directory the scan was invoked from.');
  const sessionsRoot = join(cwd, '.quasar-graph');
  if (!existsSync(sessionsRoot)) return { sessions: [], skipped_dirs: 0 };

  const dirNames = readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const sessions = [];
  let skippedDirs = 0;
  for (const name of dirNames) {
    const summary = readSummary(sessionsRoot, name);
    if (summary) sessions.push(summary);
    else skippedDirs++;
  }
  return { sessions, skipped_dirs: skippedDirs };
}
