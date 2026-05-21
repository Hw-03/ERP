---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx
tags: [vault, code-note, auto-generated, stub]
---

# WarehouseDraftPanelTabs.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { api, type IoBatch, type StockRequest } from "@/lib/api";
import { MyRequestsPanel } from "./MyRequestsPanel";
import { WarehouseQueuePanel } from "./WarehouseQueuePanel";
import { DepartmentQueuePanel } from "./DepartmentQueuePanel";
import { DraftCartPanel } from "./DraftCartPanel";
import type { WarehouseSectionTab } from "./WarehouseSectionTabs";

/**
 * Round-13 (#1) 추출 — DesktopWarehouseView 의 cart/mine/queue 3 패널 분기.
 *
 * sectionTab 에 따라 하나의 panel 만 렌더. compose 탭에서는 null 반환
 * (compose 콘텐츠는 본 sub-component 외부에 위치).
 */
export interface WarehouseDraftPanelTabsProps {
  sectionTab: WarehouseSectionTab;
  canSeeQueue: boolean;
  canSeeDeptQueue: boolean;
  operatorEmployeeId: string | undefined;
  employeeId: string;
  refreshNonce: number;
  globalSearch: string;
  setItems: (items: import("@/lib/api").Item[]) => void;
  onContinueDraft: (draft: StockRequest) => void;
  onContinueIoDraft?: (draft: IoBatch) => void;
  bumpRefresh: () => void;
  onSubmitSuccess?: () => void;
  resetDraftTracking: () => void;
  onCartCountChange?: (n: number) => void;
```
