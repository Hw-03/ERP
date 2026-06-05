"use client";

import { useEffect, useState } from "react";
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
import { MobileIoComposeWizard } from "../warehouse/MobileIoComposeWizard";

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

  const operatorEmployeeId = operator?.employee_id ?? employeeId;
  const canSeeQueue =
    (operator?.warehouse_role ?? "none") === "primary" ||
    (operator?.warehouse_role ?? "none") === "deputy";
  const canSeeDeptQueue = isDepartmentApprover(operator);

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

  if (operator && !canEnterIO(operator)) {
    return <WarehouseAccessDenied department={operator.department ?? ""} />;
  }

  function handleLegacyDraftContinue(_draft: StockRequest) {
    setSectionTab("compose");
    onStatusChange("구형 장바구니는 새 입출고 화면에서 직접 복원되지 않습니다.");
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-2 px-3 pt-3">
        <WarehouseHeader loadFailure={loadFailure} />
        <WarehouseSectionTabs
          active={sectionTab}
          onChange={setSectionTab}
          showQueue={canSeeQueue}
          showDeptQueue={canSeeDeptQueue}
          cartCount={cartCount}
          queueCount={warehouseQueueCount}
          deptQueueCount={deptQueueCount}
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
          <div className="h-full overflow-y-auto px-3 pb-6">
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
    </div>
  );
}
