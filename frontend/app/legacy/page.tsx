"use client";

import { useCallback, useState } from "react";
import { LegacyLayout, type TabId } from "./_components/LegacyLayout";
import { Toast, type ToastState } from "./_components/Toast";
import { InventoryTab } from "./_components/InventoryTab";
import { WarehouseIOTab } from "./_components/WarehouseIOTab";
import { DeptIOTab } from "./_components/DeptIOTab";
import { HistoryTab } from "./_components/HistoryTab";
import { AdminTab } from "./_components/AdminTab";

export default function LegacyPage() {
  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((t: ToastState) => {
    setToast(t);
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  return (
    <>
      <LegacyLayout activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === "inventory" && <InventoryTab showToast={showToast} />}
        {activeTab === "warehouse" && <WarehouseIOTab showToast={showToast} />}
        {activeTab === "dept" && <DeptIOTab showToast={showToast} />}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "admin" && <AdminTab showToast={showToast} />}
      </LegacyLayout>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
