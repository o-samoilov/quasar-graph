import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { quasarDir } from '../paths.js';

export function defaultTokensPath(home = homedir()) {
  return join(quasarDir(home), 'tokens.json');
}

export function createTokenStore(filePath = defaultTokensPath()) {
  function readAll() {
    try {
      return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  // Atomic write (tmp + rename): a crash mid-write must not lose the previous refresh token — rotation makes the loss unrecoverable.
  function writeAll(data) {
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(tmp, filePath);
  }

  return {
    getRefreshToken(backendUrl) {
      return readAll()[backendUrl]?.refresh_token ?? null;
    },
    setRefreshToken(backendUrl, refreshToken) {
      const data = readAll();
      data[backendUrl] = { refresh_token: refreshToken };
      writeAll(data);
    },
    clear(backendUrl) {
      const data = readAll();
      if (backendUrl in data) {
        delete data[backendUrl];
        writeAll(data);
      }
    },
  };
}
