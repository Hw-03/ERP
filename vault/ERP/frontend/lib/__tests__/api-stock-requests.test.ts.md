---
type: file-explanation
source_path: "frontend/lib/__tests__/api-stock-requests.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# api-stock-requests.test.ts — api-stock-requests.test.ts 설명

## 이 파일은 무엇을 책임지나

`api-stock-requests.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/api-stock-requests.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
import { stockRequestsApi } from "../api/stock-requests";

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

describe("stockRequestsApi", () => {
  it("createStockRequest POST /api/stock-requests", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.createStockRequest({
      requester_employee_id: "e1",
      request_type: "raw_receive",
      reference_no: null,
      notes: null,
      lines: [],
    });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests");
  });

  it("listMyStockRequests encodes employeeId", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.listMyStockRequests("E 1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("requester_employee_id=E%201");
  });

  it("listWarehouseQueue GET /api/stock-requests/warehouse-queue", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.listWarehouseQueue();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/warehouse-queue");
  });

  it("approveStockRequest POST /{id}/approve", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.approveStockRequest("r-1", { actor_employee_id: "e1", pin: "0000" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/r-1/approve");
  });

  it("submitStockRequestDraft POST /{id}/submit", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
```
