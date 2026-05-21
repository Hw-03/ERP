---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/api-admin.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# api-admin.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/api-admin.test.ts]]

## 원본 첫 줄

```
import { describe, it, expect, vi, afterEach } from "vitest";
import { adminApi } from "../api/admin";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("adminApi", () => {
  it("verifyAdminPin POSTs /api/settings/verify-pin", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ message: "ok" })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await adminApi.verifyAdminPin("0000");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/settings/verify-pin");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ pin: "0000" });
  });

  it("updateAdminPin PUT /api/settings/admin-pin", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ message: "ok" })));
```
