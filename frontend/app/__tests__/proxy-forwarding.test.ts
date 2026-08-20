import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "../../middleware";

const require = createRequire(import.meta.url);

type RawProxyRequest = {
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
};

type ProxyBoundary = {
  applyTrustedClientIpAssertion: (
    request: RawProxyRequest,
    options: { sharedSecret?: string; nowSeconds: number },
  ) => void;
};

const UNTRUSTED_CLIENT_IP_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-real-ip",
] as const;

describe("Next /api proxy forwarding boundary", () => {
  it("overwrites every inbound IP assertion with socket.remoteAddress", () => {
    const boundary = require("../../scripts/next-server.js") as ProxyBoundary;
    const sharedSecret = "s".repeat(32);
    const nowSeconds = 1_787_097_600;
    const request: RawProxyRequest = {
      headers: {
        forwarded: "for=192.0.2.25",
        "x-forwarded-for": "203.0.113.77",
        "x-real-ip": "198.51.100.44",
        "x-mes-proxy-client-ip": "203.0.113.200",
        "x-mes-proxy-client-ip-timestamp": "1",
        "x-mes-proxy-client-ip-signature": "attacker-signature",
      },
      socket: { remoteAddress: "::ffff:192.0.2.44" },
    };

    boundary.applyTrustedClientIpAssertion(request, { sharedSecret, nowSeconds });

    expect(request.headers.forwarded).toBeUndefined();
    expect(request.headers["x-forwarded-for"]).toBeUndefined();
    expect(request.headers["x-real-ip"]).toBeUndefined();
    expect(request.headers["x-mes-proxy-client-ip"]).toBe("192.0.2.44");
    expect(request.headers["x-mes-proxy-client-ip-timestamp"]).toBe(String(nowSeconds));
    expect(request.headers["x-mes-proxy-client-ip-signature"]).toBe(
      createHmac("sha256", sharedSecret)
        .update(`v1\n${nowSeconds}\n192.0.2.44`)
        .digest("hex"),
    );
  });

  it("fails closed without a valid socket address", () => {
    const boundary = require("../../scripts/next-server.js") as ProxyBoundary;
    const request: RawProxyRequest = {
      headers: {
        "x-mes-proxy-client-ip": "203.0.113.200",
        "x-mes-proxy-client-ip-timestamp": "1",
        "x-mes-proxy-client-ip-signature": "attacker-signature",
      },
      socket: { remoteAddress: "not-an-ip" },
    };

    boundary.applyTrustedClientIpAssertion(request, {
      sharedSecret: "s".repeat(32),
      nowSeconds: 1_787_097_600,
    });

    expect(request.headers["x-mes-proxy-client-ip"]).toBeUndefined();
    expect(request.headers["x-mes-proxy-client-ip-timestamp"]).toBeUndefined();
    expect(request.headers["x-mes-proxy-client-ip-signature"]).toBeUndefined();
  });

  it("removes inbound client IP claims before the backend rewrite", () => {
    const request = new NextRequest("http://localhost/api/operator-session", {
      headers: {
        forwarded: "for=192.0.2.25",
        "x-forwarded-for": "203.0.113.77",
        "x-real-ip": "198.51.100.44",
        "x-mes-employee-code": "E1",
      },
    });

    const response = middleware(request);
    const overriddenHeaders = new Set(
      response.headers.get("x-middleware-override-headers")?.split(",") ?? [],
    );

    for (const header of UNTRUSTED_CLIENT_IP_HEADERS) {
      expect(overriddenHeaders).not.toContain(header);
      expect(response.headers.get(`x-middleware-request-${header}`)).toBeNull();
    }
    expect(response.headers.get("x-middleware-request-x-mes-employee-code")).toBe("E1");
  });

  it("applies the sanitizing middleware only to the API proxy surface", () => {
    expect(config.matcher).toBe("/api/:path*");
  });
});
