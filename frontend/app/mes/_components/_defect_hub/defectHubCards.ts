// 불량 허브 3장 카드 메타 — DefectHubEntry·MobileDefectEntry가 공유 import
import { Archive, BarChart3, ListChecks, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// LEGACY_COLORS는 런타임에 쓰는 곳에서 import. 여기선 accent 키만 정의.

export type DefectHubCardId = "work" | "list" | "storage" | "statistics";

export interface DefectHubCard {
  id: DefectHubCardId;
  label: string;
  description: string;
  icon: LucideIcon;
  accentKey: "red" | "blue" | "purple" | "cyan"; // LEGACY_COLORS[accentKey]로 런타임에 resolve
}

export const DEFECT_HUB_CARDS: DefectHubCard[] = [
  {
    id: "work",
    label: "불량 처리",
    description: "품목을 격리하거나 바로 폐기·재작업합니다.",
    icon: ShieldAlert,
    accentKey: "red",
  },
  {
    id: "list",
    label: "격리 목록",
    description: "격리 항목을 조회하고 복귀·폐기·반품합니다.",
    icon: ListChecks,
    accentKey: "blue",
  },
  {
    id: "storage",
    label: "B급·구형 자재",
    description: "양품 재고에서 제외한 B급·구형 자재를 관리합니다.",
    icon: Archive,
    accentKey: "purple",
  },
  {
    id: "statistics",
    label: "불량 통계",
    description: "불량 발생을 주간·월간·연간으로 집계합니다.",
    icon: BarChart3,
    accentKey: "cyan",
  },
];
