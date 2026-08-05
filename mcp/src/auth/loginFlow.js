import { generatePkce } from './pkce.js';
import { startLoopback } from './loopback.js';
import { openBrowser } from './browser.js';
import { CLIENT_ID } from './oauthClient.js';

export function buildAuthorizeUrl(backendUrl, { codeChallenge, state, redirectUri }) {
  const url = new URL(`${backendUrl}/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  return url.toString();
}

export async function startLogin({
  backendUrl,
  oauthClient,
  tokenProvider,
  openBrowserFn = openBrowser,
  startLoopbackFn = startLoopback,
  timeoutMs,
}) {
  const { codeVerifier, codeChallenge, state } = generatePkce();
  const loopback = await startLoopbackFn({ state, timeoutMs });
  const authorizeUrl = buildAuthorizeUrl(backendUrl, {
    codeChallenge,
    state,
    redirectUri: loopback.redirectUri,
  });
  const { opened } = await openBrowserFn(authorizeUrl);
  const completion = loopback.result.then(async ({ code }) => {
    const tokens = await oauthClient.exchangeCode({
      code,
      redirectUri: loopback.redirectUri,
      codeVerifier,
    });
    tokenProvider.setTokens(tokens);
  });
  return { authorizeUrl, opened, completion };
}
