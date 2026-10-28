import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Check the real Next router and HMR after the managed API boundary is installed. */
test('custom Next entry serves pages, static assets, API and independent HMR/API upgrades', { timeout: 90000 }, async t => {
  const base = path.resolve(frontend, '../_attic/runtime/proxy-integration-tests');
  const root = path.join(base, randomUUID());
  let child, upstream;
  const upgrades = new Set();
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(root, 'app'));
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.send('stop', () => {});
      const timer = setTimeout(() => {
        if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else process.kill(-child.pid, 'SIGKILL');
      }, 8000);
      try { await exit; } finally { clearTimeout(timer); }
    }
    if (upstream) {
      for (const socket of upgrades) socket.destroy();
      upstream.closeAllConnections();
      await new Promise(resolve => upstream.close(resolve));
    }
    const actual = await fs.realpath(root);
    const intended = path.resolve(await fs.realpath(frontend), '../_attic/runtime/proxy-integration-tests');
    if (!actual.toLowerCase().startsWith((intended + path.sep).toLowerCase())) throw new Error('Unsafe fixture cleanup');
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  for (const name of ['next-server.js', 'api-proxy.mjs', 'api-agent.mjs']) {
    await fs.copyFile(path.join(frontend, 'scripts', name), path.join(root, 'scripts', name));
  }
  await fs.writeFile(path.join(root, 'package.json'), '{"private":true}');
  await fs.writeFile(path.join(root, 'app/layout.jsx'), 'export default function Layout({children}){return <html><body>{children}</body></html>}');
  await fs.writeFile(path.join(root, 'app/page.jsx'), 'export default function Page(){return <main>managed proxy integration</main>}');
  await fs.writeFile(path.join(root, 'next.config.js'), 'module.exports={allowedDevOrigins:["127.0.0.1"]}');
  await fs.symlink(path.join(frontend, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  let requests = 0;
  let streamClosed;
  const cancelled = new Promise(resolve => { streamClosed = resolve; });
  upstream = http.createServer((req, res) => {
    requests++;
    if (req.url === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: active\n\n');
      res.once('close', streamClosed);
    } else if (req.url === '/api/body') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => res.end(Buffer.concat(chunks)));
    } else res.end(req.url);
  });
  upstream.on('upgrade', (_req, socket) => {
    upgrades.add(socket); socket.once('close', () => upgrades.delete(socket));
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  await fs.writeFile(path.join(root, '.env.local'), `BACKEND_INTERNAL_URL=http://127.0.0.1:${upstream.address().port}\n`);
  const reservation = http.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
  delete env.BACKEND_INTERNAL_URL;
  child = fork(path.join(root, 'scripts/next-server.js'), ['dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, windowsHide: true, detached: process.platform !== 'win32',
    execArgv: ['--require', path.join(frontend, 'tests/fixtures/api-proxy-stop.cjs')],
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let log = '';
  child.stdout.on('data', c => { log += c; }); child.stderr.on('data', c => { log += c; });
  async function get(url) {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port, path: url, agent: false }, res => {
        let body = ''; res.on('data', c => { body += c; }); res.once('end', () => resolve({ status: res.statusCode, body })); res.on('error', reject);
      });
      req.on('error', reject); req.setTimeout(10000, () => req.destroy(new Error('HTTP timeout')));
    });
  }
  let page;
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.equal(child.exitCode, null, log);
    try { page = await get('/'); if (page.status === 200) break; } catch {}
    await delay(100);
  }
  assert.equal(page?.status, 200, log);
  const asset = page.body.match(/(?:src|href)="([^"?]*\/_next\/static\/[^"?]+)/);
  assert(asset); assert.equal((await get(asset[1])).status, 200);
  assert.equal(requests, 0);
  assert.equal((await get('/api/echo?a=%2F')).body, '/api/echo?a=%2F');
  assert.equal(requests, 1);
  for (const method of ['DELETE', 'OPTIONS']) {
    const body = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/body', method,
        headers: { 'transfer-encoding': 'chunked' } }, res => {
        let text = ''; res.on('data', chunk => { text += chunk; });
        res.on('error', reject); res.once('end', () => resolve({ status: res.statusCode, text }));
      });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Body timeout')));
      req.write('first-'); req.end('second');
    });
    assert.deepEqual(body, { status: 200, text: 'first-second' });
  }
  assert.equal(requests, 3);
  for (const url of ['/api/socket', '/_next/hmr']) {
    await new Promise((resolve, reject) => {
      const req = http.request({ host:'127.0.0.1', port, path:url, headers: {
        connection:'Upgrade', upgrade:'websocket', 'sec-websocket-version':'13',
        'sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ==', origin:`http://127.0.0.1:${port}` } });
      req.once('upgrade', (res, socket) => { assert.equal(res.statusCode,101); socket.destroy(); resolve(); });
      req.once('response', res => { res.resume(); reject(new Error(`Upgrade failed: ${url}`)); });
      req.once('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Upgrade timeout'))); req.end();
    });
  }
  const stream = http.get({ host: '127.0.0.1', port, path: '/api/events', agent: false });
  stream.on('error', () => {});
  await new Promise((resolve, reject) => {
    stream.once('response', res => { res.on('error', () => {}); res.once('data', resolve); });
    stream.once('error', reject);
  });
  const exit = once(child, 'exit');
  const stopAt = Date.now();
  child.send('stop');
  const [code] = await exit;
  assert.equal(code, 0, log);
  assert(Date.now() - stopAt < 8000, 'shutdown must honor the bounded stream drain');
  await cancelled;
});
