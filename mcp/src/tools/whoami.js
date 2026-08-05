import { LoginRequiredError } from '../auth/errors.js';
import { decodeJwtPayload } from '../auth/jwt.js';

export async function whoami({ backendUrl, auth, oauthClient }) {
  let accessToken;
  try {
    accessToken = await auth.getAccessToken();
  } catch (err) {
    if (err instanceof LoginRequiredError) {
      return { logged_in: false, backend_url: backendUrl };
    }
    throw err;
  }

  const claims = decodeJwtPayload(accessToken) ?? {};
  const base = { logged_in: true, backend_url: backendUrl };
  if (Number.isFinite(claims.exp)) base.token_expires_at = new Date(claims.exp * 1000).toISOString();

  try {
    const info = await oauthClient.userinfo({ accessToken });
    return { ...base, user_id: info.user_id, username: info.username ?? null, email: info.email ?? null };
  } catch (err) {
    // The refresh just succeeded, so the login itself is valid — report it, degraded.
    return { ...base, user_id: claims.sub ?? null, warning: String(err?.message ?? err) };
  }
}
