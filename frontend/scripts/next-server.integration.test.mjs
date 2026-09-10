import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function closeServer(server) {
  if (!server.listening) return;
  server.close();
  await once(server, "close");
}

async function runIntegration() {
  const sharedSecret = "integration-proxy-secret-value-32";
  const boundary = require("./next-server.js");
  let resolveCaptured;
  const capturedRequest = new Promise((resolve) => {
    resolveCaptured = resolve;
  });
  const sink = createServer((request, response) => {
    resolveCaptured({ headers: request.headers, url: request.url });
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ok":true}');
  });
  const sinkPort = await listen(sink);
  const previousBackend = process.env.BACKEND_INTERNAL_URL;
  process.env.BACKEND_INTERNAL_URL = `http://127.0.0.1:${sinkPort}`;

  const { server } = await boundary.createMesNextServer({
    mode: "dev",
    hostname: "127.0.0.1",
    port: 0,
    dir: FRONTEND_ROOT,
    sharedSecret,
  });
  const frontendPort = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${frontendPort}/api/proxy-client-ip-test`, {
      headers: {
        forwarded: "for=192.0.2.25",
        "x-forwarded-for": "203.0.113.77",
        "x-real-ip": "198.51.100.44",
        "x-mes-proxy-client-ip": "203.0.113.200",
        "x-mes-proxy-client-ip-timestamp": "1",
        "x-mes-proxy-client-ip-signature": "attacker-signature",
      },
    });
    assert.equal(response.status, 200);
    const captured = await capturedRequest;
    const clientIp = captured.headers["x-mes-proxy-client-ip"];
    const timestamp = captured.headers["x-mes-proxy-client-ip-timestamp"];
    const signature = captured.headers["x-mes-proxy-client-ip-signature"];

    assert.equal(captured.url, "/api/proxy-client-ip-test");
    assert.equal(clientIp, "127.0.0.1");
    assert.match(timestamp, /^\d+$/);
    assert.equal(
      signature,
      createHmac("sha256", sharedSecret)
        .update(`v1\n${timestamp}\n${clientIp}`)
        .digest("hex"),
    );
    assert.equal(captured.headers.forwarded, undefined);
    assert.equal(captured.headers["x-forwarded-for"], undefined);
    assert.equal(captured.headers["x-real-ip"], undefined);
  } finally {
    await closeServer(server);
    await closeServer(sink);
    if (previousBackend === undefined) delete process.env.BACKEND_INTERNAL_URL;
    else process.env.BACKEND_INTERNAL_URL = previousBackend;
  }
}

if (process.env.MES_NEXT_PROXY_INTEGRATION_CHILD === "1") {
  try {
    await runIntegration();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  }
} else {
  test("actual Next rewrite preserves only the socket-derived signed client IP", { timeout: 120_000 }, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: FRONTEND_ROOT,
      encoding: "utf8",
      env: { ...process.env, MES_NEXT_PROXY_INTEGRATION_CHILD: "1" },
      timeout: 110_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
