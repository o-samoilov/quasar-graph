import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeToBase } from '../src/transform/relativePath.js';

test('makes an absolute path under the base relative to it', () => {
  assert.equal(relativeToBase('/Users/alice', '/Users/alice/Projects/acme'), 'Projects/acme');
  assert.equal(relativeToBase('/abs/projects', '/abs/projects/p1'), 'p1');
});

test('the base itself collapses to "."', () => {
  assert.equal(relativeToBase('/Users/alice', '/Users/alice'), '.');
});

test('falls back to the absolute path when the path is not under the base', () => {
  assert.equal(relativeToBase('/Users/alice', '/opt/projects/acme'), '/opt/projects/acme');
});

test('falls back to the absolute path when there is no base (offline)', () => {
  assert.equal(relativeToBase(null, '/abs/projects/p1'), '/abs/projects/p1');
});

test('passes through null/empty path', () => {
  assert.equal(relativeToBase('/Users/alice', null), null);
  assert.equal(relativeToBase('/Users/alice', undefined), null);
});

test('normalizes nested segments to forward slashes', () => {
  assert.equal(relativeToBase('/root', '/root/a/b/c'), 'a/b/c');
});
