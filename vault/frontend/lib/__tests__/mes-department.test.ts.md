---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/mes-department.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-department.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/mes-department.test.ts]]

## 원본 첫 줄

```
import { describe, it, expect } from "vitest";
import {
  MES_DEPARTMENT_COLORS,
  getDepartmentFallbackColor,
  getDepartmentInitial,
  normalizeDepartmentName,
  DEPARTMENT_LABELS,
  DEPARTMENT_ICONS,
  normalizeDepartment,
} from "../mes-department";

describe("normalizeDepartmentName", () => {
  it("null/undefined/공백은 '기타'", () => {
    expect(normalizeDepartmentName(null)).toBe("기타");
    expect(normalizeDepartmentName(undefined)).toBe("기타");
    expect(normalizeDepartmentName("")).toBe("기타");
    expect(normalizeDepartmentName("   ")).toBe("기타");
  });

  it("별칭 흡수: 연구소 → 연구", () => {
    expect(normalizeDepartmentName("연구소")).toBe("연구");
    expect(normalizeDepartmentName("AS팀")).toBe("AS");
    expect(normalizeDepartmentName("출하팀")).toBe("출하");
  });

  it("표준 키는 그대로", () => {
    expect(normalizeDepartmentName("조립")).toBe("조립");
    expect(normalizeDepartmentName("고압")).toBe("고압");
  });
});
```
