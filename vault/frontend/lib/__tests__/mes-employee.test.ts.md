---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/mes-employee.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-employee.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/mes-employee.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect } from "vitest";
import { firstEmployeeLetter } from "../mes/employee";

describe("firstEmployeeLetter", () => {
  it("returns the first character of trimmed input", () => {
    expect(firstEmployeeLetter("김현우")).toBe("김");
    expect(firstEmployeeLetter("  Park")).toBe("P");
  });

  it("returns '?' for empty / null / undefined", () => {
    expect(firstEmployeeLetter(undefined)).toBe("?");
    expect(firstEmployeeLetter(null)).toBe("?");
    expect(firstEmployeeLetter("")).toBe("?");
  });
});
```
