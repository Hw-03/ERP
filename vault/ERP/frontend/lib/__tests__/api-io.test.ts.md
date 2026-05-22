---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/api-io.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# api-io.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/api-io.test.ts]]

## 원본 첫 줄

```
import { describe, it, expect, vi, afterEach } from "vitest";
import { ioApi } from "../api/io";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeResponse(body: unknown, ok = true, status?: number): Response {
  const st = status ?? (ok ? 200 : 500);
  return {
    ok,
    status: st,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── preview ──────────────────────────────────────────────────────────────────

describe("ioApi.preview", () => {
  it("POST /api/io/preview with correct body shape", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ bundles: [] })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.preview({
      work_type: "receive",
```
