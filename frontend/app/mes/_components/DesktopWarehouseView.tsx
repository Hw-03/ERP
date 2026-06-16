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
import type { IoEntryIntent } from "./_warehouse_v2/types";

// 탭 전환 remount 사이 직전 카운트 보존 (세션 내 메모리 캐시).
// 새로고침 시 휘발 — 첫 진입은 항상 fresh fetch.
const cartCountCache = new Map<string, number>();
const warehouseQueueCountCache = { value: 0 };
const deptQueueCountCache = new Map<string, number>();

// 인수인계를 받는 부서 — 이 부서 소속이면 결재자가 아니어도 인수 확인 가능.
const HANDOVER_RECEIVE_DEPTS = ["고압", "진공"];

export function DesktopWarehouseView({
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
  // 알림 클릭 딥링크 — URL ?section= 으로 초기 섹션 결정 (권한 없으면 compose 폴백).
  const [sectionTab, setSectionTab] = useState<WarehouseSectionTab>(() => {
    if (typeof window === "undefined") return "compose";
    const s = new URLSearchParams(window.location.search).get("section");
    const valid: WarehouseSectionTab[] = ["compose", "cart", "mine", "queue", "dept-queue", "handover"];
    if (!s || !valid.includes(s as WarehouseSectionTab)) return "compose";
    const whRole = operator?.warehouse_role ?? "none";
    if (s === "queue" && whRole !== "primary" && whRole !== "deputy") return "compose";
    if (s === "dept-queue" && !isDepartmentApprover(operator)) return "compose";
    if (s === "handover") {
      const dept = operator?.department ?? "";
      const ok = dept === "튜브" || HANDOVER_RECEIVE_DEPTS.includes(dept);
      if (!ok) return "compose";
    }
    return s as WarehouseSectionTab;
  });
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
  // 인수인계: 작성(튜브 부서원) 또는 인수 확인(받는 부서 소속)이면 탭 노출. 결재권자는 제외.
  const canReceiveHandover = HANDOVER_RECEIVE_DEPTS.includes(operator?.department ?? "");
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
            entryIntent={entryIntent}
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
