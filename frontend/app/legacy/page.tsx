"use client";

import { useCallback, useMemo, useState } from "react";
import { LegacyLayout, type TabId } from "./_components/LegacyLayout";
import { Toast, type ToastState } from "./_components/Toast";
import { InventoryTab } from "./_components/InventoryTab";
import { WarehouseIOTab } from "./_components/WarehouseIOTab";
import { DeptIOTab } from "./_components/DeptIOTab";
import { HistoryTab } from "./_components/HistoryTab";
import { AdminTab } from "./_components/AdminTab";

const TAB_TITLES: Record<TabId, { subtitle: string; title: string }> = {
  inventory: { subtitle: "Inventory", title: "재고 관리" },
  warehouse: { subtitle: "Warehouse", title: "창고 입출고" },
  dept: { subtitle: "Department", title: "부서 입출고" },
  admin: { subtitle: "Admin", title: "관리자" },
};

export default function LegacyPage() {
  const [activeTab, setActiveTab] = useState<TabId>("warehouse");
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((next: ToastState) => setToast(next), []);
  const clearToast = useCallback(() => setToast(null), []);

  const title = useMemo(() => {
    if (showHistory) {
      return { subtitle: "History", title: "입출고 내역" };
    }
    return TAB_TITLES[activeTab];
  }, [activeTab, showHistory]);

  return (
    <>
      <LegacyLayout
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setShowHistory(false);
        }}
        subtitle={title.subtitle}
        title={title.title}
      >
        {showHistory ? (
          <HistoryTab onClose={() => setShowHistory(false)} />
        ) : (
          <>
            {activeTab === "inventory" && (
              <InventoryTab showToast={showToast} onOpenHistory={() => setShowHistory(true)} />
            )}
            {activeTab === "warehouse" && (
              <WarehouseIOTab showToast={showToast} onOpenHistory={() => setShowHistory(true)} />
            )}
            {activeTab === "dept" && (
              <DeptIOTab showToast={showToast} onOpenHistory={() => setShowHistory(true)} />
            )}
            {activeTab === "admin" && <AdminTab showToast={showToast} />}
          </>
        )}
      </LegacyLayout>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
