---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomDeptTabs.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BomDeptTabs.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomDeptTabs.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { DEPT_LETTERS, DEPT_LETTER_TO_NAME, deptColor, type DeptLetter } from "./bomDept";

/**
 * 부서탭 6개 — 튜브/고압/진공/튜닝/조립/출하. 활성탭은 부서 색상으로 채워짐.
 */
interface Props {
  value: DeptLetter;
  onChange: (v: DeptLetter) => void;
}

export function BomDeptTabs({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {DEPT_LETTERS.map((letter) => {
        const active = letter === value;
        const color = deptColor(letter);
        return (
          <button
            key={letter}
            type="button"
            onClick={() => onChange(letter)}
            className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
            style={{
              background: active ? color : LEGACY_COLORS.s1,
              color: active ? LEGACY_COLORS.white : LEGACY_COLORS.text,
              borderColor: active ? color : LEGACY_COLORS.border,
            }}
```
