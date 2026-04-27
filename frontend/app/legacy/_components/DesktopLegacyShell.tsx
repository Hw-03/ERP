"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { Boxes, History, Settings2, Warehouse } from "lucide-react";
import { DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar } from "./DesktopTopbar";
import { DesktopInventoryView } from "./DesktopInventoryView";
import { DesktopWarehouseView } from "./DesktopWarehouseView";
import { DesktopAdminView } from "./DesktopAdminView";
import { DesktopHistoryView } from "./DesktopHistoryView";
import { LEGACY_COLORS, formatNumber } from "./legacyUi";
import { api, type ProductionCapacity } from "@/lib/api";
import type { Item } from "@/lib/api";

const TAB_META: Record<DesktopTabId, { title: string; icon: ElementType }> = {
  inventory: { title: "대시보드", icon: Boxes },
  warehouse: { title: "입출고", icon: Warehouse },
  history: { title: "입출고 내역", icon: History },
  admin: { title: "관리자", icon: Settings2 },
};

export function DesktopLegacyShell() {
  const [activeTab, setActiveTab] = useState<DesktopTabId>("inventory");
  const [status, setStatus] = useState("데스크톱 ERP 화면을 준비했습니다.");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [warehousePreselected, setWarehousePreselected] = useState<Item | null>(null);
  const [capacityData, setCapacityData] = useState<ProductionCapacity | null>(null);
  const [capacityModal, setCapacityModal] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<{ low: number; zero: number } | null>(null);

  const loadCapacity = useCallback(() => {
    void api.getProductionCapacity().then(setCapacityData).catch(() => {});
  }, []);

  useEffect(() => {
    loadCapacity();
  }, [loadCapacity]);

  const activeMeta = TAB_META[activeTab];

  const handleGoToWarehouse = useCallback((item: Item) => {
    setWarehousePreselected(item);
    setActiveTab("warehouse");
  }, []);

  const content = useMemo(() => {
    const key = `${activeTab}-${refreshNonce}`;
    if (activeTab === "inventory") {
      return (
        <DesktopInventoryView
          key={key}
          globalSearch=""
          onStatusChange={setStatus}
          onGoToWarehouse={handleGoToWarehouse}
          onGoToWarehouseTab={() => setActiveTab("warehouse")}
          onSummaryChange={setStockWarnings}
          capacityData={capacityData}
          onCapacityClick={() => setCapacityModal(true)}
        />
      );
    }
    if (activeTab === "warehouse") {
      return (
        <DesktopWarehouseView
          key={key}
          globalSearch=""
          onStatusChange={setStatus}
          preselectedItem={warehousePreselected}
          onSubmitSuccess={loadCapacity}
        />
      );
    }
    if (activeTab === "history") {
      return <DesktopHistoryView key={key} />;
    }
    return <DesktopAdminView key={key} globalSearch="" onStatusChange={setStatus} />;
  }, [activeTab, refreshNonce, warehousePreselected, handleGoToWarehouse, capacityData, loadCapacity]);

  return (
    <>
      {capacityModal && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,.55)" }}
          onClick={() => setCapacityModal(false)}
        >
          <div
            className="w-full max-w-[520px] rounded-[28px] border p-7"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-base font-black" style={{ color: LEGACY_COLORS.text }}>
              생산 가능수량 상세
            </div>
            {capacityData && capacityData.top_items.length > 0 ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-[18px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                      즉시 생산 가능
                    </div>
                    <div className="mt-1 text-[22px] font-black" style={{ color: LEGACY_COLORS.cyan }}>
                      {formatNumber(capacityData.immediate)}
                    </div>
                  </div>
                  <div className="rounded-[18px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                      최대 생산 가능
                    </div>
                    <div className="mt-1 text-[22px] font-black" style={{ color: LEGACY_COLORS.blue }}>
                      {formatNumber(capacityData.maximum)}
                    </div>
                  </div>
                </div>
                {capacityData.limiting_item && (
                  <div
                    className="mb-4 rounded-[14px] border px-4 py-3 text-sm"
                    style={{ background: "rgba(255,136,0,.08)", borderColor: "rgba(255,136,0,.25)", color: LEGACY_COLORS.yellow }}
                  >
                    병목 부품: <span className="font-bold">{capacityData.limiting_item}</span>
                  </div>
                )}
                <div className="max-h-52 overflow-y-auto rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
                  <div
                    className="grid grid-cols-[1fr_80px_80px] border-b px-4 py-2 text-sm font-bold uppercase tracking-[0.15em]"
                    style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                  >
                    <span>품목</span>
                    <span className="text-right">즉시</span>
                    <span className="text-right">최대</span>
                  </div>
                  {capacityData.top_items.map((item, i) => (
                    <div
                      key={item.item_id}
                      className="grid grid-cols-[1fr_80px_80px] items-center px-4 py-2.5"
                      style={{ borderBottom: i === capacityData.top_items.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
                    >
                      <div>
                        <div className="truncate text-sm" style={{ color: LEGACY_COLORS.text }}>{item.item_name}</div>
                        <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
                      </div>
                      <div className="text-right text-sm font-bold" style={{ color: LEGACY_COLORS.cyan }}>
                        {formatNumber(item.immediate)}
                      </div>
                      <div className="text-right text-sm" style={{ color: LEGACY_COLORS.blue }}>
                        {formatNumber(item.maximum)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mb-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                {capacityData == null ? "데이터를 불러오는 중…" : "BOM이 등록된 품목이 없습니다."}
              </div>
            )}
            <button
              className="mt-5 w-full rounded-[18px] border py-3 text-base font-semibold"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
              onClick={() => setCapacityModal(false)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
      <div className="hidden h-screen overflow-hidden lg:flex">
      <div className="flex h-full w-full gap-3 px-3 py-3" style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}>
        <DesktopSidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            localStorage.setItem("desktop-active-tab", tab);
            setActiveTab(tab);
          }}
          alertCount={{ inventory: stockWarnings ? stockWarnings.zero + stockWarnings.low : 0 }}
        />

        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <DesktopTopbar
            title={activeMeta.title}
            icon={activeMeta.icon}
            onRefresh={() => {
              setRefreshNonce((current) => current + 1);
              loadCapacity();
            }}
            status={status}
          />

          <div className="mt-1 min-h-0 flex-1 overflow-hidden flex">{content}</div>
        </div>
      </div>
    </div>
    </>
  );
}
