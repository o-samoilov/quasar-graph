import { createServer } from 'node:http';

const SUCCESS_PAGE = `<!doctype html><meta charset="utf-8"><title>quasar-graph</title>
<body style="font-family:system-ui;text-align:center;padding-top:4rem">
<h1>Signed in</h1><p>You can close this tab and return to the terminal.</p></body>`;

export function startLoopback({ state, timeoutMs = 300_000 }) {
  return new Promise((resolveStart) => {
    let settle;
    const result = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });
    // Dummy handler: suppress unhandled-rejection warnings; real consumers still get the rejection.
    result.catch(() => {});

    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
      }
      if (url.searchParams.get('state') !== state) {
        // Foreign/forged request: answer 400 and keep waiting for the real callback.
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('state mismatch');
        return;
      }
      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Authorization failed: ${error}. You can close this tab.`);
        finish(() => settle.reject(new Error(`Authorization failed: ${error}`)));
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('missing code');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(SUCCESS_PAGE);
      finish(() => settle.resolve({ code }));
    });

    const timer = setTimeout(() => {
      finish(() => settle.reject(new Error(`Timed out waiting for the browser callback (${Math.round(timeoutMs / 1000)}s).`)));
    }, timeoutMs);

    let done = false;
    function finish(cb) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      cb();
    }

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveStart({
        port,
        redirectUri: `http://127.0.0.1:${port}/callback`,
        result,
        close: () => finish(() => settle.reject(new Error('Login cancelled.'))),
      });
    });
  });
}
