---
type: file-explanation
source_path: "frontend/lib/api/core.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# core.ts — core.ts 설명

## 이 파일은 무엇을 책임지나

`core.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * API core — fetch wrapper / URL 빌더 / 에러 파서.
 *
 * 본 파일은 `frontend/lib/api-core.ts` 의 thin re-export.
 * 외부 호환성 유지를 위해 기존 위치 (`@/lib/api-core`) 도 그대로 사용 가능.
 * 새 코드는 `@/lib/api/core` 사용을 권장 (도메인 분리 후 일관성).
 */
export * from "../api-core";
```
