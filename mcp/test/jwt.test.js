import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwtPayload } from '../src/auth/jwt.js';

function fakeJwt(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.fake-signature`;
}

test('decodes the payload of a well-formed JWT', () => {
  const claims = { sub: 'user-1', exp: 1_700_000_000, client_id: 'quasar-mcp' };
  assert.deepEqual(decodeJwtPayload(fakeJwt(claims)), claims);
});

test('returns null for garbage input', () => {
  assert.equal(decodeJwtPayload('not-a-jwt'), null);
  assert.equal(decodeJwtPayload(''), null);
  assert.equal(decodeJwtPayload(null), null);
  assert.equal(decodeJwtPayload(undefined), null);
});

test('returns null when the payload segment is not valid JSON', () => {
  assert.equal(decodeJwtPayload('aGVhZGVy.bm90LWpzb24.sig'), null);
});

test('returns null when the payload is valid JSON but not an object', () => {
  const seg = Buffer.from('123').toString('base64url');
  assert.equal(decodeJwtPayload(`h.${seg}.s`), null);
});
