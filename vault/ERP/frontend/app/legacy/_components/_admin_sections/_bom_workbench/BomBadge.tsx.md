---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomBadge.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BomBadge.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomBadge.tsx]]

## 원본 첫 줄

```
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { deptBadgeBg, deptColor, deptOf } from "./bomDept";

/**
 * 부서+단계 배지. 예: "HA" (고압 중간공정), "TR" (튜브 원자재).
 *
 * 시각: 부서 색상 12% 배경 + 진한 부서색 글자. process_type_code 가 null/잘못된
 * 값이면 muted "?" 배지.
 */
interface Props {
  processTypeCode: string | null | undefined;
  /** 작은 배지 (10px 폰트). 기본은 12px. */
  small?: boolean;
}

export function BomBadge({ processTypeCode, small = false }: Props) {
  const dept = deptOf(processTypeCode);
  const label = (processTypeCode ?? "?").slice(0, 2).toUpperCase();

  const fontSize = small ? "10px" : "12px";
  const padding = small ? "2px 7px" : "3px 9px";

  if (!dept) {
    return (
      <span
        className="inline-flex items-center rounded-md font-bold tracking-wider"
        style={{
          fontSize,
```
