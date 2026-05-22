---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/api-inventory.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# api-inventory.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/api-inventory.test.ts]]

## 원본 첫 줄

```
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { inventoryApi } from "../api/inventory";

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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("inventoryApi.getInventorySummary", () => {
  it("GET /api/inventory/summary", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ total_items: 0 })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
```
