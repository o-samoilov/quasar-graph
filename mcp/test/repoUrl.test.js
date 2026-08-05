import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRepoUrl, denormalizeRepoUrl } from '../src/transform/repoUrl.js';

test('normalizeRepoUrl still canonicalizes (moved intact)', () => {
  assert.equal(normalizeRepoUrl('git@github.com:org/repo.git'), 'https://github.com/org/repo');
  assert.equal(normalizeRepoUrl('https://github.com/org/repo'), 'https://github.com/org/repo');
  assert.equal(normalizeRepoUrl(null), null);
});

test('denormalizeRepoUrl https→ssh', () => {
  assert.equal(denormalizeRepoUrl('https://github.com/org/repo', 'ssh'), 'git@github.com:org/repo.git');
});

test('denormalizeRepoUrl https→ssh keeps nested group path', () => {
  assert.equal(
    denormalizeRepoUrl('https://gitlab.com/group/sub/repo', 'ssh'),
    'git@gitlab.com:group/sub/repo.git',
  );
});

test('denormalizeRepoUrl strips an existing .git before re-adding', () => {
  assert.equal(denormalizeRepoUrl('https://github.com/org/repo.git', 'ssh'), 'git@github.com:org/repo.git');
});

test('denormalizeRepoUrl https→https returns canonical unchanged', () => {
  assert.equal(denormalizeRepoUrl('https://github.com/org/repo', 'https'), 'https://github.com/org/repo');
});

test('denormalizeRepoUrl passes null and unparseable through', () => {
  assert.equal(denormalizeRepoUrl(null, 'ssh'), null);
  assert.equal(denormalizeRepoUrl('git@github.com:org/repo.git', 'ssh'), 'git@github.com:org/repo.git');
});
