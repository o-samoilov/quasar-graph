import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generatePkce } from '../src/auth/pkce.js';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

test('generatePkce returns base64url verifier of 43 chars', () => {
  const { codeVerifier } = generatePkce();
  assert.equal(codeVerifier.length, 43);
  assert.match(codeVerifier, BASE64URL);
});

test('codeChallenge is base64url(sha256(codeVerifier))', () => {
  const { codeVerifier, codeChallenge } = generatePkce();
  const expected = createHash('sha256').update(codeVerifier).digest('base64url');
  assert.equal(codeChallenge, expected);
});

test('state is base64url, 43 chars, and differs from verifier', () => {
  const { codeVerifier, state } = generatePkce();
  assert.equal(state.length, 43);
  assert.match(state, BASE64URL);
  assert.notEqual(state, codeVerifier);
});

test('two calls produce different values', () => {
  const a = generatePkce();
  const b = generatePkce();
  assert.notEqual(a.codeVerifier, b.codeVerifier);
  assert.notEqual(a.state, b.state);
});
