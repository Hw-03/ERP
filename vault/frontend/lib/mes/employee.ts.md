---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/employee.ts
tags: [vault, code-note, auto-generated, stub]
---

# employee.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes/employee.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
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
