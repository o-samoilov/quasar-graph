import { InvalidGrantError } from './errors.js';

export const CLIENT_ID = 'quasar-mcp';

// Treat the token as expired 30s early so a request never leaves with an already-dead Bearer.
const EXPIRY_SKEW_SECONDS = 30;

export function createOAuthClient(backendUrl, { fetch = globalThis.fetch, now = Date.now } = {}) {
  async function token(params) {
    const res = await fetch(`${backendUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    if (res.status === 400 || res.status === 401) {
      throw new InvalidGrantError(`OAuth ${params.grant_type} grant rejected: ${res.status}`);
    }
    if (!res.ok) {
      throw new Error(`Backend POST /oauth/token failed: ${res.status}`);
    }
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: now() + (data.expires_in - EXPIRY_SKEW_SECONDS) * 1000,
    };
  }

  return {
    exchangeCode: ({ code, redirectUri, codeVerifier }) =>
      token({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
        code_verifier: codeVerifier,
      }),
    refresh: ({ refreshToken }) =>
      token({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID }),
    async userinfo({ accessToken }) {
      const res = await fetch(`${backendUrl}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Backend GET /oauth/userinfo failed: ${res.status}`);
      return res.json();
    },
    async revoke({ refreshToken }) {
      const res = await fetch(`${backendUrl}/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken, client_id: CLIENT_ID }).toString(),
      });
      if (!res.ok) throw new Error(`Backend POST /oauth/revoke failed: ${res.status}`);
    },
  };
}
