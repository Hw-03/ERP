import "next/dist/server/node-environment-baseline";
import { fork, type ForkOptions } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { parse } from "node:url";
import { NextRequest, NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { proxyRequest } from "next/dist/server/lib/router-utils/proxy-request";
import { describe, expect, it, vi } from "vitest";
import { server } from "./msw/server";

interface ProxyModule {
  proxy: (request: NextRequest) => NextResponse;
  config: { matcher?: string };
}

const proxyPath = path.resolve("proxy.ts");
// Without a Proxy file, Next leaves incoming headers unchanged. This also lets
// the RED test demonstrate the actual reset rather than an import failure.
const boundary: ProxyModule = existsSync(proxyPath)
  ? await import(/* @vite-ignore */ proxyPath)
  : { proxy: () => NextResponse.next(), config: {} };

function upstreamHeaders(request: NextRequest): Headers {
  const response = boundary.proxy(request);
  const names = response.headers.get("x-middleware-override-headers");
  if (!names) return new Headers(request.headers);
  const headers = new Headers();
  for (const name of names.split(",")) {
    const value = response.headers.get(`x-middleware-request-${name.trim()}`);
    if (value !== null) headers.set(name.trim(), value);
  }
  return headers;
}

class ResponseSink extends Writable {
  statusCode = 200;
  body = "";
  headersSent = false;
  private headers = new Map<string, string>();

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void): void {
    this.body += chunk.toString();
    callback();
  }

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  get finished(): boolean { return this.writableFinished; }
}

async function forward(port: number, pathname: string, body?: string, extraHeaders: Record<string, string> = {}): Promise<ResponseSink> {
  const headers = upstreamHeaders(new NextRequest(`http://qa.synthetic${pathname}`, {
    headers: {
      connection: "keep-alive",
      cookie: "qa_session=synthetic",
      "x-operator-session": "operator-token",
      "x-actor-employee-id": "qa-actor",
      ...(body ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) } : {}),
      ...extraHeaders,
    },
  }));
  let scheduled = false;
  const incoming = body ? new Readable({
    read() {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => { this.push(body); this.push(null); }, 20);
    },
  }) : Readable.from([]);
  Object.assign(incoming, {
    method: body ? "POST" : "GET", url: pathname, httpVersion: "1.1", httpVersionMajor: 1,
    headers: { ...Object.fromEntries(headers), host: "qa.synthetic" }, socket: { writable: true },
  });
  const response = new ResponseSink();
  const completed = once(response, "finish");
  // The real Next function turns transport errors into the same HTTP 500 seen
  // by callers. Its rejected promise is expected in the missing-fix baseline.
  await proxyRequest(incoming as IncomingMessage, response as unknown as ServerResponse,
    parse(`http://127.0.0.1:${port}${pathname}`, true),
  ).catch(() => undefined);
  await completed;
  return response;
}

describe("API proxy transport", () => {
  it("matches only API paths using the installed Next matcher", () => {
    for (const url of ["/api", "/api/io/preview", "/api/realtime/stream?cursor=1"]) {
      expect(unstable_doesMiddlewareMatch({ config: boundary.config, url })).toBe(true);
    }
    for (const url of ["/mes", "/images/item.jpg", "/_next/static/chunk.js", "/api-other"]) {
      expect(unstable_doesMiddlewareMatch({ config: boundary.config, url })).toBe(false);
    }
  });

  it("sets request connection close without copying authentication to Proxy response headers", () => {
    const request = new NextRequest("http://qa.synthetic/api/io/preview", {
      headers: { connection: "keep-alive", cookie: "qa_session=synthetic", "x-operator-session": "operator-token", "x-actor-employee-id": "qa-actor" },
    });
    const forwarded = upstreamHeaders(request);
    expect(forwarded.get("connection")).toBe("close");
    for (const name of ["cookie", "x-operator-session", "x-actor-employee-id"]) {
      expect(forwarded.get(name)).toBe(request.headers.get(name));
    }
    expect(request.headers.get("connection")).toBe("keep-alive");
    const response = boundary.proxy(request);
    expect(response.headers.has("connection")).toBe(false);
    expect(response.headers.has("cookie")).toBe(false);
    expect(response.headers.has("x-operator-session")).toBe(false);
  });

  it("leaves WebSocket upgrade headers unchanged", () => {
    const request = new NextRequest("http://qa.synthetic/api/socket", {
      headers: { connection: "keep-alive, UpGrAdE", upgrade: "websocket", "sec-websocket-key": "synthetic" },
    });
    expect(Object.fromEntries(upstreamHeaders(request))).toEqual(Object.fromEntries(request.headers));
    expect(boundary.proxy(request).headers.has("x-middleware-override-headers")).toBe(false);
  });

  it.each<[string, Record<string, string>]>([
    ["Upgrade header alone", { upgrade: "websocket" }],
    ["Connection upgrade token alone", { connection: "Upgrade" }],
    ["non-matching Connection token", { connection: "keep-alive, upgrades", upgrade: "websocket" }],
    ["empty Upgrade header", { connection: "Upgrade", upgrade: "" }],
  ])("closes ordinary HTTP requests carrying %s", (_name, headers) => {
    const request = new NextRequest("http://qa.synthetic/api/warm", { headers });
    expect(upstreamHeaders(request).get("connection")).toBe("close");
  });

  it.each<[string, Record<string, string>]>([
    ["ordinary HTTP", {}],
    ["Upgrade header without Connection upgrade token", { upgrade: "websocket" }],
  ])("forwards one authenticated JSON POST after %s warmup and idle FIN without resetting or retrying", async (_name, warmHeaders) => {
    // This regression needs real TCP socket events, which MSW intercepts.
    server.close();
    const childOptions: ForkOptions & { windowsHide: boolean } = {
      execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"], windowsHide: true,
    };
    const child = fork(path.resolve("tests/fixtures/api-proxy-upstream.cjs"), [], childOptions);
    const requests: Array<{ type: string; path: string; headers: Record<string, string>; body: string }> = [];
    child.on("message", (message) => {
      const record = message as (typeof requests)[number];
      if (record.type === "request") requests.push(record);
    });
    const requestSpy = vi.spyOn(http, "request");
    try {
      const [ready] = await once(child, "message", { signal: AbortSignal.timeout(3000) });
      const port = (ready as { port: number }).port;
      expect((await forward(port, "/api/warm", undefined, warmHeaders)).statusCode).toBe(200);
      // The independent upstream can close while Next cannot yet consume FIN.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
      const body = JSON.stringify({ synthetic: true, quantity: 2 });
      const result = await forward(port, "/api/io/preview", body);
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe("ok");
      if (requests.length < 2) await once(child, "message", { signal: AbortSignal.timeout(1000) });
      expect(requestSpy).toHaveBeenCalledTimes(2);
      expect((requestSpy.mock.results[1].value as http.ClientRequest).reusedSocket).toBe(false);
      expect(requests.filter((request) => request.path === "/api/io/preview")).toEqual([expect.objectContaining({
        body,
        headers: expect.objectContaining({ connection: "close", cookie: "qa_session=synthetic", "x-operator-session": "operator-token", "x-actor-employee-id": "qa-actor", "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }),
      })]);
    } finally {
      for (const [options] of requestSpy.mock.calls) {
        const { agent } = options as http.RequestOptions;
        if (agent instanceof http.Agent) agent.destroy();
      }
      requestSpy.mockRestore();
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
      server.listen({ onUnhandledRequest: "bypass" });
    }
  }, 10000);
});
