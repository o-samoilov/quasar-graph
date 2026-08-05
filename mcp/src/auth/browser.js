import { spawn } from 'node:child_process';

export function openBrowser(url, { platform = process.platform, spawnFn = spawn } = {}) {
  const [cmd, args] =
    platform === 'darwin' ? ['open', [url]]
      : platform === 'win32' ? ['cmd', ['/c', 'start', '', url.replace(/[&^|<>]/g, '^$&')]]
        : ['xdg-open', [url]];

  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(cmd, args, { stdio: 'ignore', detached: true });
    } catch {
      resolve({ opened: false });
      return;
    }
    child.once('error', () => resolve({ opened: false }));
    child.once('spawn', () => {
      child.unref();
      resolve({ opened: true });
    });
  });
}
