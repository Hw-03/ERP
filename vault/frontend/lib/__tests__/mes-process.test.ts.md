---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/mes-process.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-process.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/mes-process.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect } from "vitest";
import {
  PROCESS_LABEL,
  PROCESS_TO_DEPT,
  processStageLabel,
  itemCodeDept,
  itemCodeDeptBadge,
  displayPart,
} from "../mes/process";

describe("processStageLabel", () => {
  it("returns Korean label for known stage codes", () => {
    expect(processStageLabel("TR")).toBe("Tube Raw");
    expect(processStageLabel("AA")).toBe("Assembly");
    expect(processStageLabel("PF")).toBe("Pack Final");
  });

  it("returns input as-is for unknown code", () => {
    expect(processStageLabel("XX")).toBe("XX");
  });

  it("returns '-' for empty / null / undefined", () => {
    expect(processStageLabel(undefined)).toBe("-");
    expect(processStageLabel(null)).toBe("-");
    expect(processStageLabel("")).toBe("-");
  });
});

describe("PROCESS_LABEL", () => {
  it("covers 18 stages (6 부서 × 3 단계)", () => {
```
