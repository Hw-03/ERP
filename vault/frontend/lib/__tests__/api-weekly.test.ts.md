---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/api-weekly.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# api-weekly.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/api-weekly.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect, afterEach, vi } from "vitest";
import { weeklyApi } from "../api/weekly";

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

describe("weeklyApi.getWeeklyReport — production_matrix 정규화", () => {
  it("Decimal 문자열 qty 를 number 로 정규화해 reduce 합산이 문자열 연결로 깨지지 않는다", async () => {
    // 백엔드 Pydantic Decimal 직렬화 재현: 숫자 필드가 문자열로 내려옴
    const body = {
      week_start: "2026-05-01",
      week_end: "2026-05-07",
      groups: [],
      summary: {},
      warnings: [],
      production_matrix: [
        {
          model_key: "m1",
```
