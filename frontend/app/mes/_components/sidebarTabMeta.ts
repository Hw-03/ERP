import type { ElementType } from "react";
import { AlertTriangle, BarChart2, Boxes, ClipboardList, History, MapPinned, Settings2, Truck, Warehouse } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { DesktopTabId, SidebarTabId } from "./tabAccess";

export type TabDef = { id: DesktopTabId; label: string; subtitle: string; icon: ElementType; color: string };

export const DESKTOP_TAB_ICON_COLORS: Record<DesktopTabId, string> = {
  dashboard: LEGACY_COLORS.blue,
  warehouse: LEGACY_COLORS.green,
  shipping: LEGACY_COLORS.cyan,
  warehouseMap: LEGACY_COLORS.cyan,
  defect: LEGACY_COLORS.red,
  history: LEGACY_COLORS.purple,
  dailyReport: LEGACY_COLORS.blue,
  weekly: LEGACY_COLORS.yellow,
  admin: LEGACY_COLORS.muted2,
  settings: LEGACY_COLORS.cyan,
  stocktake: LEGACY_COLORS.green,
};
// 사이드바 탭 아이콘은 탭별 고유 색상을 사용한다. 선택 상태는 기존 blue 배경과 white 아이콘을 유지한다.
export const MAIN_TABS: TabDef[] = [
  { id: "dashboard", label: "대시보드", subtitle: "현황과 안전재고 확인", icon: Boxes, color: DESKTOP_TAB_ICON_COLORS.dashboard },
  { id: "stocktake", label: "재고 전수조사", subtitle: "실수량 확인과 재고 반영", icon: ClipboardList, color: DESKTOP_TAB_ICON_COLORS.stocktake },
  { id: "warehouse", label: "입출고", subtitle: "입고와 출고 작업 처리", icon: Warehouse, color: DESKTOP_TAB_ICON_COLORS.warehouse },
  { id: "history", label: "입출고 내역", subtitle: "입출고 이력 조회", icon: History, color: DESKTOP_TAB_ICON_COLORS.history },
  { id: "shipping", label: "출하", subtitle: "요청·준비·픽업 완료", icon: Truck, color: DESKTOP_TAB_ICON_COLORS.shipping },
  { id: "defect", label: "불량", subtitle: "격리·폐기·반품 처리", icon: AlertTriangle, color: DESKTOP_TAB_ICON_COLORS.defect },
  { id: "warehouseMap", label: "창고 지도", subtitle: "위치별 재고 한눈에", icon: MapPinned, color: DESKTOP_TAB_ICON_COLORS.warehouseMap },
  { id: "weekly", label: "주간보고", subtitle: "생산·재고 흐름", icon: BarChart2, color: DESKTOP_TAB_ICON_COLORS.weekly },
  { id: "dailyReport", label: "일일 작업 일보", subtitle: "작업 내역과 MES 거래", icon: ClipboardList, color: DESKTOP_TAB_ICON_COLORS.dailyReport },
];

export const SIDEBAR_TAB_META = Object.fromEntries([
  ...MAIN_TABS,
  { id: "admin", label: "관리자", subtitle: "직원과 기준 정보 관리", icon: Settings2, color: DESKTOP_TAB_ICON_COLORS.admin },
].map((tab) => [tab.id, tab])) as Record<SidebarTabId, TabDef>;
