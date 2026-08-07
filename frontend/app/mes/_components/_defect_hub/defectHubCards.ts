// 불량 허브 3장 카드 메타 — DefectHubEntry·MobileDefectEntry가 공유 import
import { ShieldAlert, Trash2, ListChecks } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// LEGACY_COLORS는 런타임에 쓰는 곳에서 import. 여기선 accent 키만 정의.

export type DefectHubCardId = "quarantine" | "scrap" | "list";

export interface DefectHubCard {
  id: DefectHubCardId;
  label: string;
  description: string;
  icon: LucideIcon;
  accentKey: "red" | "blue"; // LEGACY_COLORS[accentKey]로 런타임에 resolve
}

export const DEFECT_HUB_CARDS: DefectHubCard[] = [
  {
    id: "quarantine",
    label: "불량 격리",
    description: "정상 재고에서 품목을 골라 격리 등록합니다.",
    icon: ShieldAlert,
    accentKey: "red",
  },
  {
    id: "scrap",
    label: "바로 처리",
    description: "격리 없이 폐기 또는 재작업을 처리합니다.",
    icon: Trash2,
    accentKey: "red",
  },
  {
    id: "list",
    label: "격리 목록",
    description: "격리 항목을 조회하고 복귀·폐기·반품합니다.",
    icon: ListChecks,
    accentKey: "blue",
  },
];
