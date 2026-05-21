---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/bomDept.ts
tags: [vault, code-note, auto-generated, stub]
---

# bomDept.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/bomDept.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * BOM Workbench 부서/단계 유틸 — process_type_code 기반.
 *
 * process_type_code 형식: 두 글자 (예: "TR", "HA", "AF").
 *   - 첫 글자  = 부서 (T/H/V/N/A/P)
 *   - 두 번째 = 단계 (R=원자재, A=중간공정, F=공정완료)
 *
 * 색상은 `@/lib/mes-department` 의 fallback 시스템을 사용 — DB color_hex 가
 * 우선이지만 본 도구는 정적 매핑(부서명 → fallback)만으로 충분.
 */
import { getDepartmentFallbackColor } from "@/lib/mes-department";
import { LEGACY_COLORS } from "@/lib/mes/color";

export const DEPT_LETTERS = ["T", "H", "V", "N", "A", "P"] as const;
export type DeptLetter = (typeof DEPT_LETTERS)[number];

export const DEPT_LETTER_TO_NAME: Record<DeptLetter, string> = {
  T: "튜브",
  H: "고압",
  V: "진공",
  N: "튜닝",
  A: "조립",
  P: "출하",
};

export type StageLetter = "R" | "A" | "F";

export const STAGE_LABEL: Record<StageLetter, string> = {
  R: "원자재",
  A: "중간공정",
```
