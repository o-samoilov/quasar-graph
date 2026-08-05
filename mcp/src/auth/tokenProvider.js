import { LoginRequiredError, InvalidGrantError } from './errors.js';

export function createTokenProvider({ backendUrl, store, oauthClient, now = Date.now }) {
  let current = null;
  // The backend rotates the refresh token on every refresh; a second concurrent refresh gets invalid_grant, so refreshes are single-flight.
  let refreshing = null;

  function setTokens({ accessToken, refreshToken, expiresAt }) {
    current = { accessToken, expiresAt };
    store.setRefreshToken(backendUrl, refreshToken);
  }

  async function doRefresh() {
    const refreshToken = store.getRefreshToken(backendUrl);
    if (!refreshToken) throw new LoginRequiredError();
    try {
      setTokens(await oauthClient.refresh({ refreshToken }));
      return current.accessToken;
    } catch (err) {
      if (err instanceof InvalidGrantError) {
        store.clear(backendUrl);
        throw new LoginRequiredError();
      }
      throw err;
    }
  }

  function refreshOnce() {
    if (!refreshing) {
      refreshing = doRefresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  return {
    async getAccessToken() {
      if (current && current.expiresAt > now()) return current.accessToken;
      return refreshOnce();
    },
    handleUnauthorized() {
      current = null;
      return refreshOnce();
    },
    reset() {
      current = null;
    },
    setTokens,
  };
}
