const http = require('node:http');
const path = require('node:path');
const { parseArgs } = require('node:util');

/** Start the same API transport in development and production. @returns {Promise<void>} */
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    hostname: { type: 'string', default: '0.0.0.0' },
    port: { type: 'string', default: process.env.PORT || '3000' },
    webpack: { type: 'boolean' }, turbopack: { type: 'boolean' },
    check: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log(`Usage: node scripts/next-server.js ${positionals[0] || '<dev|start>'} [options]\n` +
      'Options: --hostname <host> --port <port> --webpack --turbopack --check --help');
    return;
  }
  const { createApiProxy, isApiPath } = await import('./api-proxy.mjs');
  if (values.check) { require('next'); console.log('API_PROXY_RUNTIME=PASS'); return; }
  const mode = positionals[0];
  if (!['dev', 'start'].includes(mode)) throw new Error('Expected dev or start');
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid server port');
  const dev = mode === 'dev';
  Object.assign(process.env, { NODE_ENV: dev ? 'development' : 'production' });
  // Next's CommonJS export is the callable function; its declarations use default export.
  const next = /** @type {typeof import('next').default} */ (/** @type {unknown} */ (require('next')));
  // Next installs its own HMR upgrade listener on first page access. Give it
  // an unbound event server so it never also consumes our API WebSockets.
  const nextUpgrades = http.createServer();
  const app = next({ dev, dir: path.resolve(__dirname, '..'), hostname: values.hostname,
    port, httpServer: nextUpgrades, webpack: values.webpack, turbopack: values.turbopack });
  await app.prepare();
  // Next loads .env files during prepare; raw/start must honor those too.
  let proxy;
  try {
    proxy = createApiProxy(process.env.BACKEND_INTERNAL_URL?.trim() || `http://localhost:${dev ? 8011 : 8010}`);
  } catch (error) {
    await app.close();
    throw error;
  }
  const handle = app.getRequestHandler();
  const server = http.createServer((req, res) => {
    const action = isApiPath(req.url || '/') ? proxy.web(req, res) : handle(req, res);
    Promise.resolve(action).catch(() => {
      if (res.headersSent) res.destroy();
      else { res.statusCode = 500; res.end('Internal Server Error'); }
    });
  });
  const connections = new Set();
  server.on('connection', socket => {
    connections.add(socket);
    socket.once('close', () => connections.delete(socket));
  });
  server.on('upgrade', (req, socket, head) => {
    if (isApiPath(req.url || '/')) void proxy.upgrade(req, /** @type {import('node:net').Socket} */ (socket), head);
    else if (!nextUpgrades.emit('upgrade', req, socket, head)) socket.destroy();
  });
  let stopping = false;
  /** Stop accepting work, allow a bounded drain, then release streams and pools. @returns {void} */
  function shutdown() {
    if (stopping) return;
    stopping = true;
    let finished = false;
    /** Release resources once even if the drain callback and deadline race. @returns {void} */
    function finish() {
      if (finished) return;
      finished = true;
      proxy.close();
      for (const socket of connections) socket.destroy();
      void app.close().then(() => process.exit(0), () => process.exit(1));
    }
    const deadline = setTimeout(finish, 5000);
    deadline.unref();
    server.close(() => {
      clearTimeout(deadline);
      finish();
    });
    server.closeIdleConnections();
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, shutdown);
  server.on('error', error => {
    console.error(JSON.stringify({ event: 'frontend_server_error', code: /** @type {NodeJS.ErrnoException} */ (error).code ?? 'LISTEN_ERROR' }));
    proxy.close();
    void app.close().then(() => process.exit(1), () => process.exit(1));
  });
  server.listen(port, values.hostname, () => console.log(`DEXCOWIN MES ${mode} ready on port ${port}`));
}

main().catch(error => { console.error(error); process.exit(1); });
