import { createProxyServer } from 'httpxy';
import { createApiAgent } from './api-agent.mjs';

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */
/** @typedef {import('node:stream').Duplex} Duplex */
/** @typedef {import('node:net').Socket} Socket */
/** @typedef {{web(req: IncomingMessage, res: ServerResponse): Promise<void>, upgrade(req: IncomingMessage, socket: Socket, head: Buffer): Promise<void> | undefined, close(): void}} ApiProxy */

const HOP_HEADERS = ['connection', 'proxy-connection', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'proxy-authenticate', 'proxy-authorization'];

/** Strip hop headers, including fields named by Connection, on one HTTP leg.
 * @param {import('node:http').IncomingHttpHeaders} source
 * @returns {import('node:http').IncomingHttpHeaders}
 */
function endToEndHeaders(source) {
  const result = { ...source };
  for (const name of [...HOP_HEADERS, ...String(source.connection ?? '').split(',')]) {
    delete result[name.trim().toLowerCase()];
  }
  return result;
}

/** Match the API namespace without routing unrelated pages to the backend.
 * @param {string} url
 * @returns {boolean}
 */
export function isApiPath(url) {
  const pathname = url.split('?', 1)[0];
  return /^\/api(?:[/\\]|$)/i.test(pathname);
}

/** Preserve Next's slash redirects before any request body reaches the backend.
 * @param {string} url
 * @returns {string | undefined}
 */
function canonicalRedirect(url) {
  const query = url.indexOf('?');
  const pathname = query < 0 ? url : url.slice(0, query);
  const suffix = query < 0 ? '' : url.slice(query);
  const normalized = pathname.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (normalized !== pathname) return normalized + suffix;
  if (pathname.endsWith('/')) return pathname.slice(0, -1) + suffix;
}

/** One fixed upstream, one attempt per request, independent HTTP connection legs.
 * @param {string} backendUrl
 * @param {{idleTimeoutMs?: number, proxyTimeoutMs?: number, onError?: (detail: object) => void}} options
 * @returns {ApiProxy}
 */
export function createApiProxy(backendUrl, { idleTimeoutMs, proxyTimeoutMs = 30000,
  onError = detail => console.error(JSON.stringify(detail)) } = {}) {
  const target = new URL(backendUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) {
    throw new Error('BACKEND_INTERNAL_URL must be an HTTP(S) server URL without credentials, query or fragment');
  }
  const agent = createApiAgent(target.protocol === 'https:' ? 'https:' : 'http:', { idleTimeoutMs });
  const proxy = createProxyServer({ target, changeOrigin: true, xfwd: true, followRedirects: false });
  const upstreamRequests = new WeakMap();
  /** @type {WeakMap<IncomingMessage, string>} */
  const requestFraming = new WeakMap();
  const failures = new WeakSet();
  const upgradeSockets = new Set();

  /** Emit only transport metadata; never serialize an error containing a URL or credentials.
   * @param {NodeJS.ErrnoException} error
   * @param {IncomingMessage} req
   * @param {ServerResponse | Duplex} res
   * @returns {void}
   */
  function fail(error, req, res) {
    if (failures.has(req) || res.destroyed) return;
    failures.add(req);
    const outgoing = upstreamRequests.get(req);
    onError({ event: 'api_proxy_error', code: error.code ?? 'PROXY_ERROR',
      reusedSocket: outgoing?.reusedSocket ?? null, idleMs: outgoing ? Math.round(agent.idleAge(outgoing)) : null });
    if ('writeHead' in res) {
      if (res.headersSent) res.destroy();
      else { res.statusCode = 500; res.end('Internal Server Error'); }
    } else res.end('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  }
  proxy.on('error', fail);
  proxy.on('proxyReq', (outgoing, req, res) => {
    const transferEncoding = requestFraming.get(req);
    if (transferEncoding) {
      // Reframe before piping: httpxy inserts length 0 on bodyless-by-default methods.
      outgoing.removeHeader('content-length');
      outgoing.setHeader('transfer-encoding', transferEncoding);
    }
    upstreamRequests.set(req, outgoing);
    // Match Next's cancellation propagation even after the request body ended.
    res.once('close', () => { if (!res.writableFinished) outgoing.destroy(); });
  });
  proxy.on('proxyRes', (incoming, req, res) => {
    incoming.headers = endToEndHeaders(incoming.headers);
    incoming.headers.connection = res.shouldKeepAlive ? 'keep-alive' : 'close';
    res.once('close', () => { if (!incoming.complete) incoming.destroy(); });
    incoming.once('error', error => fail(error, req, res));
    if (res.destroyed) incoming.destroy();
  });
  proxy.on('proxyReqWs', outgoing => {
    outgoing.once('socket', socket => {
      upgradeSockets.add(socket);
      socket.once('close', () => upgradeSockets.delete(socket));
    });
  });

  return {
    /** Dispatch synchronously after pruning so delayed FIN events cannot win an idle-age race. */
    web(req, res) {
      const redirect = canonicalRedirect(req.url ?? '/api');
      if (redirect) {
        res.writeHead(308, { location: redirect, refresh: `0;url=${redirect}` });
        res.end(redirect);
        return Promise.resolve();
      }
      req.url = req.url?.replace(/^\/api(?=\/|\?|$)/i, '/api');
      const host = req.headers.host ?? '';
      const transferEncoding = req.headers['transfer-encoding'];
      if (transferEncoding) requestFraming.set(req, transferEncoding);
      req.headers = endToEndHeaders(req.headers);
      req.headers.connection = 'keep-alive';
      req.headers['x-forwarded-host'] = host;
      // Expect flushes headers early and httpxy skips proxyReq. Preserve framing
      // before construction; only this case lets httpxy close the upstream leg.
      if (transferEncoding && req.headers.expect) req.headers['transfer-encoding'] = transferEncoding;
      agent.pruneExpired();
      return proxy.web(req, res, { agent, proxyTimeout: proxyTimeoutMs }).catch(error => fail(error, req, res));
    },
    /** WebSockets never borrow the ordinary HTTP pool. */
    upgrade(req, socket, head) {
      const tokens = String(req.headers.connection ?? '').toLowerCase().split(',').map(s => s.trim());
      if (!tokens.includes('upgrade') || !req.headers.upgrade?.trim()) {
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      req.url = req.url?.replace(/^\/api(?=\/|\?|$)/i, '/api');
      return proxy.ws(req, socket, { agent: false, proxyTimeout: 0 }, head).catch(error => fail(error, req, socket));
    },
    close() {
      agent.destroy();
      for (const socket of upgradeSockets) socket.destroy();
      proxy.close();
    },
  };
}
