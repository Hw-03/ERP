---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/mes-color.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-color.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/mes-color.test.ts]]

## 원본 첫 줄

```
import { describe, it, expect } from "vitest";
import {
  MES_DEPARTMENT_COLORS,
  getDepartmentFallbackColor,
  getDepartmentInitial,
  normalizeDepartmentName,
  LEGACY_COLORS,
  OPTION_COLOR,
  optionColor,
  employeeColor,
} from "../mes/color";

describe("mes/color barrel — department exports", () => {
  it("re-exports MES_DEPARTMENT_COLORS with all 11 keys (10 부서 + 기타)", () => {
    const expected = [
      "조립", "고압", "진공", "튜닝", "튜브",
      "서비스", "AS", "연구", "영업", "출하", "기타",
    ];
    for (const key of expected) {
      expect(MES_DEPARTMENT_COLORS[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("re-exports getDepartmentFallbackColor with alias absorption", () => {
    expect(getDepartmentFallbackColor("연구소")).toBe("#b45309");
    expect(getDepartmentFallbackColor("AS팀")).toBe("#be185d");
    expect(getDepartmentFallbackColor("미지부서")).toBe("#475569");
  });

  it("re-exports getDepartmentInitial", () => {
```
