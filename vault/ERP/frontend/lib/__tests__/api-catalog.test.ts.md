---
type: file-explanation
source_path: "frontend/lib/__tests__/api-catalog.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# api-catalog.test.ts — api-catalog.test.ts 설명

## 이 파일은 무엇을 책임지나

`api-catalog.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/api-catalog.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/lib/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { catalogApi } from "../api/catalog";

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

describe("catalogApi.getModels", () => {
  it("GET /api/models", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.getModels();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/models");
  });
});

describe("catalogApi.createModel", () => {
  it("POST /api/models with body", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ slot: 1 })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.createModel({ model_name: "M1" });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ model_name: "M1" });
  });
});

describe("catalogApi.getBOM", () => {
  it("GET /api/bom/{parentId}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.getBOM("item-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/bom/item-1");
  });
});

describe("catalogApi.updateBOM", () => {
  it("PATCH /api/bom/{bomId}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.updateBOM("bom-1", { quantity: 5 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/bom/bom-1");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
```
