import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(frontend);

test("isolated API workers never inherit or reuse idle sockets and never retry failed requests", async () => {
  const requests = [];
  const sockets = new WeakMap();
  let serial = 0;
  const server = createServer((request, response) => {
    if (!sockets.has(request.socket)) sockets.set(request.socket, ++serial);
    const entry = {
      path: request.url, method: request.method, socket: sockets.get(request.socket),
      connection: request.headers.connection, worker: request.headers["x-test-worker"],
      inheritedHeader: request.headers["x-transport-test"],
    };
    requests.push(entry);
    request.resume();
    request.on("end", () => {
      // Deliberate failure only checks propagation and request count, not the root cause.
      if (request.url === "/abort") { response.destroy(); return; }
      response.statusCode = request.url === "/error" ? 500 : 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ...entry, warmup: requests.find(row => row.path === "/warmup") }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  const runtime = path.join(root, "_attic/runtime");
  await mkdir(runtime, { recursive: true });
  const directory = await mkdtemp(path.join(runtime, "api-connection-test-"));
  const playwright = JSON.stringify(require.resolve("@playwright/test"));
  const fixture = JSON.stringify(path.join(frontend, "tests/e2e/_isolated-api-expectations.ts"));
  const config = path.join(directory, "playwright.config.cjs");
  await writeFile(config, `const { defineConfig } = require(${playwright});
module.exports = defineConfig({ testDir: __dirname, outputDir: ${JSON.stringify(path.join(directory, "artifacts"))}, testMatch: '*.spec.ts', workers: 1, retries: 0, timeout: 15000,
  use: { baseURL: ${JSON.stringify(url)}, extraHTTPHeaders: { 'X-Transport-Test': 'preserved' } }, reporter: 'json' });`, "utf8");
  await writeFile(path.join(directory, "00-warmup.spec.ts"), `import { test, expect } from ${playwright};
test('ordinary fixture leaves its own keep-alive connection', async ({ request }) => {
  const response = await request.get('/warmup', { headers: { 'X-Test-Worker': String(process.pid) }, maxRetries: 0 });
  expect(response.status()).toBe(200);
  expect((await response.json()).connection).toBe('keep-alive');
});`, "utf8");
  await writeFile(path.join(directory, "01-isolated.spec.ts"), `import { expect } from ${playwright};
import { test, fetchWithoutIdleReuse } from ${fixture};
test('API and held route responses use closed, independent connections', async ({ request, page }) => {
  const options = { headers: { 'X-Test-Worker': String(process.pid) }, maxRetries: 0 };
  const first = await (await request.get('/first', options)).json();
  expect(first.warmup.worker).not.toBe(String(process.pid));
  expect(first.connection).toBe('close');
  expect(first.inheritedHeader).toBe('preserved');
  const second = await (await request.put('/second', { ...options, data: { unchanged: true } })).json();
  expect(second.connection).toBe('close');
  expect(second.socket).not.toBe(first.socket);
  const parallel = await Promise.all(['/parallel-a', '/parallel-b'].map(async url => (await request.get(url, options)).json()));
  expect(parallel.every(row => row.connection === 'close')).toBe(true);
  expect(new Set([first.socket, second.socket, ...parallel.map(row => row.socket)]).size).toBe(4);
  let release, arrived;
  const held = new Promise<void>(resolve => { release = resolve; });
  const fetched = new Promise<any>(resolve => { arrived = resolve; });
  await page.route('**/held', async route => {
    const response = await fetchWithoutIdleReuse(route);
    arrived(await response.json()); await held; await route.fulfill({ response });
  });
  const navigation = page.goto('/held');
  try {
    const received = await fetched;
    expect(received.connection).toBe('close');
    const during = await (await request.get('/during-held', options)).json();
    expect(during.socket).not.toBe(received.socket);
  } finally { release(); await navigation; }
  await page.goto('/browser');
  // Browser traffic retains its normal keep-alive header.
  await expect(page.locator('body')).toContainText('"connection":"keep-alive"');
  await expect(request.put('/abort', { ...options, data: {} })).rejects.toThrow(/ECONNRESET|socket hang up/);
  expect((await request.get('/error', options)).status()).toBe(500);
});`, "utf8");
  let output = "";
  let errors = "";
  try {
    const child = spawn(process.execPath, [path.join(frontend, "node_modules/@playwright/test/cli.js"), "test", "-c", config, "--workers=1", "--retries=0", "--max-failures=1"], {
      cwd: frontend, windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: "", PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(directory, "report.json") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    const [code] = await once(child, "close");
    await writeFile(path.join(directory, "stdout.log"), output, "utf8");
    await writeFile(path.join(directory, "stderr.log"), errors, "utf8");
    await writeFile(path.join(directory, "requests.json"), JSON.stringify(requests, null, 2), "utf8");
    assert.equal(code, 0, `Playwright failed; evidence: ${directory}\n${output}\n${errors}`);
    for (const expected of ["/warmup", "/first", "/second", "/parallel-a", "/parallel-b", "/held", "/during-held", "/browser", "/abort", "/error"]) {
      assert.equal(requests.filter(row => row.path === expected).length, 1, `${expected} must be sent once`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
