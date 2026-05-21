---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/mes-inventory.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-inventory.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/mes-inventory.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect } from "vitest";
import {
  getStockState,
  LEGACY_FILE_TYPES,
  LEGACY_PARTS,
} from "../mes/inventory";
import { LEGACY_COLORS } from "../mes/color";

describe("getStockState", () => {
  it("returns 품절 (red) when quantity <= 0", () => {
    expect(getStockState(0)).toEqual({ label: "품절", color: LEGACY_COLORS.red });
    expect(getStockState(-3)).toEqual({ label: "품절", color: LEGACY_COLORS.red });
  });

  it("returns 부족 (yellow) when 0 < quantity < minStock", () => {
    expect(getStockState(5, 10)).toEqual({ label: "부족", color: LEGACY_COLORS.yellow });
  });

  it("returns 정상 (green) when quantity >= minStock", () => {
    expect(getStockState(10, 10)).toEqual({ label: "정상", color: LEGACY_COLORS.green });
    expect(getStockState(20, 10)).toEqual({ label: "정상", color: LEGACY_COLORS.green });
  });

  it("returns 정상 when minStock is null / undefined and quantity > 0", () => {
    expect(getStockState(5)).toEqual({ label: "정상", color: LEGACY_COLORS.green });
    expect(getStockState(5, null)).toEqual({ label: "정상", color: LEGACY_COLORS.green });
  });
});

describe("legacy filter constants", () => {
```
