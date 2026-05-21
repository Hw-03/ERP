---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/mes-format.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-format.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/mes-format.test.ts]]

## 원본 첫 줄

```
import { describe, it, expect } from "vitest";
import {
  formatQty,
  formatDate,
  formatDateTime,
  formatPercent,
} from "../mes-format";

describe("formatQty", () => {
  it("천단위 콤마", () => {
    expect(formatQty(1234)).toBe("1,234");
    expect(formatQty(1000000)).toBe("1,000,000");
  });

  it("문자열 입력도 처리", () => {
    expect(formatQty("1234")).toBe("1,234");
  });

  it("null/undefined/NaN/공백은 - 반환", () => {
    expect(formatQty(null)).toBe("-");
    expect(formatQty(undefined)).toBe("-");
    expect(formatQty("")).toBe("-");
    expect(formatQty("abc")).toBe("-");
    expect(formatQty(NaN)).toBe("-");
  });

  it("음수도 처리", () => {
    expect(formatQty(-500)).toBe("-500");
  });
});
```
