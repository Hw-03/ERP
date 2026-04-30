"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MobileShell, type TabId } from "./_components/mobile/MobileShell";
import { InventoryScreen } from "./_components/mobile/screens/InventoryScreen";
import { HistoryScreen } from "./_components/mobile/screens/HistoryScreen";
import { Toast, type ToastState } from "./_components/Toast";
import { AdminShell } from "./_components/mobile/screens/admin/AdminShell";
import { DesktopLegacyShell } from "./_components/DesktopLegacyShell";
import {
  WarehouseWizardProvider,
  useWarehouseWizard,
} from "./_components/mobile/io/warehouse/context";
import { WarehouseWizardScreen } from "./_components/mobile/io/warehouse/WarehouseWizardScreen";
import { DeptWizardProvider } from "./_components/mobile/io/dept/context";
import { DeptWizardScreen } from "./_components/mobile/io/dept/DeptWizardScreen";
import { ErpLoginGate } from "./_components/login/ErpLoginGate";
import { DepartmentsProvider } from "./_components/DepartmentsContext";
import { useCurrentOperator } from "./_components/login/useCurrentOperator";
import { canEnterIO } from "./_components/_warehouse_steps";

const TAB_TITLES: Record<TabId, { subtitle: string; title: string }> = {
  inventory: { subtitle: "재고 현황", title: "재고" },
  warehouse: { subtitle: "창고 입출고", title: "창고입출고" },
  dept: { subtitle: "부서 입출고", title: "부서입출고" },
  admin: { subtitle: "관리자", title: "관리자" },
};

export default function LegacyPage() {
  return (
    <DepartmentsProvider>
      <ErpLoginGate>
        <WarehouseWizardProvider>
          <DeptWizardProvider>
            <Suspense>
              <LegacyBody />
            </Suspense>
          </DeptWizardProvider>
        </WarehouseWizardProvider>
      </ErpLoginGate>
    </DepartmentsProvider>
  );
}

const VALID_MOBILE_TABS = new Set<TabId>(["inventory", "warehouse", "dept", "admin"]);

function LegacyBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (() => {
    const t = searchParams.get("tab") as TabId | null;
    return t && VALID_MOBILE_TABS.has(t) ? t : "inventory";
  })();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { dispatch: warehouseDispatch } = useWarehouseWizard();
  const operator = useCurrentOperator();

  // 브라우저 뒤로/앞으로 → URL 변경 시 활성 탭 동기화
  useEffect(() => {
    const t = searchParams.get("tab") as TabId | null;
    if (t && VALID_MOBILE_TABS.has(t) && t !== activeTab) {
      setActiveTab(t);
      setShowHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const changeTab = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      setShowHistory(false);
      router.push(`/legacy?tab=${tab}`, { scroll: false });
    },
    [router],
  );

  // 입출고 권한이 없는 부서 사용자가 직접 ?tab=warehouse|dept 로 진입하면 재고 탭으로 강제 이동
  useEffect(() => {
    if (!operator) return;
    if ((activeTab === "warehouse" || activeTab === "dept") && !canEnterIO(operator)) {
      changeTab("inventory");
    }
  }, [activeTab, operator, changeTab]);

  const showToast = useCallback((next: ToastState) => setToast(next), []);
  const clearToast = useCallback(() => setToast(null), []);

  const title = useMemo(() => {
    if (showHistory) return { subtitle: "입출고 이력", title: "입출고 이력" };
    return TAB_TITLES[activeTab];
  }, [activeTab, showHistory]);

  return (
    <>
      <div className="lg:hidden">
        <MobileShell
          activeTab={activeTab}
          onTabChange={changeTab}
          subtitle={title.subtitle}
          title={title.title}
        >
          {showHistory ? (
            <HistoryScreen onClose={() => setShowHistory(false)} />
          ) : (
            <>
              {activeTab === "inventory" && (
                <InventoryScreen
                  showToast={showToast}
                  onOpenHistory={() => setShowHistory(true)}
                  onBulkIO={(items) => {
                    warehouseDispatch({
                      type: "PREFILL_ITEMS",
                      itemIds: items.map((i) => i.item_id),
                      qty: 1,
                    });
                    warehouseDispatch({ type: "GO", step: 0 });
                    changeTab("warehouse");
                    showToast({
                      type: "info",
                      message: `${items.length}건이 창고입출고에 추가되었습니다.`,
                    });
                  }}
                />
              )}
              {activeTab === "warehouse" && <WarehouseWizardScreen showToast={showToast} />}
              {activeTab === "dept" && <DeptWizardScreen showToast={showToast} />}
              {activeTab === "admin" && <AdminShell showToast={showToast} />}
            </>
          )}
        </MobileShell>
      </div>

      <Suspense>
        <DesktopLegacyShell />
      </Suspense>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
