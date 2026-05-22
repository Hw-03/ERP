---
type: file-explanation
source_path: "frontend/lib/__tests__/api-io.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# api-io.test.ts — api-io.test.ts 설명

## 이 파일은 무엇을 책임지나

`api-io.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/api-io.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `when`

## 연결되는 파일

- [[ERP/frontend/lib/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```ts
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
      sub_type: "receive_supplier",
      targets: [{ source_kind: "direct_item", item_id: "i-1", quantity: 3 }],
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/io/preview");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.work_type).toBe("receive");
    expect(body.sub_type).toBe("receive_supplier");
    expect(body.targets).toHaveLength(1);
  });

  it("throws on non-2xx (409 conflict)", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        makeResponse({ detail: { message: "충돌 발생" } }, false, 409),
      ),
    ) as unknown as typeof fetch;

    await expect(
      ioApi.preview({
        work_type: "warehouse_io",
        sub_type: "warehouse_to_dept",
        targets: [],
```
