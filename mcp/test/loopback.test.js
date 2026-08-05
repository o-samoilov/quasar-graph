import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLoopback } from '../src/auth/loopback.js';

test('resolves with the code on a valid callback and serves a success page', async () => {
  const loopback = await startLoopback({ state: 's-1' });
  assert.equal(loopback.redirectUri, `http://127.0.0.1:${loopback.port}/callback`);
  const res = await fetch(`${loopback.redirectUri}?code=c-1&state=s-1`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /close this tab/i);
  assert.deepEqual(await loopback.result, { code: 'c-1' });
});

test('state mismatch answers 400 and keeps waiting for the real callback', async () => {
  const loopback = await startLoopback({ state: 's-1' });
  const bad = await fetch(`${loopback.redirectUri}?code=evil&state=wrong`);
  assert.equal(bad.status, 400);
  await fetch(`${loopback.redirectUri}?code=c-1&state=s-1`);
  assert.deepEqual(await loopback.result, { code: 'c-1' });
});

test('error=access_denied rejects', async () => {
  const loopback = await startLoopback({ state: 's-1' });
  await fetch(`${loopback.redirectUri}?error=access_denied&state=s-1`);
  await assert.rejects(() => loopback.result, /access_denied/);
});

test('missing code answers 400 and keeps waiting', async () => {
  const loopback = await startLoopback({ state: 's-1' });
  const bad = await fetch(`${loopback.redirectUri}?state=s-1`);
  assert.equal(bad.status, 400);
  loopback.close();
  await assert.rejects(() => loopback.result, /cancelled/i);
});

test('unknown path answers 404', async () => {
  const loopback = await startLoopback({ state: 's-1' });
  const res = await fetch(`http://127.0.0.1:${loopback.port}/favicon.ico`);
  assert.equal(res.status, 404);
  loopback.close();
  await assert.rejects(() => loopback.result);
});

test('times out when no callback arrives', async () => {
  const loopback = await startLoopback({ state: 's-1', timeoutMs: 50 });
  await assert.rejects(() => loopback.result, /timed out/i);
});

test('after settling, the port is released (server closed)', async () => {
  const loopback = await startLoopback({ state: 's-1' });
  await fetch(`${loopback.redirectUri}?code=c-1&state=s-1`);
  await loopback.result;
  await assert.rejects(() => fetch(loopback.redirectUri));
});
