export function normalizeRepoUrl(url) {
  if (!url) return url ?? null;
  const u = url.trim();
  let host;
  let path;
  const scp = u.match(/^(?:[^@/]+@)?([^/:]+):(.+)$/);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && scp) {
    [, host, path] = scp;
  } else {
    const m = u.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i);
    if (!m) return url;
    [, host, path] = m;
  }
  path = path.replace(/\.git$/, '').replace(/\/$/, '');
  return `https://${host}/${path}`;
}

export function denormalizeRepoUrl(url, protocol) {
  if (!url) return url ?? null;
  if (protocol !== 'ssh') return url;
  const m = url.trim().match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (!m) return url;
  const [, host, path] = m;
  return `git@${host}:${path}.git`;
}
