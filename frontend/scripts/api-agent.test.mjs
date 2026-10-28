import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

// The missing implementation uses Node's ordinary pool so RED proves the
// missing expiry guard, rather than failing because an import is absent.
const createApiAgent = existsSync(new URL('./api-agent.mjs', import.meta.url))
  ? (await import('./api-agent.mjs')).createApiAgent
  : () => new http.Agent({ keepAlive: true, scheduling: 'lifo' });

async function fixture(t, idleTimeoutMs = 40) {
  const server = http.createServer((req, res) => {
    const send = () => res.end(String(req.socket.remotePort));
    if (req.url === '/slow') setTimeout(send, 150);
    else send();
  });
  server.keepAliveTimeout = 5000;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const agent = createApiAgent('http:', { idleTimeoutMs });
  t.after(() => { agent.destroy(); server.closeAllConnections(); server.close(); });
  return { agent, port: server.address().port };
}

async function request({ agent, port }, path = '/') {
  agent.pruneExpired?.();
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, agent }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

test('reuses a recently idle connection', async t => {
  const f = await fixture(t, 500);
  assert.equal(await request(f), await request(f));
});

test('retires expired sockets even when the event loop cannot run cleanup timers', async t => {
  const f = await fixture(t);
  const first = await request(f);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 70);
  assert.notEqual(await request(f), first);
});

test('retires idle connections without requiring another request', async t => {
  const f = await fixture(t);
  await request(f);
  await delay(100);
  assert.equal(Object.values(f.agent.freeSockets).flat().filter(s => !s.destroyed).length, 0);
});

test('cancels idle expiry when a socket serves a long request', async t => {
  const f = await fixture(t);
  const first = await request(f);
  assert.equal(await request(f, '/slow'), first);
});

test('does not accumulate close listeners across repeated reuse', async t => {
  const f = await fixture(t, 1000);
  for (let i = 0; i < 30; i++) await request(f);
  const socket = Object.values(f.agent.freeSockets).flat()[0];
  assert.ok(socket.listenerCount('close') < 8);
});

test('a delayed-FIN POST succeeds once after event-loop blockage', async t => {
  const child = fork(fileURLToPath(new URL('../tests/fixtures/api-proxy-upstream.cjs', import.meta.url)), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
  });
  const seen = [];
  child.on('message', message => { if (message.type === 'request') seen.push(message); });
  t.after(async () => { const exit = once(child, 'exit'); child.disconnect(); await exit; });
  const [ready] = await once(child, 'message');
  const agent = createApiAgent('http:', { idleTimeoutMs: 40 });
  t.after(() => agent.destroy());
  const f = { agent, port: ready.port };
  await request(f, '/api/warm');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  agent.pruneExpired?.();
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: f.port, path: '/api/write', agent, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': 2 } }, res => {
      res.resume(); res.once('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    setTimeout(() => req.end('{}'), 20);
  });
  assert.equal(result, 200);
  await delay(20);
  assert.equal(seen.filter(event => event.path === '/api/write').length, 1);
});
