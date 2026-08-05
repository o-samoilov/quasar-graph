import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthorizeUrl, startLogin } from '../src/auth/loginFlow.js';

function deps({ opened = true } = {}) {
  const setCalls = [];
  const exchangeCalls = [];
  let openedUrl = null;
  return {
    backendUrl: 'https://api.local',
    oauthClient: {
      async exchangeCode(args) {
        exchangeCalls.push(args);
        return { accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: 123 };
      },
    },
    tokenProvider: { setTokens: (t) => setCalls.push(t) },
    openBrowserFn: async (url) => {
      openedUrl = url;
      if (opened) {
        const u = new URL(url);
        const redirectUri = u.searchParams.get('redirect_uri');
        const state = u.searchParams.get('state');
        queueMicrotask(() => fetch(`${redirectUri}?code=c-1&state=${encodeURIComponent(state)}`));
      }
      return { opened };
    },
    inspect: { setCalls, exchangeCalls, openedUrl: () => openedUrl },
  };
}

test('buildAuthorizeUrl carries the full PKCE query and no scope', () => {
  const url = new URL(buildAuthorizeUrl('https://api.local', {
    codeChallenge: 'ch-1',
    state: 's-1',
    redirectUri: 'http://127.0.0.1:49152/callback',
  }));
  assert.equal(url.origin + url.pathname, 'https://api.local/oauth/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'quasar-mcp');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:49152/callback');
  assert.equal(url.searchParams.get('code_challenge'), 'ch-1');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 's-1');
  assert.equal(url.searchParams.has('scope'), false);
});

test('happy path: callback -> exchangeCode with the right verifier -> setTokens', async () => {
  const d = deps();
  const { opened, completion, authorizeUrl } = await startLogin(d);
  assert.equal(opened, true);
  await completion;
  assert.equal(d.inspect.exchangeCalls.length, 1);
  const call = d.inspect.exchangeCalls[0];
  assert.equal(call.code, 'c-1');
  assert.match(call.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  const { createHash } = await import('node:crypto');
  const challenge = new URL(authorizeUrl).searchParams.get('code_challenge');
  assert.equal(createHash('sha256').update(call.codeVerifier).digest('base64url'), challenge);
  assert.deepEqual(d.inspect.setCalls, [{ accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: 123 }]);
});

test('browser failed to open: opened=false, completion still completes after a manual visit', async () => {
  const d = deps({ opened: false });
  const { opened, completion, authorizeUrl } = await startLogin(d);
  assert.equal(opened, false);
  const u = new URL(authorizeUrl);
  await fetch(`${u.searchParams.get('redirect_uri')}?code=c-9&state=${encodeURIComponent(u.searchParams.get('state'))}`);
  await completion;
  assert.equal(d.inspect.exchangeCalls[0].code, 'c-9');
});

test('timeout rejects completion', async () => {
  const d = deps({ opened: false });
  const { completion } = await startLogin({ ...d, timeoutMs: 50 });
  await assert.rejects(() => completion, /timed out/i);
});
