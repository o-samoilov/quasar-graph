import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logout } from '../src/tools/logout.js';

function deps({ refreshToken = null, revokeError = null } = {}) {
  const calls = { revoke: 0, clear: 0, reset: 0 };
  return {
    calls,
    backendUrl: 'https://api.local',
    store: {
      getRefreshToken: () => refreshToken,
      clear: () => { calls.clear++; },
    },
    auth: { reset: () => { calls.reset++; } },
    oauthClient: {
      async revoke() {
        calls.revoke++;
        if (revokeError) throw revokeError;
      },
    },
  };
}

test('revokes on the backend and clears locally', async () => {
  const d = deps({ refreshToken: 'rt-1' });
  const res = await logout(d);
  assert.deepEqual(res, { logged_out: true, revoked: true, backend_url: 'https://api.local' });
  assert.deepEqual(d.calls, { revoke: 1, clear: 1, reset: 1 });
});

test('revoke failure still clears locally, reports revoked:false + warning', async () => {
  const d = deps({ refreshToken: 'rt-1', revokeError: new Error('Backend POST /oauth/revoke failed: 500') });
  const res = await logout(d);
  assert.equal(res.logged_out, true);
  assert.equal(res.revoked, false);
  assert.match(res.warning, /revoke failed: 500/);
  assert.deepEqual(d.calls, { revoke: 1, clear: 1, reset: 1 });
});

test('idempotent: no stored token → revoked:false, no revoke call, no warning', async () => {
  const d = deps({ refreshToken: null });
  const res = await logout(d);
  assert.deepEqual(res, { logged_out: true, revoked: false, backend_url: 'https://api.local' });
  assert.deepEqual(d.calls, { revoke: 0, clear: 1, reset: 1 });
});
