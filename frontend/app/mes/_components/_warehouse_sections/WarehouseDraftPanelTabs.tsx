"use client";

import { api, type IoBatch, type Item, type StockRequest } from "@/lib/api";
import { MyRequestsPanel } from "./MyRequestsPanel";
import { WarehouseQueuePanel } from "./WarehouseQueuePanel";
import { DepartmentQueuePanel } from "./DepartmentQueuePanel";
import { DraftCartPanel } from "./DraftCartPanel";
import { HandoverSectionPanel } from "./HandoverSectionPanel";
import type { WarehouseSectionTab } from "./WarehouseSectionTabs";
import type { Operator } from "../login/useCurrentOperator";

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
  operator: Operator | null;
  operatorEmployeeId: string | undefined;
  employeeId: string;
  refreshNonce: number;
  globalSearch: string;
  items: Item[];
  setItems: (items: import("@/lib/api").Item[]) => void;
  onContinueDraft: (draft: StockRequest) => void;
  onContinueIoDraft?: (draft: IoBatch) => void;
  bumpRefresh: () => void;
  onSubmitSuccess?: () => void;
  resetDraftTracking: () => void;
  onCartCountChange?: (n: number) => void;
}

export function WarehouseDraftPanelTabs({
  sectionTab,
  canSeeQueue,
  canSeeDeptQueue,
  operator,
  operatorEmployeeId,
  employeeId,
  refreshNonce,
  globalSearch,
  items,
  setItems,
  onContinueDraft,
  onContinueIoDraft,
  bumpRefresh,
  onSubmitSuccess,
  resetDraftTracking,
  onCartCountChange,
}: WarehouseDraftPanelTabsProps) {
  if (sectionTab === "cart") {
    return (
      <DraftCartPanel
        employeeId={operatorEmployeeId ?? employeeId ?? null}
        refreshNonce={refreshNonce}
        onContinue={(draft) => {
          onContinueDraft(draft);
          bumpRefresh();
        }}
        onContinueIo={(draft) => {
          onContinueIoDraft?.(draft);
          bumpRefresh();
        }}
        onChanged={() => {
          resetDraftTracking();
          bumpRefresh();
          onSubmitSuccess?.();
        }}
        onCountChange={onCartCountChange}
      />
    );
  }

  if (sectionTab === "mine") {
    return (
      <MyRequestsPanel
        employeeId={employeeId || operatorEmployeeId || null}
        refreshNonce={refreshNonce}
        onChanged={() => {
          bumpRefresh();
          onSubmitSuccess?.();
        }}
      />
    );
  }

  if (sectionTab === "queue" && canSeeQueue && operatorEmployeeId) {
    return (
      <WarehouseQueuePanel
        approverEmployeeId={operatorEmployeeId}
        refreshNonce={refreshNonce}
        onChanged={async () => {
          bumpRefresh();
          try {
            const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
            setItems(refreshed);
          } catch {
            /* 무시 */
          }
          onSubmitSuccess?.();
        }}
      />
    );
  }

  if (sectionTab === "handover") {
    return (
      <HandoverSectionPanel
        operator={operator}
        operatorEmployeeId={operatorEmployeeId}
        items={items}
        refreshNonce={refreshNonce}
        onChanged={() => {
          bumpRefresh();
          onSubmitSuccess?.();
        }}
      />
    );
  }

  if (sectionTab === "dept-queue" && canSeeDeptQueue && operatorEmployeeId) {
    return (
      <DepartmentQueuePanel
        approverEmployeeId={operatorEmployeeId}
        refreshNonce={refreshNonce}
        onChanged={async () => {
          bumpRefresh();
          try {
            const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
            setItems(refreshed);
          } catch {
            /* 무시 */
          }
          onSubmitSuccess?.();
        }}
      />
    );
  }

  return null;
}
