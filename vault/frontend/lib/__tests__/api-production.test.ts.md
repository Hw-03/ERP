---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/api-production.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# api-production.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/api-production.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect, vi, afterEach } from "vitest";
import { productionApi } from "../api/production";

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

describe("productionApi", () => {
  it("productionReceipt POST /api/production/receipt", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.productionReceipt({ item_id: "i1", quantity: 5 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/production/receipt");
  });

  it("checkProduction GET /api/production/bom-check/{id}?quantity=N", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.checkProduction("item-1", 10);
```
