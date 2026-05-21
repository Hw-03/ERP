---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_inventory_sections/DesktopInventoryRightPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# DesktopInventoryRightPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_inventory_sections/DesktopInventoryRightPanel.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { Item, TransactionLog } from "@/lib/api";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { InventoryDetailPanel } from "./InventoryDetailPanel";

/**
 * Round-13 (#9) 추출 — DesktopInventoryView 우측 슬라이딩 상세 패널.
 *
 * `selectedItem` 가 null 이어도 lastSelected 표시를 유지해야 하므로 `displayItem` 을 별도로 받음.
 * `onClose` — 패널 닫기(행 선택 해제). SlidePanel 의 X 버튼 / ESC / focus-trap / role=dialog 로 처리
 * (history 패널과 동일 패턴 — 헤더 중복 X 버튼 제거).
 */
export interface DesktopInventoryRightPanelProps {
  selectedItem: Item | null;
  displayItem: Item | null;
  itemLogs: TransactionLog[];
  headerBadge: React.ReactNode;
  onClose: () => void;
  onGoToWarehouse: (item: Item) => void;
}

export function DesktopInventoryRightPanel({
  selectedItem,
  displayItem,
  itemLogs,
  headerBadge,
  onClose,
  onGoToWarehouse,
```
