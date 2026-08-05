import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readSession } from '../src/read/session.js';

const here = dirname(fileURLToPath(import.meta.url));
const sessionDir = join(here, 'fixtures/session');

test('readSession returns only done projects with metadata and connections', () => {
  const s = readSession(sessionDir, '/abs/projects');
  assert.equal(s.scanDir, '/abs/projects');
  const names = s.projects.map((p) => p.name).sort();
  assert.deepEqual(names, ['acme-backend', 'acme-web']);
  const backend = s.projects.find((p) => p.name === 'acme-backend');
  assert.equal(backend.language, 'typescript');
  assert.equal(backend.framework, 'nestjs');
  assert.equal(backend.description, 'Core API service for acme.');
  assert.deepEqual(backend.connections, [{ project: 'acme-web', via: 'rest_api' }]);
});

test('readSession carries projectPath (project path) and repoUrl from the manifest', () => {
  const s = readSession(sessionDir, '/abs/projects');
  const backend = s.projects.find((p) => p.name === 'acme-backend');
  assert.equal(backend.projectPath, '/abs/projects/acme-backend');
  assert.equal(backend.repoUrl, 'https://github.com/acme/acme-backend.git');
  const web = s.projects.find((p) => p.name === 'acme-web');
  assert.equal(web.projectPath, '/abs/projects/acme-web');
  assert.equal(web.repoUrl, null);
});

test('readSession defaults role and port to null when the frontmatter omits them', () => {
  const s = readSession(sessionDir, '/abs/projects');
  const backend = s.projects.find((p) => p.name === 'acme-backend');
  assert.equal(backend.role, null);
  assert.equal(backend.port, null);
});

test('readSession reads package_name from the frontmatter and defaults it to null', () => {
  const s = readSession(sessionDir, '/abs/projects');
  const web = s.projects.find((p) => p.name === 'acme-web');
  assert.equal(web.packageName, '@acme/web');
  const backend = s.projects.find((p) => p.name === 'acme-backend');
  assert.equal(backend.packageName, null);
});

test('readSession reads aggregated resources from both resources/ and third-party/', () => {
  const s = readSession(sessionDir, '/abs/projects');
  const slugs = s.resources.map((r) => r.slug).sort();
  assert.deepEqual(slugs, ['mongodb-acme', 'stripe']);
  const mongo = s.resources.find((r) => r.slug === 'mongodb-acme');
  assert.equal(mongo.kind, 'database');
  assert.equal(mongo.type, 'mongodb');
  assert.equal(mongo.port, 27017);
  assert.equal(mongo.adminUrl, 'http://localhost:8081');
  assert.deepEqual(mongo.consumers, [{ project: 'acme-backend', env: 'MONGODB_URL', role: undefined }]);
  const stripe = s.resources.find((r) => r.slug === 'stripe');
  assert.equal(stripe.host, 'api.stripe.com');
});

test('readSession exposes the backend binding block from the manifest', () => {
  const s = readSession(sessionDir, '/abs/projects');
  assert.equal(s.backend.project_id, 'p-1');
  assert.equal(s.backend.graph_id, 'g-existing');
  assert.equal(s.backend.mode, 'existing');
});
