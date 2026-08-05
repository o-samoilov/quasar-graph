export async function logout({ backendUrl, store, auth, oauthClient }) {
  const refreshToken = store.getRefreshToken(backendUrl);
  let revoked = false;
  let warning;

  if (refreshToken) {
    try {
      await oauthClient.revoke({ refreshToken });
      revoked = true;
    } catch (err) {
      warning = String(err?.message ?? err);
    }
  }

  // Local cleanup is unconditional: a failed revoke must not keep the machine logged in.
  store.clear(backendUrl);
  auth.reset();

  const out = { logged_out: true, revoked, backend_url: backendUrl };
  if (warning) out.warning = warning;
  return out;
}
