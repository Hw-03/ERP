---
type: file-explanation
source_path: "frontend/lib/api-core.ts"
importance: critical
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# api-core.ts — 프론트 API 호출 공통 엔진

## 이 파일은 무엇을 책임지나

프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.

## 업무 흐름에서의 의미

API 오류 메시지, JSON 처리, 요청 방식이 여러 화면에 같은 방식으로 적용됩니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `toApiUrl`
- `extractErrorMessage`
- `FALLBACK_SERVER_API_BASE`
- `postJson`
- `putJson`
- `patchJson`
- `deleteJson`

## 연결되는 파일

- [[ERP/frontend/lib/📁_lib]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

여기 오류 처리를 바꾸면 모든 화면의 실패 메시지와 데이터 로딩 동작이 달라질 수 있습니다.

## 핵심 발췌

```ts
/**
 * DEXCOWIN MES 프론트엔드 API 코어
 *
 * 거대한 lib/api.ts 의 분할 1단계 — fetch wrapper / URL 빌더 / 에러 파서만 분리.
 * 도메인별 API (api 객체 본체) 와 타입 정의는 이번 PR 에서 이동하지 않는다.
 *
 * 호환:
 *   - lib/api.ts 가 본 모듈을 import 해서 동일한 이름으로 re-export 한다.
 *   - 외부 모듈은 종전처럼 `@/lib/api` 에서 import 해도 된다.
 *   - 새로 작성하는 코드는 `@/lib/api-core` 직접 사용을 권장.
 */

const SERVER_API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}`
  : "";

// 외부에서 명시적으로 base URL 이 필요할 때 (예: 테스트, 디버그) 사용.
export const FALLBACK_SERVER_API_BASE = "http://127.0.0.1:8000";

/**
 * 백엔드 API 절대/상대 URL 빌더.
 *   - NEXT_PUBLIC_API_URL 이 설정되어 있으면 그 값을 그대로 prefix.
 *   - 없으면 상대 경로 — Next.js rewrites 가 백엔드로 forward.
 */
export function toApiUrl(path: string): string {
  if (SERVER_API_BASE) {
    return `${SERVER_API_BASE}${path}`;
  }
  return path;
}

/** 백엔드 detail 구조에서 사용자 표시용 메시지 추출.
 *
 * 지원하는 detail 모양:
 * - 문자열: "품목을 찾을 수 없습니다."
 * - 구 dict: {message, shortages?}
 * - 신 dict (Phase 4): {code, message, extra?: {shortages?}}
 *
 * shortages 가 있으면 줄바꿈으로 추가한다.
 */
/** HTTP 에러 상태 코드를 보존하는 API 에러 클래스. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isConflict(): boolean { return this.status === 409; }
  get isUnavailable(): boolean { return this.status === 503; }
}

export function extractErrorMessage(detail: unknown, fallback = "처리 실패"): string {
  if (typeof detail === "string") return detail;
```
