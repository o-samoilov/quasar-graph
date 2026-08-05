import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBrowser } from '../src/auth/browser.js';

function fakeSpawn(emit = 'spawn') {
  const calls = [];
  const fn = (cmd, args) => {
    calls.push({ cmd, args });
    return {
      once(event, cb) {
        if (event === emit) queueMicrotask(cb);
      },
      unref() {},
    };
  };
  fn.calls = calls;
  return fn;
}

const URL_ = 'https://api.local/oauth/authorize?x=1';

test('darwin uses `open <url>`', async () => {
  const spawnFn = fakeSpawn();
  const { opened } = await openBrowser(URL_, { platform: 'darwin', spawnFn });
  assert.equal(opened, true);
  assert.deepEqual(spawnFn.calls[0], { cmd: 'open', args: [URL_] });
});

test('linux uses `xdg-open <url>`', async () => {
  const spawnFn = fakeSpawn();
  await openBrowser(URL_, { platform: 'linux', spawnFn });
  assert.deepEqual(spawnFn.calls[0], { cmd: 'xdg-open', args: [URL_] });
});

test('linux passes a URL containing `&` through verbatim (no escaping on non-win32)', async () => {
  const spawnFn = fakeSpawn();
  const urlWithAmp = 'https://api.local/oauth/authorize?a=1&b=2';
  await openBrowser(urlWithAmp, { platform: 'linux', spawnFn });
  assert.deepEqual(spawnFn.calls[0], { cmd: 'xdg-open', args: [urlWithAmp] });
});

test('win32 uses `cmd /c start "" <url>` and escapes cmd metacharacters like `&`', async () => {
  const spawnFn = fakeSpawn();
  const urlWithAmp = 'https://api.local/oauth/authorize?a=1&b=2';
  await openBrowser(urlWithAmp, { platform: 'win32', spawnFn });
  assert.deepEqual(spawnFn.calls[0], {
    cmd: 'cmd',
    args: ['/c', 'start', '', 'https://api.local/oauth/authorize?a=1^&b=2'],
  });
});

test('spawn error event -> opened: false', async () => {
  const { opened } = await openBrowser(URL_, { platform: 'linux', spawnFn: fakeSpawn('error') });
  assert.equal(opened, false);
});

test('spawn throwing synchronously -> opened: false', async () => {
  const { opened } = await openBrowser(URL_, {
    platform: 'linux',
    spawnFn: () => { throw new Error('ENOENT'); },
  });
  assert.equal(opened, false);
});
