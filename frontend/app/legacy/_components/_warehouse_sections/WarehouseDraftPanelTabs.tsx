"use client";

import { api, type StockRequest } from "@/lib/api";
import { MyRequestsPanel } from "./MyRequestsPanel";
import { WarehouseQueuePanel } from "./WarehouseQueuePanel";
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
  operatorEmployeeId: string | undefined;
  employeeId: string;
  refreshNonce: number;
  globalSearch: string;
  setItems: (items: import("@/lib/api").Item[]) => void;
  onContinueDraft: (draft: StockRequest) => void;
  bumpRefresh: () => void;
  onSubmitSuccess?: () => void;
  resetDraftTracking: () => void;
}

export function WarehouseDraftPanelTabs({
  sectionTab,
  canSeeQueue,
  operatorEmployeeId,
  employeeId,
  refreshNonce,
  globalSearch,
  setItems,
  onContinueDraft,
  bumpRefresh,
  onSubmitSuccess,
  resetDraftTracking,
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
        onChanged={() => {
          resetDraftTracking();
          bumpRefresh();
          onSubmitSuccess?.();
        }}
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

  return null;
}
