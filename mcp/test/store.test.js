import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createTokenStore, defaultTokensPath } from '../src/auth/store.js';

function tmpStorePath() {
  return join(mkdtempSync(join(tmpdir(), 'qg-store-')), 'cfg', 'tokens.json');
}

test('defaultTokensPath lives under ~/.quasar-graph', () => {
  assert.equal(
    defaultTokensPath('/home/u'),
    join('/home/u', '.quasar-graph', 'tokens.json'),
  );
});

test('getRefreshToken returns null when file is absent', () => {
  const store = createTokenStore(tmpStorePath());
  assert.equal(store.getRefreshToken('https://api.local'), null);
});

test('set + get round-trips per backendUrl', () => {
  const store = createTokenStore(tmpStorePath());
  store.setRefreshToken('https://a.local', 'tok-a');
  store.setRefreshToken('https://b.local', 'tok-b');
  assert.equal(store.getRefreshToken('https://a.local'), 'tok-a');
  assert.equal(store.getRefreshToken('https://b.local'), 'tok-b');
});

test('set overwrites the previous token (rotation)', () => {
  const store = createTokenStore(tmpStorePath());
  store.setRefreshToken('https://a.local', 'old');
  store.setRefreshToken('https://a.local', 'new');
  assert.equal(store.getRefreshToken('https://a.local'), 'new');
});

test('file is 0600 and its directory 0700', () => {
  const path = tmpStorePath();
  const store = createTokenStore(path);
  store.setRefreshToken('https://a.local', 'tok');
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(dirname(path)).mode & 0o777, 0o700);
});

test('clear removes only the given backendUrl', () => {
  const store = createTokenStore(tmpStorePath());
  store.setRefreshToken('https://a.local', 'tok-a');
  store.setRefreshToken('https://b.local', 'tok-b');
  store.clear('https://a.local');
  assert.equal(store.getRefreshToken('https://a.local'), null);
  assert.equal(store.getRefreshToken('https://b.local'), 'tok-b');
});

test('corrupt JSON is treated as an empty store', () => {
  const path = tmpStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'not json');
  const store = createTokenStore(path);
  assert.equal(store.getRefreshToken('https://a.local'), null);
  store.setRefreshToken('https://a.local', 'tok');
  assert.equal(JSON.parse(readFileSync(path, 'utf8'))['https://a.local'].refresh_token, 'tok');
});
