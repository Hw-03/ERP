"use client";

import { useEffect, useState } from "react";
import { api, type IoBatch, type Item, type StockRequest } from "@/lib/api";
import { canEnterIO, isDepartmentApprover } from "./_warehouse_steps";
import { useWarehouseData } from "./_warehouse_hooks/useWarehouseData";
import { WarehouseHeader } from "./_warehouse_sections/WarehouseHeader";
import { WarehouseSectionTabs, type WarehouseSectionTab } from "./_warehouse_sections/WarehouseSectionTabs";
import { WarehouseAccessDenied } from "./_warehouse_sections/WarehouseAccessDenied";
import { WarehouseDraftPanelTabs } from "./_warehouse_sections/WarehouseDraftPanelTabs";
import { IoComposeView } from "./_warehouse_v2/IoComposeView";
import { readCurrentOperator } from "./login/useCurrentOperator";

// 탭 전환 remount 사이 직전 카운트 보존 (세션 내 메모리 캐시).
// 새로고침 시 휘발 — 첫 진입은 항상 fresh fetch.
const cartCountCache = new Map<string, number>();
const warehouseQueueCountCache = { value: 0 };
const deptQueueCountCache = new Map<string, number>();

export function DesktopWarehouseView({
  globalSearch,
  onStatusChange,
  preselectedItem,
  onSubmitSuccess,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  preselectedItem?: Item | null;
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

  const operatorEmployeeId = operator?.employee_id ?? employeeId;
  const canSeeQueue =
    (operator?.warehouse_role ?? "none") === "primary" ||
    (operator?.warehouse_role ?? "none") === "deputy";
  const canSeeDeptQueue = isDepartmentApprover(operator);
  // 인수인계: 작성(튜브 부서원) 또는 인수 확인(부서 결재 가능자) 가능하면 탭 노출.
  const canReceiveHandover = canSeeDeptQueue;
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

  return (
    <div className="flex h-full min-h-0 flex-1 min-w-0 overflow-y-auto lg:pr-4">
      <div className="flex min-h-full w-full flex-col gap-3 px-3 lg:px-6 pb-10 pt-4">
        <WarehouseHeader loadFailure={loadFailure} />
        <WarehouseSectionTabs
          active={sectionTab}
          onChange={setSectionTab}
          showQueue={canSeeQueue}
          showDeptQueue={canSeeDeptQueue}
          showHandover={showHandover}
          cartCount={cartCount}
          queueCount={warehouseQueueCount}
          deptQueueCount={deptQueueCount}
          handoverInboxCount={handoverInboxCount}
        />

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

        {sectionTab === "compose" && (
          <IoComposeView
            globalSearch={globalSearch}
            operator={operator}
            employees={employees}
            items={items}
            productModels={productModels}
            setItems={setItems}
            preselectedItem={preselectedItem}
            restoreDraft={restoreIoDraft}
            onStatusChange={(status) => {
              onStatusChange(status);
              setPanelRefreshNonce((n) => n + 1);
            }}
            onSubmitSuccess={() => {
              setPanelRefreshNonce((n) => n + 1);
              onSubmitSuccess?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
