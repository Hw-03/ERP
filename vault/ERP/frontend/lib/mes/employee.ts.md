---
type: file-explanation
source_path: "frontend/lib/mes/employee.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# employee.ts — employee.ts 설명

## 이 파일은 무엇을 책임지나

`employee.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `firstEmployeeLetter`

## 연결되는 파일

- [[ERP/frontend/lib/mes/📁_mes]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * MES 직원 (Employee) 유틸 — `@/lib/mes/employee`.
 *
 * Round-10D (#1) 신설. legacyUi.ts 의 직원 관련 순수 함수 정본 위치.
 */

/**
 * 직원 이름의 첫 글자 추출 (avatar 표기용).
 * 빈 문자열 / null / undefined 입력 시 "?" 반환.
 */
export function firstEmployeeLetter(name?: string | null): string {
  if (!name) return "?";
  return name.trim().slice(0, 1);
}
```
