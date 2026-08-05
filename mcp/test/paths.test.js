import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { quasarDir } from '../src/paths.js';

test('quasarDir is ~/.quasar-graph', () => {
  assert.equal(quasarDir('/home/u'), join('/home/u', '.quasar-graph'));
});
