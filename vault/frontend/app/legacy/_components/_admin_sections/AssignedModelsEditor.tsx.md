---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/AssignedModelsEditor.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AssignedModelsEditor.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/AssignedModelsEditor.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { ProductModel } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * 조립 부서 직원의 담당 모델 편집 위젯.
 * - 배열 순서 = 우선순위 (0 = 1순위, 작을수록 위)
 * - ▲/▼ 버튼으로 순서 조정, ✕ 로 제거, 미선택 모델 칩 클릭으로 추가
 * - 입출고 화면에서 조립 그룹 내 정렬 시 이 순서를 사용한다
 */
export function AssignedModelsEditor({
  models,
  selected,
  onChange,
}: {
  models: ProductModel[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const labelOf = (slot: number) => {
    const m = models.find((x) => x.slot === slot);
    if (!m) return `slot ${slot}`;
    return m.model_name || m.symbol || `slot ${slot}`;
  };
  const unselected = models.filter((m) => !selected.includes(m.slot));

  function add(slot: number) {
    if (selected.includes(slot)) return;
    onChange([...selected, slot]);
```
