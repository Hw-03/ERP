---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/api-core.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# api-core.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/api-core.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toApiUrl,
  extractErrorMessage,
  parseError,
  fetcher,
  postJson,
  putJson,
  patchJson,
  deleteJson,
  FALLBACK_SERVER_API_BASE,
} from "../api-core";

// Helpers --------------------------------------------------------

function makeResponse(opts: {
  ok: boolean;
  status?: number;
  statusText?: string;
  body: string | object;
}): Response {
  const { ok, status = ok ? 200 : 500, statusText = ok ? "OK" : "Error", body } = opts;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    statusText,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === "string" ? JSON.parse(body) : body),
  } as unknown as Response;
```
