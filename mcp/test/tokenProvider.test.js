import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenProvider } from '../src/auth/tokenProvider.js';
import { LoginRequiredError, InvalidGrantError } from '../src/auth/errors.js';

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    getRefreshToken: (url) => data[url] ?? null,
    setRefreshToken: (url, tok) => { data[url] = tok; },
    clear: (url) => { delete data[url]; },
    data,
  };
}

function fakeOAuth({ fail } = {}) {
  let n = 0;
  return {
    calls: () => n,
    async refresh() {
      n += 1;
      if (fail) throw fail;
      return { accessToken: `at-${n}`, refreshToken: `rt-${n}`, expiresAt: Date.now() + 870_000 };
    },
  };
}

const URL_ = 'https://api.local';

test('returns cached access token while it is valid', async () => {
  const provider = createTokenProvider({ backendUrl: URL_, store: memoryStore(), oauthClient: fakeOAuth() });
  provider.setTokens({ accessToken: 'at-mem', refreshToken: 'rt-mem', expiresAt: Date.now() + 60_000 });
  assert.equal(await provider.getAccessToken(), 'at-mem');
});

test('setTokens persists the refresh token to the store', () => {
  const store = memoryStore();
  const provider = createTokenProvider({ backendUrl: URL_, store, oauthClient: fakeOAuth() });
  provider.setTokens({ accessToken: 'a', refreshToken: 'rt-mem', expiresAt: Date.now() + 60_000 });
  assert.equal(store.getRefreshToken(URL_), 'rt-mem');
});

test('expired access token triggers a silent refresh and persists the rotated refresh token', async () => {
  const store = memoryStore({ [URL_]: 'rt-0' });
  const oauth = fakeOAuth();
  const provider = createTokenProvider({ backendUrl: URL_, store, oauthClient: oauth });
  assert.equal(await provider.getAccessToken(), 'at-1');
  assert.equal(oauth.calls(), 1);
  assert.equal(store.getRefreshToken(URL_), 'rt-1');
});

test('concurrent getAccessToken calls share one refresh (single-flight)', async () => {
  const store = memoryStore({ [URL_]: 'rt-0' });
  const oauth = fakeOAuth();
  const provider = createTokenProvider({ backendUrl: URL_, store, oauthClient: oauth });
  const [a, b, c] = await Promise.all([
    provider.getAccessToken(),
    provider.getAccessToken(),
    provider.getAccessToken(),
  ]);
  assert.equal(oauth.calls(), 1);
  assert.equal(a, 'at-1');
  assert.equal(b, 'at-1');
  assert.equal(c, 'at-1');
});

test('no refresh token in store -> LoginRequiredError', async () => {
  const provider = createTokenProvider({ backendUrl: URL_, store: memoryStore(), oauthClient: fakeOAuth() });
  await assert.rejects(() => provider.getAccessToken(), LoginRequiredError);
});

test('invalid_grant on refresh clears the store and throws LoginRequiredError', async () => {
  const store = memoryStore({ [URL_]: 'rt-revoked' });
  const provider = createTokenProvider({
    backendUrl: URL_,
    store,
    oauthClient: fakeOAuth({ fail: new InvalidGrantError() }),
  });
  await assert.rejects(() => provider.getAccessToken(), LoginRequiredError);
  assert.equal(store.getRefreshToken(URL_), null);
});

test('network error on refresh propagates as-is (no store clear)', async () => {
  const store = memoryStore({ [URL_]: 'rt-0' });
  const provider = createTokenProvider({
    backendUrl: URL_,
    store,
    oauthClient: fakeOAuth({ fail: new Error('fetch failed') }),
  });
  await assert.rejects(() => provider.getAccessToken(), /fetch failed/);
  assert.equal(store.getRefreshToken(URL_), 'rt-0');
});

test('handleUnauthorized drops the cached token and refreshes', async () => {
  const store = memoryStore({ [URL_]: 'rt-0' });
  const oauth = fakeOAuth();
  const provider = createTokenProvider({ backendUrl: URL_, store, oauthClient: oauth });
  provider.setTokens({ accessToken: 'at-stale', refreshToken: 'rt-0', expiresAt: Date.now() + 60_000 });
  assert.equal(await provider.handleUnauthorized(), 'at-1');
  assert.equal(oauth.calls(), 1);
  assert.equal(await provider.getAccessToken(), 'at-1');
});

test('reset drops the in-memory access token so the next call refreshes', async () => {
  const store = memoryStore({ [URL_]: 'rt-0' });
  const oauth = fakeOAuth();
  const provider = createTokenProvider({ backendUrl: URL_, store, oauthClient: oauth });

  assert.equal(await provider.getAccessToken(), 'at-1'); // refresh #1, caches in memory
  assert.equal(await provider.getAccessToken(), 'at-1'); // served from memory
  assert.equal(oauth.calls(), 1);

  provider.reset();
  assert.equal(await provider.getAccessToken(), 'at-2'); // must refresh again
  assert.equal(oauth.calls(), 2);
});
