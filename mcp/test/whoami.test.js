import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whoami } from '../src/tools/whoami.js';
import { LoginRequiredError } from '../src/auth/errors.js';

const EXP = 1_800_000_000; // 2027-01-15T08:00:00.000Z

function fakeJwt(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
}

function deps({ token, tokenError, userinfoResult, userinfoError } = {}) {
  return {
    backendUrl: 'https://api.local',
    auth: {
      async getAccessToken() {
        if (tokenError) throw tokenError;
        return token;
      },
    },
    oauthClient: {
      async userinfo() {
        if (userinfoError) throw userinfoError;
        return userinfoResult;
      },
    },
  };
}

test('logged in: refresh + userinfo produce the full response', async () => {
  const res = await whoami(deps({
    token: fakeJwt({ sub: 'u-1', exp: EXP }),
    userinfoResult: { user_id: 'u-1', username: 'sam', email: 'a@b.c' },
  }));
  assert.deepEqual(res, {
    logged_in: true,
    backend_url: 'https://api.local',
    token_expires_at: new Date(EXP * 1000).toISOString(),
    user_id: 'u-1',
    username: 'sam',
    email: 'a@b.c',
  });
});

test('null email from userinfo stays null', async () => {
  const res = await whoami(deps({
    token: fakeJwt({ sub: 'u-1', exp: EXP }),
    userinfoResult: { user_id: 'u-1', username: 'sam', email: null },
  }));
  assert.equal(res.email, null);
});

test('LoginRequiredError is a normal logged_in:false response', async () => {
  const res = await whoami(deps({ tokenError: new LoginRequiredError() }));
  assert.deepEqual(res, { logged_in: false, backend_url: 'https://api.local' });
});

test('other getAccessToken errors propagate', async () => {
  await assert.rejects(
    () => whoami(deps({ tokenError: new Error('ECONNREFUSED') })),
    /ECONNREFUSED/,
  );
});

test('degraded: userinfo failure falls back to JWT sub + warning, no email key', async () => {
  const res = await whoami(deps({
    token: fakeJwt({ sub: 'u-1', exp: EXP }),
    userinfoError: new Error('Backend GET /oauth/userinfo failed: 500'),
  }));
  assert.equal(res.logged_in, true);
  assert.equal(res.user_id, 'u-1');
  assert.equal(res.token_expires_at, new Date(EXP * 1000).toISOString());
  assert.match(res.warning, /userinfo failed: 500/);
  assert.equal('email' in res, false);
  assert.equal('username' in res, false);
});

test('malformed exp claim omits token_expires_at instead of throwing', async () => {
  const res = await whoami(deps({
    token: fakeJwt({ sub: 'u-1', exp: 'garbage' }),
    userinfoResult: { user_id: 'u-1', username: 'sam', email: null },
  }));
  assert.equal(res.logged_in, true);
  assert.equal('token_expires_at' in res, false);
});
