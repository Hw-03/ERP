"use client";

import { useEffect, useRef, useState } from "react";
import { api, type IoBatch, type Item, type StockRequest } from "@/lib/api";
import { canEnterIO, isDepartmentApprover } from "../../_warehouse_steps";
import { useWarehouseData } from "../../_warehouse_hooks/useWarehouseData";
import { WarehouseHeader } from "../../_warehouse_sections/WarehouseHeader";
import {
  WarehouseSectionTabs,
  type WarehouseSectionTab,
} from "../../_warehouse_sections/WarehouseSectionTabs";
import { WarehouseAccessDenied } from "../../_warehouse_sections/WarehouseAccessDenied";
import { WarehouseDraftPanelTabs } from "../../_warehouse_sections/WarehouseDraftPanelTabs";
import { readCurrentOperator } from "../../login/useCurrentOperator";
import type { IoEntryIntent } from "../../_warehouse_v2/types";
import { MobileIoComposeWizard } from "../warehouse/MobileIoComposeWizard";
import { MobileDirtyLeaveSheet } from "../warehouse/MobileDirtyLeaveSheet";
import panelStyles from "./mobileWarehousePanels.module.css";

// 인수인계 수신 부서 — DesktopWarehouseView 와 동일 도메인 상수(미export 라 동일값 복제).
const HANDOVER_RECEIVE_DEPTS = ["고압", "진공"];

// 탭 전환 remount 사이 직전 카운트 보존 (세션 내 메모리 캐시) — DesktopWarehouseView 와 동일.
const cartCountCache = new Map<string, number>();
const warehouseQueueCountCache = { value: 0 };
const deptQueueCountCache = new Map<string, number>();

/**
 * 입출고 모바일 화면.
 *
 * DesktopWarehouseView 의 데이터/권한/섹션 오케스트레이션을 그대로 따르되,
 * compose 섹션을 모바일 풀스크린 위저드(MobileIoComposeWizard)로 교체해
 * 393px 에서도 품목 선택~제출이 가능하게 한다. queue/cart/부서대기 섹션은
 * 기존 WarehouseDraftPanelTabs 를 재사용한다.
 */
export function MobileWarehouseScreen({
  globalSearch,
  onStatusChange,
  preselectedItem,
  entryIntent,
  onSubmitSuccess,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  preselectedItem?: Item | null;
  entryIntent?: IoEntryIntent | null;
  onSubmitSuccess?: () => void;
}) {
  const { employees, items, productModels, loadFailure, setItems } = useWarehouseData({
    globalSearch,
    onStatusChange,
  });

  const operator = typeof window !== "undefined" ? readCurrentOperator() : null;
  const [employeeId, setEmployeeId] = useState<string>(operator?.employee_id ?? "");
  const [sectionTab, setSectionTab] = useState<WarehouseSectionTab>("compose");
  const [panelRefreshNonce, setPanelRefreshNonce] = useState(0);
  const [cartCount, setCartCount] = useState(() => {
    const eid = operator?.employee_id ?? "";
    return eid ? cartCountCache.get(eid) ?? 0 : 0;
  });
  const [warehouseQueueCount, setWarehouseQueueCount] = useState(
    () => warehouseQueueCountCache.value,
  );
  const [deptQueueCount, setDeptQueueCount] = useState(() => {
    const eid = operator?.employee_id ?? "";
    return eid ? deptQueueCountCache.get(eid) ?? 0 : 0;
  });
  const [restoreIoDraft, setRestoreIoDraft] = useState<IoBatch | null>(null);
  const [handoverInboxCount, setHandoverInboxCount] = useState(0);
  // D2 — compose 작성 중(담은 묶음 있음) 다른 섹션 이탈 가드.
  const [composeDirty, setComposeDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<WarehouseSectionTab | null>(null);
  const flushDraftRef = useRef<(() => void) | null>(null);

  const operatorEmployeeId = operator?.employee_id ?? employeeId;
  const canSeeQueue =
    (operator?.warehouse_role ?? "none") === "primary" ||
    (operator?.warehouse_role ?? "none") === "deputy";
  const canSeeDeptQueue = isDepartmentApprover(operator);
  // 인수인계: 작성(튜브) 또는 인수 확인(받는 부서/부서 결재자) 가능하면 탭 노출 — 데스크톱 동일.
  const canReceiveHandover =
    canSeeDeptQueue || HANDOVER_RECEIVE_DEPTS.includes(operator?.department ?? "");
  const showHandover = (operator?.department ?? "") === "튜브" || canReceiveHandover;

  useEffect(() => {
    if (operator && employeeId === "") setEmployeeId(operator.employee_id);
  }, [operator, employeeId]);

  useEffect(() => {
    if (!operatorEmployeeId) return;
    Promise.all([
      api.listStockRequestDrafts(operatorEmployeeId),
      api.listDrafts(operatorEmployeeId),
    ])
      .then(([legacyRows, ioRows]) => {
        const n = legacyRows.length + ioRows.length;
        setCartCount(n);
        cartCountCache.set(operatorEmployeeId, n);
      })
      .catch(() => {});
  }, [operatorEmployeeId, panelRefreshNonce]);

  useEffect(() => {
    if (!canSeeQueue) return;
    api
      .countWarehouseQueue()
      .then(({ count }) => {
        setWarehouseQueueCount(count);
        warehouseQueueCountCache.value = count;
      })
      .catch(() => {});
  }, [canSeeQueue, panelRefreshNonce]);

  useEffect(() => {
    if (!canSeeDeptQueue || !operatorEmployeeId) return;
    api
      .countDepartmentQueue(operatorEmployeeId)
      .then(({ count }) => {
        setDeptQueueCount(count);
        deptQueueCountCache.set(operatorEmployeeId, count);
      })
      .catch(() => {});
  }, [canSeeDeptQueue, operatorEmployeeId, panelRefreshNonce]);

  useEffect(() => {
    if (!canReceiveHandover || !operatorEmployeeId) return;
    api
      .countHandoverInbox(operatorEmployeeId)
      .then(({ count }) => setHandoverInboxCount(count))
      .catch(() => {});
  }, [canReceiveHandover, operatorEmployeeId, panelRefreshNonce]);

  if (operator && !canEnterIO(operator)) {
    return <WarehouseAccessDenied department={operator.department ?? ""} />;
  }

  function handleLegacyDraftContinue(_draft: StockRequest) {
    setSectionTab("compose");
    onStatusChange("구형 장바구니는 새 입출고 화면에서 직접 복원되지 않습니다.");
  }

  // compose 에서 작성 중인데 다른 섹션으로 이동하려 하면 확인 시트로 가드.
  function handleSectionChange(next: WarehouseSectionTab) {
    if (sectionTab === "compose" && next !== "compose" && composeDirty) {
      setPendingTab(next);
      return;
    }
    setSectionTab(next);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-2 px-3 pt-3">
        <WarehouseHeader loadFailure={loadFailure} />
        <WarehouseSectionTabs
          active={sectionTab}
          onChange={handleSectionChange}
          showQueue={canSeeQueue}
          showDeptQueue={canSeeDeptQueue}
          showHandover={showHandover}
          cartCount={cartCount}
          queueCount={warehouseQueueCount}
          deptQueueCount={deptQueueCount}
          handoverInboxCount={handoverInboxCount}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {sectionTab === "compose" ? (
          <MobileIoComposeWizard
            globalSearch={globalSearch}
            operator={operator}
            employees={employees}
            items={items}
            productModels={productModels}
            setItems={setItems}
            preselectedItem={preselectedItem}
            restoreDraft={restoreIoDraft}
            entryIntent={entryIntent}
            onDirtyChange={setComposeDirty}
            flushDraftRef={flushDraftRef}
            onStatusChange={(status) => {
              onStatusChange(status);
              setPanelRefreshNonce((n) => n + 1);
            }}
            onSubmitSuccess={() => {
              setPanelRefreshNonce((n) => n + 1);
              onSubmitSuccess?.();
            }}
          />
        ) : (
          <div className={`h-full overflow-y-auto px-3 pb-6 ${panelStyles.touchScope}`}>
            <WarehouseDraftPanelTabs
              sectionTab={sectionTab}
              canSeeQueue={canSeeQueue}
              canSeeDeptQueue={canSeeDeptQueue}
              operator={operator}
              operatorEmployeeId={operator?.employee_id}
              employeeId={employeeId}
              refreshNonce={panelRefreshNonce}
              globalSearch={globalSearch}
              items={items}
              setItems={setItems}
              onContinueDraft={handleLegacyDraftContinue}
              onContinueIoDraft={(draft) => {
                setRestoreIoDraft(draft);
                setSectionTab("compose");
              }}
              bumpRefresh={() => setPanelRefreshNonce((n) => n + 1)}
              onSubmitSuccess={onSubmitSuccess}
              resetDraftTracking={() => {}}
              onCartCountChange={(n) => {
                setCartCount(n);
                if (operatorEmployeeId) cartCountCache.set(operatorEmployeeId, n);
              }}
            />
          </div>
        )}
      </div>

      <MobileDirtyLeaveSheet
        open={pendingTab !== null}
        onCancel={() => setPendingTab(null)}
        onConfirm={() => {
          flushDraftRef.current?.(); // 700ms 디바운스 창의 마지막 변경까지 즉시 저장
          const next = pendingTab;
          setPendingTab(null);
          setComposeDirty(false);
          if (next) setSectionTab(next);
        }}
      />
    </div>
  );
}
