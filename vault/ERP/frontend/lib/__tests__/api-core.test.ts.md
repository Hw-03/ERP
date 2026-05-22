---
type: file-explanation
source_path: "frontend/lib/__tests__/api-core.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# api-core.test.ts — api-core.test.ts 설명

## 이 파일은 무엇을 책임지나

`api-core.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/api-core.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
}

// toApiUrl -------------------------------------------------------

describe("toApiUrl", () => {
  it("returns the path as-is when no SERVER_API_BASE configured", () => {
    // 본 테스트 환경엔 NEXT_PUBLIC_API_URL 가 설정돼 있지 않으므로 상대경로 그대로.
    expect(toApiUrl("/api/items")).toBe("/api/items");
  });

  it("preserves query strings", () => {
    expect(toApiUrl("/api/items?foo=1&bar=baz")).toBe("/api/items?foo=1&bar=baz");
  });
});

// FALLBACK_SERVER_API_BASE ---------------------------------------

describe("FALLBACK_SERVER_API_BASE", () => {
  it("exports the documented default", () => {
    expect(FALLBACK_SERVER_API_BASE).toBe("http://127.0.0.1:8000");
  });
});

// extractErrorMessage --------------------------------------------
```
