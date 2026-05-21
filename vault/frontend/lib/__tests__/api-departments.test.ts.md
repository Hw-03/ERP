---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/api-departments.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# api-departments.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/api-departments.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect, vi, afterEach } from "vitest";
import { departmentsApi } from "../api/departments";

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

describe("departmentsApi", () => {
  it("getAppSession GET /api/app-session", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ boot_id: "b", started_at: "" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await departmentsApi.getAppSession();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/app-session");
  });

  it("getDepartments without params", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
```
