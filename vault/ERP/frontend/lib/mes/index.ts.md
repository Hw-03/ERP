---
type: file-explanation
source_path: "frontend/lib/mes/index.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# index.ts — index.ts 설명

## 이 파일은 무엇을 책임지나

`index.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/lib/mes/📁_mes]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * MES 디자인 시스템 barrel — `@/lib/mes`.
 *
 * Round-3 도입. 새 코드는 본 진입점 사용 권장:
 *   import { formatQty, getDepartmentFallbackColor, MesTone } from "@/lib/mes";
 *
 * 호환:
 *   - 기존 `@/lib/mes-format`, `@/lib/mes-department`, `@/lib/mes-status` 그대로 유효
 *   - 본 barrel 은 위 3개 모듈을 동일 export 로 노출
 *
 * 향후 (Round-4+):
 *   - transaction.ts (TRANSACTION_META 기반 라벨/색 단일화)
 *   - color.ts (LEGACY_COLORS 정합화)
 *   - 본 barrel 이 mes-* 의 정본을 흡수
 */
export * from "./format";
export * from "./department";
export * from "./status";
export * from "./transaction";
export * from "./color";
export * from "./colorUtils";
```
