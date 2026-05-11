"use client";

import { useEffect, useState } from "react";
import { api, type IoBatch, type Item, type StockRequest } from "@/lib/api";
import { canEnterIO } from "./_warehouse_steps";
import { useWarehouseData } from "./_warehouse_hooks/useWarehouseData";
import { WarehouseHeader } from "./_warehouse_sections/WarehouseHeader";
import { WarehouseSectionTabs, type WarehouseSectionTab } from "./_warehouse_sections/WarehouseSectionTabs";
import { WarehouseAccessDenied } from "./_warehouse_sections/WarehouseAccessDenied";
import { WarehouseDraftPanelTabs } from "./_warehouse_sections/WarehouseDraftPanelTabs";
import { IoComposeView } from "./_warehouse_v2/IoComposeView";
import { readCurrentOperator } from "./login/useCurrentOperator";

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
  const { employees, items, packages, productModels, loadFailure, setItems } = useWarehouseData({
    globalSearch,
    onStatusChange,
  });

  const operator = typeof window !== "undefined" ? readCurrentOperator() : null;
  const [employeeId, setEmployeeId] = useState<string>(operator?.employee_id ?? "");
  const [sectionTab, setSectionTab] = useState<WarehouseSectionTab>("compose");
  const [panelRefreshNonce, setPanelRefreshNonce] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [restoreIoDraft, setRestoreIoDraft] = useState<IoBatch | null>(null);

  const operatorEmployeeId = operator?.employee_id ?? employeeId;
  const canSeeQueue =
    (operator?.warehouse_role ?? "none") === "primary" ||
    (operator?.warehouse_role ?? "none") === "deputy";

  useEffect(() => {
    if (operator && employeeId === "") setEmployeeId(operator.employee_id);
  }, [operator, employeeId]);

  useEffect(() => {
    if (!operatorEmployeeId) return;
    Promise.all([
      api.listStockRequestDrafts(operatorEmployeeId),
      api.listDrafts(operatorEmployeeId),
    ])
      .then(([legacyRows, ioRows]) => setCartCount(legacyRows.length + ioRows.length))
      .catch(() => {});
  }, [operatorEmployeeId, panelRefreshNonce]);

  if (operator && !canEnterIO(operator)) {
    return <WarehouseAccessDenied department={operator.department ?? ""} />;
  }

  function handleLegacyDraftContinue(_draft: StockRequest) {
    setSectionTab("compose");
    onStatusChange("구형 장바구니는 새 입출고 화면에서 직접 복원되지 않습니다.");
  }

  return (
    <div className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto pr-4">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-6 pb-10 pt-4">
        <WarehouseHeader loadFailure={loadFailure} />
        <WarehouseSectionTabs
          active={sectionTab}
          onChange={setSectionTab}
          showQueue={canSeeQueue}
          cartCount={cartCount}
        />

        <WarehouseDraftPanelTabs
          sectionTab={sectionTab}
          canSeeQueue={canSeeQueue}
          operatorEmployeeId={operator?.employee_id}
          employeeId={employeeId}
          refreshNonce={panelRefreshNonce}
          globalSearch={globalSearch}
          setItems={setItems}
          onContinueDraft={handleLegacyDraftContinue}
          onContinueIoDraft={(draft) => {
            setRestoreIoDraft(draft);
            setSectionTab("compose");
          }}
          bumpRefresh={() => setPanelRefreshNonce((n) => n + 1)}
          onSubmitSuccess={onSubmitSuccess}
          resetDraftTracking={() => {}}
          onCartCountChange={setCartCount}
        />

        {sectionTab === "compose" && (
          <IoComposeView
            globalSearch={globalSearch}
            operator={operator}
            employees={employees}
            items={items}
            packages={packages}
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
