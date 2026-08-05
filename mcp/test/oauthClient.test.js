import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthClient, CLIENT_ID } from '../src/auth/oauthClient.js';
import { InvalidGrantError } from '../src/auth/errors.js';

const TOKENS = { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 900, token_type: 'Bearer' };

function fakeFetch(status = 200, body = TOKENS) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  fn.calls = calls;
  return fn;
}

test('exchangeCode POSTs form-encoded authorization_code grant', async () => {
  const fetch = fakeFetch();
  const client = createOAuthClient('https://api.local', { fetch, now: () => 1_000_000 });
  const tokens = await client.exchangeCode({
    code: 'c-1',
    redirectUri: 'http://127.0.0.1:49152/callback',
    codeVerifier: 'ver-1',
  });
  const { url, opts } = fetch.calls[0];
  assert.equal(url, 'https://api.local/oauth/token');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const params = new URLSearchParams(opts.body);
  assert.equal(params.get('grant_type'), 'authorization_code');
  assert.equal(params.get('code'), 'c-1');
  assert.equal(params.get('redirect_uri'), 'http://127.0.0.1:49152/callback');
  assert.equal(params.get('client_id'), CLIENT_ID);
  assert.equal(params.get('code_verifier'), 'ver-1');
  assert.deepEqual(tokens, {
    accessToken: 'at-1',
    refreshToken: 'rt-1',
    expiresAt: 1_000_000 + (900 - 30) * 1000,
  });
});

test('refresh POSTs form-encoded refresh_token grant', async () => {
  const fetch = fakeFetch();
  const client = createOAuthClient('https://api.local', { fetch, now: () => 0 });
  await client.refresh({ refreshToken: 'rt-old' });
  const params = new URLSearchParams(fetch.calls[0].opts.body);
  assert.equal(params.get('grant_type'), 'refresh_token');
  assert.equal(params.get('refresh_token'), 'rt-old');
  assert.equal(params.get('client_id'), CLIENT_ID);
});

test('400 and 401 throw InvalidGrantError', async () => {
  for (const status of [400, 401]) {
    const client = createOAuthClient('https://api.local', { fetch: fakeFetch(status, { error: 'invalid_grant' }) });
    await assert.rejects(() => client.refresh({ refreshToken: 'rt' }), InvalidGrantError);
  }
});

test('other non-2xx throws a plain Error with status', async () => {
  const client = createOAuthClient('https://api.local', { fetch: fakeFetch(500, {}) });
  await assert.rejects(() => client.refresh({ refreshToken: 'rt' }), (err) => {
    assert.ok(!(err instanceof InvalidGrantError));
    assert.match(err.message, /500/);
    return true;
  });
});

test('error messages never contain token values', async () => {
  const client = createOAuthClient('https://api.local', { fetch: fakeFetch(400, { error: 'invalid_grant' }) });
  await assert.rejects(() => client.refresh({ refreshToken: 'rt-secret' }), (err) => {
    assert.ok(!err.message.includes('rt-secret'));
    return true;
  });
});

test('userinfo GETs /oauth/userinfo with a Bearer header', async () => {
  const fetch = fakeFetch(200, { userId: 'u-1', email: 'a@b.c' });
  const client = createOAuthClient('https://api.local', { fetch });
  const info = await client.userinfo({ accessToken: 'at-1' });
  const { url, opts } = fetch.calls[0];
  assert.equal(url, 'https://api.local/oauth/userinfo');
  assert.equal(opts.headers.Authorization, 'Bearer at-1');
  assert.deepEqual(info, { userId: 'u-1', email: 'a@b.c' });
});

test('userinfo throws on non-2xx', async () => {
  const client = createOAuthClient('https://api.local', { fetch: fakeFetch(401, {}) });
  await assert.rejects(() => client.userinfo({ accessToken: 'at-dead' }), /userinfo failed: 401/);
});

test('revoke POSTs form-encoded token + client_id to /oauth/revoke', async () => {
  const fetch = fakeFetch(200, null);
  const client = createOAuthClient('https://api.local', { fetch });
  await client.revoke({ refreshToken: 'rt-1' });
  const { url, opts } = fetch.calls[0];
  assert.equal(url, 'https://api.local/oauth/revoke');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const params = new URLSearchParams(opts.body);
  assert.equal(params.get('token'), 'rt-1');
  assert.equal(params.get('client_id'), CLIENT_ID);
});

test('revoke throws on non-2xx', async () => {
  const client = createOAuthClient('https://api.local', { fetch: fakeFetch(500, {}) });
  await assert.rejects(() => client.revoke({ refreshToken: 'rt-1' }), /revoke failed: 500/);
});
