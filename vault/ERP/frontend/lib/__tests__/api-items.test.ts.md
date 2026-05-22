---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/api-items.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# api-items.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/api-items.test.ts]]

## 원본 첫 줄

```
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { itemsApi } from "../api/items";

// Helpers --------------------------------------------------------

function makeResponse(opts: {
  ok?: boolean;
  status?: number;
  body: unknown;
}): Response {
  const ok = opts.ok ?? true;
  const text = JSON.stringify(opts.body);
  return {
    ok,
    status: opts.status ?? (ok ? 200 : 500),
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(opts.body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
```
