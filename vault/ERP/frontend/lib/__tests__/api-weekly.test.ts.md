---
type: file-explanation
source_path: "frontend/lib/__tests__/api-weekly.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# api-weekly.test.ts — api-weekly.test.ts 설명

## 이 파일은 무엇을 책임지나

`api-weekly.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/api-weekly.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
          model_label: "A",
          tf_qty: "2.0000",
          hf_qty: "8.0000",
          vf_qty: "1.0000",
          nf_qty: "9.0000",
          af_qty: "39.0000",
          pf_qty: "33.0000",
          total_qty: "92.0000",
        },
        {
          model_key: "m2",
          model_label: "B",
          tf_qty: "0",
          hf_qty: "0",
          vf_qty: "0",
          nf_qty: "0",
          af_qty: "0",
          pf_qty: "0",
          total_qty: "8.0000",
        },
      ],
    };
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(makeResponse(body)),
    ) as unknown as typeof fetch;
```
