import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { createProxyServer } from 'httpxy';

const createApiProxy = existsSync(new URL('./api-proxy.mjs', import.meta.url))
  ? (await import('./api-proxy.mjs')).createApiProxy
  : target => createProxyServer({ target, changeOrigin: true, agent: false });

test('matches API paths and excludes pages and static resources', async () => {
  const { isApiPath } = await import('./api-proxy.mjs');
  for (const url of ['/api', '/api?x=1', '/api/bom/parent-ids', '/api/realtime/stream?x=1', '/API/echo', '/api\\echo']) assert.equal(isApiPath(url), true);
  for (const url of ['/mes', '/_next/static/a.js', '/api-other', '//other/api']) assert.equal(isApiPath(url), false);
});

async function fixture(t, handler, options = {}) {
  const requests = [];
  const parseErrors = [];
  const upstream = http.createServer((req, res) => {
    requests.push(req);
    handler(req, res);
  });
  upstream.on('clientError', (error, socket) => {
    parseErrors.push(error.code);
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const errors = [];
  const proxy = createApiProxy(`http://127.0.0.1:${upstream.address().port}`, {
    idleTimeoutMs: 500, onError: error => errors.push(error), ...options,
  });
  const server = http.createServer((req, res) => { void proxy.web(req, res); });
  server.on('upgrade', (req, socket, head) => proxy.upgrade?.(req, socket, head));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const agent = new http.Agent({ keepAlive: true });
  t.after(() => {
    agent.destroy(); proxy.close();
    server.closeAllConnections(); server.close();
    upstream.closeAllConnections(); upstream.close();
  });
  return { port: server.address().port, agent, upstream, requests, errors, parseErrors };
}

async function request(f, { method = 'GET', path = '/api/echo?x=%2F&x=2', headers = {}, chunks = [], gap = 0, onEnd = () => {}, waitForContinue = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: f.port, path, method, agent: f.agent, headers }, res => {
      const body = [];
      res.on('data', c => body.push(c));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(body), reused: req.reusedSocket }));
    });
    req.on('error', reject);
    const send = async () => {
      for (const chunk of chunks) { req.write(chunk); if (gap) await delay(gap); }
      onEnd();
      req.end();
    };
    if (waitForContinue) { req.once('continue', () => { void send().catch(reject); }); req.flushHeaders(); }
    else void send().catch(reject);
  });
}

for (const method of ['DELETE', 'OPTIONS', 'GET', 'POST', 'PUT', 'PATCH']) {
  test(`preserves chunked ${method} JSON, binary and empty bodies`, { timeout: 5000 }, async t => {
    const seen = [];
    const f = await fixture(t, (req, res) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        seen.push({ body: Buffer.concat(chunks), headers: req.headers });
        res.end(Buffer.concat(chunks));
      });
    });
    for (const body of [Buffer.from('{"pin":"synthetic","name":"검증"}'), Buffer.from([0, 128, 255, 13, 10]), Buffer.alloc(0)]) {
      const r = await request(f, { method, headers: { 'transfer-encoding': 'chunked' },
        chunks: [body.subarray(0, 2), body.subarray(2)], gap: 5 });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, body);
      assert.deepEqual(seen.at(-1).body, body);
      assert.equal(seen.at(-1).headers['transfer-encoding'], 'chunked');
      assert.equal(seen.at(-1).headers['content-length'], undefined);
    }
    assert.equal((await request(f)).status, 200);
    assert.equal(f.requests.length, 4);
    assert.deepEqual(f.parseErrors, []); assert.deepEqual(f.errors, []);
  });
}

test('preserves explicit lengths, bodyless methods and 204 responses', async t => {
  const seen = [];
  const f = await fixture(t, (req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      seen.push({ body: Buffer.concat(chunks), headers: req.headers });
      res.statusCode = 204; res.end();
    });
  });
  const body = Buffer.from('{"pin":"synthetic"}');
  for (const method of ['DELETE', 'OPTIONS', 'GET', 'POST', 'PUT', 'PATCH']) {
    for (const payload of [body, Buffer.alloc(0)]) {
      const r = await request(f, { method, headers: { 'content-length': payload.length }, chunks: [payload] });
      assert.equal(r.status, 204); assert.equal(r.body.length, 0);
      assert.deepEqual(seen.at(-1).body, payload);
      assert.equal(seen.at(-1).headers['content-length'], String(payload.length));
      assert.equal(seen.at(-1).headers['transfer-encoding'], undefined);
    }
  }
  for (const method of ['DELETE', 'OPTIONS']) {
    assert.equal((await request(f, { method })).status, 204);
    assert.equal(seen.at(-1).headers['content-length'], '0');
    assert.equal(seen.at(-1).headers['transfer-encoding'], undefined);
  }
  assert.equal(f.requests.length, 14); assert.deepEqual(f.parseErrors, []);
});

test('streams a chunked DELETE before upload completion and cancels it once', { timeout: 5000 }, async t => {
  let firstChunk, cancelled;
  const began = new Promise(resolve => { firstChunk = resolve; });
  const aborted = new Promise(resolve => { cancelled = resolve; });
  let bytes = 0;
  const f = await fixture(t, req => {
    req.on('data', chunk => { bytes += chunk.length; firstChunk(); });
    req.once('aborted', cancelled);
  });
  const req = http.request({ host: '127.0.0.1', port: f.port, path: '/api/write', method: 'DELETE',
    headers: { 'transfer-encoding': 'chunked' } });
  req.on('error', () => {}); t.after(() => req.destroy());
  req.write('first');
  await began;
  assert.equal(req.writableFinished, false);
  req.destroy(); await aborted;
  assert.equal(bytes, 5); assert.equal(f.requests.length, 1);
  // Deliberately aborting an unfinished chunk stream can surface an EOF at the origin.
  assert(f.parseErrors.length <= 1); assert(f.parseErrors.every(code => code === 'HPE_INVALID_EOF_STATE'));
});

test('keeps a complete chunked DELETE separate from a following request on the same TCP connection', { timeout: 5000 }, async t => {
  const seen = [];
  const f = await fixture(t, (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { seen.push({ method: req.method, body }); res.end('ok'); });
  });
  const socket = net.connect(f.port, '127.0.0.1'); t.after(() => socket.destroy());
  await once(socket, 'connect');
  let response = ''; socket.on('data', chunk => { response += chunk; });
  const closed = once(socket, 'close');
  socket.write('DELETE /api/write HTTP/1.1\r\nHost: synthetic\r\nTransfer-Encoding: chunked\r\n\r\n3\r\none\r\n3\r\ntwo\r\n0\r\n\r\nGET /api/next HTTP/1.1\r\nHost: synthetic\r\nConnection: close\r\n\r\n');
  await closed;
  assert.equal((response.match(/HTTP\/1\.1 200/g) ?? []).length, 2);
  assert.deepEqual(seen, [{ method: 'DELETE', body: 'onetwo' }, { method: 'GET', body: '' }]);
  assert.equal(f.requests.length, 2); assert.deepEqual(f.parseErrors, []); assert.deepEqual(f.errors, []);
});

for (const method of ['DELETE', 'OPTIONS']) {
  test(`preserves chunked ${method} with 100-continue and browser reuse`, { timeout: 5000 }, async t => {
    const seen = [];
    const f = await fixture(t, (req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        seen.push({ body, headers: req.headers, port: req.socket.remotePort }); res.end(body);
      });
    });
    await request(f);
    const r = await request(f, { method, waitForContinue: true,
      headers: { expect: '100-continue', 'transfer-encoding': 'chunked' }, chunks: ['one-', 'write'], gap: 5 });
    assert.equal(r.status, 200); assert.equal(r.body.toString(), 'one-write');
    assert.equal(r.headers.connection, 'keep-alive'); assert.equal(r.reused, true);
    const expected = seen.at(-1);
    assert.equal(expected.headers.expect, '100-continue');
    assert.equal(expected.headers['transfer-encoding'], 'chunked');
    assert.equal(expected.headers['content-length'], undefined);
    assert.equal((await request(f)).reused, true);
    assert.notEqual(seen.at(-1).port, expected.port, 'Expect request must retire its upstream connection');
    assert.equal(f.requests.filter(req => req.method === method).length, 1);
    assert.deepEqual(f.parseErrors, []); assert.deepEqual(f.errors, []);
  });
}

test('reuses both legs for 100 sequential chunked requests without parser errors', async t => {
  const ports = new Set();
  const f = await fixture(t, (req, res) => {
    ports.add(req.socket.remotePort); req.on('data', () => {}); req.on('end', () => res.end('ok'));
  }, { idleTimeoutMs: 1000 });
  let reused = 0;
  for (let i = 0; i < 100; i++) {
    const r = await request(f, { method: i % 2 ? 'DELETE' : 'OPTIONS',
      headers: { 'transfer-encoding': 'chunked' }, chunks: ['one', '-write'] });
    assert.equal(r.status, 200); assert.equal(r.body.toString(), 'ok'); if (r.reused) reused++;
  }
  assert(reused >= 90); assert(100 - ports.size >= 90);
  assert.equal(f.requests.length, 100); assert.deepEqual(f.parseErrors, []); assert.deepEqual(f.errors, []);
  t.diagnostic(JSON.stringify({ count: 100, clientReusePercent: reused,
    upstreamReusePercent: 100 - ports.size, parseErrors: 0, errors: 0 }));
});

for (const upstreamConnection of ['keep-alive', 'close']) {
  test(`keeps request boundaries after early chunked DELETE rejection with upstream ${upstreamConnection}`, { timeout: 5000 }, async t => {
    const seen = [];
    const f = await fixture(t, (req, res) => {
      const record = { method: req.method, url: req.url, bytes: 0 }; seen.push(record);
      if (req.method === 'GET') { res.end('next-ok'); return; }
      req.once('data', chunk => {
        record.bytes += chunk.length;
        res.writeHead(403, { connection: upstreamConnection }); res.end('denied');
      });
    });
    const socket = net.connect(f.port, '127.0.0.1'); t.after(() => socket.destroy());
    await once(socket, 'connect');
    let response = '';
    socket.on('data', chunk => { response += chunk; });
    const waitFor = async value => { while (!response.includes(value)) await once(socket, 'data'); };
    socket.write('DELETE /api/reject HTTP/1.1\r\nHost: synthetic\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nfirst\r\n');
    await waitFor('denied');
    assert.match(response, /connection: keep-alive/i);
    const closed = once(socket, 'close');
    socket.write('4\r\nlast\r\n0\r\n\r\nGET /api/next HTTP/1.1\r\nHost: synthetic\r\nConnection: close\r\n\r\n');
    await closed;
    assert.match(response, /next-ok/);
    assert.deepEqual(seen, [{ method: 'DELETE', url: '/api/reject', bytes: 5 }, { method: 'GET', url: '/api/next', bytes: 0 }]);
    assert.equal(f.requests.length, 2);
    // Early rejection retires the unfinished origin upload; only its EOF is expected.
    assert(f.parseErrors.length <= 1); assert(f.parseErrors.every(code => code === 'HPE_INVALID_EOF_STATE'));
    assert.deepEqual(f.errors, []);
  });
}

test('reuses both TCP connections across ordinary API reads', async t => {
  const f = await fixture(t, (req, res) => res.end(String(req.socket.remotePort)));
  const a = await request(f), b = await request(f);
  assert.equal(b.reused, true);
  assert.equal(a.body.toString(), b.body.toString());
});

test('preserves Next API prefix matching and canonical redirects without forwarding writes', async t => {
  const f = await fixture(t, (req, res) => res.end(req.url));
  assert.equal((await request(f, { path: '/API/echo?x=%2F&x=2' })).body.toString(), '/api/echo?x=%2F&x=2');
  for (const [path, destination] of [
    ['/api/echo/', '/api/echo'],
    ['/api//echo/?x=%2F&x=2', '/api/echo/?x=%2F&x=2'],
    ['/api/a\\echo', '/api/a/echo'],
  ]) {
    const r = await request(f, { path, method: 'POST', chunks: ['one-write'] });
    assert.equal(r.status, 308);
    assert.equal(r.headers.location, destination);
    assert.equal(r.headers.refresh, `0;url=${destination}`);
    assert.equal(r.body.toString(), destination);
  }
  assert.equal(f.requests.length, 1, 'redirects must not send a POST to the upstream');
});

test('keeps browser connection when upstream explicitly closes its connection', async t => {
  const f = await fixture(t, (_req, res) => { res.setHeader('connection', 'close'); res.end('ok'); });
  assert.equal((await request(f)).headers.connection, 'keep-alive');
  assert.equal((await request(f)).reused, true);
});

test('does not carry another employee credentials on a reused upstream socket', async t => {
  const f = await fixture(t, (req, res) => res.end(JSON.stringify({
    actor: req.headers['x-actor-employee-id'], cookie: req.headers.cookie, port: req.socket.remotePort,
  })));
  const first = JSON.parse((await request(f, { headers: { 'x-actor-employee-id': 'first', cookie: 'first-session=1' } })).body);
  const second = JSON.parse((await request(f, { headers: { 'x-actor-employee-id': 'second' } })).body);
  assert.equal(first.port, second.port);
  assert.equal(second.actor, 'second'); assert.equal(second.cookie, undefined);
});

test('removes incomplete upgrade and connection-nominated headers from ordinary HTTP', async t => {
  const f = await fixture(t, (req, res) => res.end(JSON.stringify(req.headers)));
  const r = await request(f, { headers: { upgrade: 'websocket', connection: 'keep-alive, x-hop', 'x-hop': 'local-only' } });
  const headers = JSON.parse(r.body);
  assert.equal(headers.upgrade, undefined); assert.equal(headers['x-hop'], undefined);
  assert.equal(headers.connection, 'keep-alive');
});

test('preserves JSON, auth, cookies, raw query, response status and multiple Set-Cookie values', async t => {
  const f = await fixture(t, (req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.writeHead(422, { 'set-cookie': ['one=1; HttpOnly', 'two=2; SameSite=Lax'] });
      res.end(JSON.stringify({ body, path: req.url, headers: req.headers }));
    });
  });
  const body = '{"quantity":2}';
  const r = await request(f, { method: 'POST', chunks: [body], headers: {
    'content-type': 'application/json', 'content-length': Buffer.byteLength(body),
    cookie: 'session=synthetic', 'x-operator-session': 'operator', 'x-actor-employee-id': 'actor',
  } });
  assert.equal(r.status, 422);
  const echoed = JSON.parse(r.body);
  assert.equal(echoed.body, body);
  assert.equal(echoed.path, '/api/echo?x=%2F&x=2');
  for (const [name, value] of Object.entries({ cookie: 'session=synthetic', 'x-operator-session': 'operator', 'x-actor-employee-id': 'actor' })) {
    assert.equal(echoed.headers[name], value);
    assert.equal(r.headers[name], undefined);
  }
  assert.deepEqual(r.headers['set-cookie'], ['one=1; HttpOnly', 'two=2; SameSite=Lax']);
  assert.equal(f.requests.length, 1);
});

test('streams chunked binary request before its final chunk without closing subsequent browser reads', async t => {
  let sawFirst;
  const first = new Promise(resolve => { sawFirst = resolve; });
  const f = await fixture(t, (req, res) => {
    req.once('data', sawFirst);
    req.pipe(res);
  });
  let uploadEnded = false;
  const pending = request(f, { method: 'POST', chunks: [Buffer.from([0, 128]), Buffer.from([255, 1])], gap: 50, onEnd: () => { uploadEnded = true; } });
  await first;
  assert.equal(uploadEnded, false, 'upstream must receive bytes before the upload ends');
  const r = await pending;
  assert.deepEqual(r.body, Buffer.from([0, 128, 255, 1]));
  assert.equal((await request(f)).reused, true);
});

test('idle timeout does not interrupt a long request reusing a socket', async t => {
  const f = await fixture(t, (req, res) => {
    const send = () => res.end(String(req.socket.remotePort));
    if (req.url.includes('slow')) setTimeout(send, 150); else send();
  }, { idleTimeoutMs: 40 });
  const first = await request(f);
  const slow = await request(f, { path: '/api/slow' });
  assert.deepEqual(first.body, slow.body);
});

test('streams SSE after idle expiry and cancels upstream when browser disconnects', async t => {
  let closed;
  const upstreamClosed = new Promise(resolve => { closed = resolve; });
  const f = await fixture(t, (incoming, res) => {
    if (incoming.url === '/api/warm') { res.end('ok'); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: first\n\n');
    const timer = setTimeout(() => res.write('data: second\n\n'), 120);
    res.on('close', () => { clearTimeout(timer); closed(); });
  }, { idleTimeoutMs: 40 });
  await request(f, { path: '/api/warm' });
  await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: f.port, path: '/api/events', agent: f.agent }, res => {
      let text = '';
      res.on('data', c => {
        text += c;
        if (text.includes('second')) { req.destroy(); resolve(); }
      });
      res.on('error', () => {});
    });
    req.on('error', reject);
  });
  await Promise.race([upstreamClosed, delay(1000).then(() => assert.fail('upstream SSE leaked'))]);
});

test('does not retry a failed POST and logs no private request values', async t => {
  const f = await fixture(t, (req) => { req.resume(); req.on('end', () => req.socket.destroy()); });
  const result = await request(f, { method: 'POST', chunks: ['private-body'], headers: { cookie: 'private-cookie' } });
  assert.equal(result.status, 500);
  assert.equal(f.requests.length, 1);
  assert.equal(f.errors.length, 1);
  assert.doesNotMatch(JSON.stringify(f.errors), /private-cookie|private-body|127\.0\.0\.1/);
});

test('does not resend an interrupted POST across a backend restart and recovers for later reads', async t => {
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const f = await fixture(t, (req, res) => {
    if (req.method === 'POST') req.once('data', began);
    else res.end('restarted');
  });
  const upstreamPort = f.upstream.address().port;
  const writing = request(f, { method: 'POST', chunks: ['one-write'] });
  await started;
  f.upstream.closeAllConnections();
  await new Promise(resolve => f.upstream.close(resolve));
  assert.equal((await writing).status, 500);
  f.upstream.listen(upstreamPort, '127.0.0.1');
  await once(f.upstream, 'listening');
  assert.equal((await request(f)).body.toString(), 'restarted');
  assert.equal(f.requests.filter(req => req.method === 'POST').length, 1);
});

test('honors client Connection close independently of upstream reuse', async t => {
  const f = await fixture(t, (_req, res) => res.end('ok'));
  assert.equal((await request(f, { headers: { connection: 'close' } })).headers.connection, 'close');
});

test('enforces upstream inactivity timeout without retrying', async t => {
  const f = await fixture(t, req => req.resume(), { proxyTimeoutMs: 40 });
  assert.equal((await request(f)).status, 500);
  assert.equal(f.requests.length, 1);
});

test('a truncated upstream response fails instead of reporting a complete body', async t => {
  const f = await fixture(t, (req, res) => {
    res.writeHead(200, { 'content-length': 100 }); res.write('partial');
    setTimeout(() => req.socket.destroy(), 30);
  });
  await assert.rejects(request(f));
  assert.equal(f.requests.length, 1);
});

test('preserves HEAD and 204 bodyless response semantics', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.method === 'HEAD') { res.writeHead(200, { 'content-length': 100 }); res.end(); }
    else { res.writeHead(204); res.end(); }
  });
  const head = await request(f, { method: 'HEAD' });
  assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], '100');
  const empty = await request(f);
  assert.equal(empty.status, 204); assert.equal(empty.body.length, 0);
});

test('forwards WebSocket upgrade through a dedicated unpooled connection', async t => {
  const f = await fixture(t, (_req, res) => res.end('ok'));
  let upstreamSocket;
  f.upstream.on('upgrade', (_req, socket) => {
    upstreamSocket = socket;
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nhello');
  });
  t.after(() => upstreamSocket?.destroy());
  const socket = net.connect(f.port, '127.0.0.1');
  t.after(() => socket.destroy());
  socket.write('GET /api/socket HTTP/1.1\r\nHost: qa.synthetic\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  const [data] = await once(socket, 'data');
  assert.match(data.toString(), /101 Switching Protocols/);
  assert.match(data.toString(), /hello/);
});
