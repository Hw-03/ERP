---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomChildAddBox.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BomChildAddBox.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomChildAddBox.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";
import { BomSearchInput } from "./BomSearchInput";
import { DEPT_LETTERS, DEPT_LETTER_TO_NAME, deptColor, deptOf, stageOf, type DeptLetter, type StageLetter } from "./bomDept";
import { EmptyState } from "../../common";

/**
 * 가운데 하위품목 추가 패널.
 *
 * 검색 + 부서칩 + 단계칩 + 후보 리스트.
 * 후보 클릭 → 해당 row 아래에 수량 입력 영역 펼침.
 *   - Enter : 추가 (qty>0 검증)
 *   - Esc   : 취소(접기)
 * 자기참조(parent===child)·이미 자식인 항목은 후보에서 비활성.
 */
interface Props {
  parent: Item;
  bomRows: BOMEntry[];
  items: Item[];
  onAdd: (childId: string, childName: string, qty: number) => Promise<boolean>;
}

const STAGE_FILTERS: { id: "ALL" | StageLetter; label: string }[] = [
  { id: "ALL", label: "전체" },
```
