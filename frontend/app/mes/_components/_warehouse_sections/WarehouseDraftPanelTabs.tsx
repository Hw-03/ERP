"use client";

import { useEffect, useRef, useState } from "react";
import { api, type IoBatch, type Item, type StockRequest } from "@/lib/api";
import { MyRequestsPanel } from "./MyRequestsPanel";
import { WarehouseQueuePanel } from "./WarehouseQueuePanel";
import { DepartmentQueuePanel } from "./DepartmentQueuePanel";
import { AsResearchQueuePanel } from "./AsResearchQueuePanel";
import { DraftCartPanel } from "./DraftCartPanel";
import { HandoverSectionPanel } from "./HandoverSectionPanel";
import type { WarehouseSectionTab } from "./WarehouseSectionTabs";
import type { Operator } from "../login/useCurrentOperator";
import { AccessRevocationGuard } from "../common/AccessRevocationGuard";

/**
 * Round-13 (#1) 추출 — DesktopWarehouseView 의 cart/mine/queue 3 패널 분기.
 *
 * sectionTab 에 따라 하나의 panel 만 렌더. compose 탭에서는 null 반환
 * (compose 콘텐츠는 본 sub-component 외부에 위치).
 */
export interface WarehouseDraftPanelTabsProps {
  layout: "desktop" | "mobile";
  sectionTab: WarehouseSectionTab;
  onAccessRevoked: () => void;
  accessAllowed?: boolean;
  canSeeQueue: boolean;
  canSeeDeptQueue: boolean;
  canSeeAsResearchQueue: boolean;
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
  onEmptyStateChange?: (empty: boolean) => void;
  onStartCompose?: () => void;
  targetRequestId?: string | null;
}

export function WarehouseDraftPanelTabs(props: WarehouseDraftPanelTabsProps) {
  const [continueError, setContinueError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const continueBusy = useRef(false);
  const generation = useRef(0);
  const allowed = (props.accessAllowed ?? true) && (props.sectionTab === "queue" ? props.canSeeQueue
    : props.sectionTab === "dept-queue" ? props.canSeeDeptQueue
    : props.sectionTab === "as-research-queue" ? props.canSeeAsResearchQueue : true);
  useEffect(() => {
    generation.current += 1;
    setContinueError(null);
    setContinuing(false);
    return () => { generation.current += 1; };
  }, [props.sectionTab, props.operatorEmployeeId, allowed]);

  /** 작업자가 이어서 작업을 누르면 저장된 수량 그대로 예약을 복구한다. */
  async function continueDraft(draft: IoBatch): Promise<void> {
    if (!allowed || !props.onContinueIoDraft || continueBusy.current) return;
    const pause = draft.stocktake_pause;
    if (!pause) { props.onContinueIoDraft(draft); return; }
    if (pause.state !== "ready") return;
    const requestedGeneration = generation.current;
    continueBusy.current = true;
    setContinuing(true);
    setContinueError(null);
    try {
      const revision = draft.revision;
      if (typeof revision !== "number" || !Number.isInteger(revision)) throw new Error("작업 중 목록에서 최신 작업을 다시 불러와 주세요.");
      const resumed = await api.saveDraft({
        batch_id: draft.batch_id, expected_revision: revision, stocktake_resume_token: pause.token,
        requester_employee_id: draft.requester_employee_id, work_type: draft.work_type, sub_type: draft.sub_type,
        from_department: draft.from_department, to_department: draft.to_department, reference_no: draft.reference_no,
        notes: draft.notes, supplier_id: draft.supplier_id, reason_category_id: draft.reason_category_id,
        reason_category: draft.reason_category, bundles: draft.bundles,
      });
      if (requestedGeneration === generation.current) props.onContinueIoDraft({ ...resumed, stocktake_resumed: true });
    } catch (error) {
      if (requestedGeneration === generation.current) setContinueError(error instanceof Error ? error.message : "작업을 이어갈 수 없습니다. 다시 시도해 주세요.");
    } finally {
      continueBusy.current = false;
      if (requestedGeneration === generation.current) { setContinuing(false); props.bumpRefresh(); }
    }
  }

  return <>
    {continueError && <p role="alert" className="text-sm">{continueError}</p>}
    {continuing && <p role="status" className="text-sm">작업을 불러오는 중입니다.</p>}
    <AccessRevocationGuard key={props.sectionTab} allowed={allowed} onLeave={props.onAccessRevoked}>
      <WarehouseDraftPanelContent {...props} onContinueIoDraft={(draft) => { void continueDraft(draft); }} />
    </AccessRevocationGuard>
  </>;
}

function WarehouseDraftPanelContent({
  layout,
  sectionTab,
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
  onEmptyStateChange,
  onStartCompose,
  targetRequestId,
}: WarehouseDraftPanelTabsProps) {
  if (sectionTab === "cart") {
    return (
      <DraftCartPanel
        layout={layout}
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
        onEmptyStateChange={onEmptyStateChange}
        onStartCompose={onStartCompose}
      />
    );
  }

  if (sectionTab === "mine") {
    return (
        <MyRequestsPanel
          mobilePresentation={layout === "mobile"}
          targetRequestId={targetRequestId}
        employeeId={employeeId || operatorEmployeeId || null}
        onEmptyStateChange={onEmptyStateChange}
        refreshNonce={refreshNonce}
        onChanged={() => {
          bumpRefresh();
          onSubmitSuccess?.();
        }}
        onContinueIoDraft={onContinueIoDraft}
      />
    );
  }

  if (sectionTab === "queue" && operatorEmployeeId) {
    return (
        <WarehouseQueuePanel
          mobilePresentation={layout === "mobile"}
          targetRequestId={targetRequestId}
        approverEmployeeId={operatorEmployeeId}
        refreshNonce={refreshNonce}
        onEmptyStateChange={onEmptyStateChange}
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
        mobilePresentation={layout === "mobile"}
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

  if (sectionTab === "as-research-queue" && operatorEmployeeId) {
    return (
      <AsResearchQueuePanel
        mobilePresentation={layout === "mobile"}
        targetRequestId={targetRequestId}
        approverEmployeeId={operatorEmployeeId}
        refreshNonce={refreshNonce}
        onEmptyStateChange={onEmptyStateChange}
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

  if (sectionTab === "dept-queue" && operatorEmployeeId) {
    return (
        <DepartmentQueuePanel
          mobilePresentation={layout === "mobile"}
          targetRequestId={targetRequestId}
        approverEmployeeId={operatorEmployeeId}
        refreshNonce={refreshNonce}
        onEmptyStateChange={onEmptyStateChange}
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
