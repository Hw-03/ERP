---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/HistoryFilterPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# HistoryFilterPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/HistoryFilterPanel.tsx]]

## 원본 첫 줄

```
"use client";

import { Layers, Sparkles, TrendingUp } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";
import { OPERATION_OPTIONS } from "./historyQuery";

// 3차: 유일 필터 패널. 3카드 모두 다중 선택.
// 부서 = 서버 departmentCounts 기반 동적("창고" 포함, 미상은 진짜 unknown만).
// 거래 종류 = 전 16종 고정(공정 R/A/F 카드 폐기). KPI 박스는 표시 전용이라 동기 없음.
type Props = {
  open: boolean;
  /** baseline summary 의 부서별 카운트 — 부서 칩 소스(동적). */
  departmentCounts: Record<string, number>;
  selectedDepts: string[];
  toggleDept: (v: string) => void;
  clearDepts: () => void;
  models: string[];
  selectedModels: string[];
  toggleModel: (v: string) => void;
  clearModels: () => void;
  selectedOps: string[];
  toggleOp: (v: string) => void;
  clearOps: () => void;
};

export function HistoryFilterPanel({
  open,
  departmentCounts,
  selectedDepts,
```
