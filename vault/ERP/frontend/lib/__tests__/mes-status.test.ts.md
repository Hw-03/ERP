---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/mes-status.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-status.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/mes-status.test.ts]]

## 원본 첫 줄

```
import { describe, it, expect } from "vitest";
import {
  toMesTone,
  inferTone,
  TRANSACTION_META,
  getTransactionLabel,
  getTransactionTone,
  transactionColor,
  type MesTone,
} from "../mes-status";
import { LEGACY_COLORS } from "../mes/color";

describe("toMesTone", () => {
  it("동일한 키는 그대로", () => {
    expect(toMesTone("success")).toBe("success");
    expect(toMesTone("warning")).toBe("warning");
    expect(toMesTone("danger")).toBe("danger");
    expect(toMesTone("info")).toBe("info");
    expect(toMesTone("neutral")).toBe("neutral");
    expect(toMesTone("muted")).toBe("muted");
  });

  it("StatusBadge 별칭 흡수: ok→success, warn→warning", () => {
    expect(toMesTone("ok")).toBe("success");
    expect(toMesTone("warn")).toBe("warning");
  });

  it("null/공백/모르는 값은 info", () => {
    expect(toMesTone(null)).toBe("info");
    expect(toMesTone(undefined)).toBe("info");
```
