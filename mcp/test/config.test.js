import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';

test('readConfig returns backendUrl from env, trimming trailing slash', () => {
  const cfg = readConfig({ QUASAR_BACKEND_URL: 'https://api.quasar-graph.com/' });
  assert.equal(cfg.backendUrl, 'https://api.quasar-graph.com');
});

test('readConfig throws when QUASAR_BACKEND_URL is missing', () => {
  assert.throws(() => readConfig({}), /QUASAR_BACKEND_URL/);
});
