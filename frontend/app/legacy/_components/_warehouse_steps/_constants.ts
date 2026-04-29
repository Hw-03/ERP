import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  PackageCheck,
  RotateCcw,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Department, Item } from "@/lib/api";

// ───────────────────────────── Types ─────────────────────────────

export type WorkType =
  | "raw-io"
  | "warehouse-io"
  | "dept-io"
  | "package-out"
  | "defective-register"
  | "supplier-return";
export type Direction = "in" | "out";
export type TransferDirection = "wh-to-dept" | "dept-to-wh";
export type DefectiveSource = "warehouse" | "production";

// ─────────────────────────── Constants ───────────────────────────

export const PAGE_SIZE = 100;

export const PROD_DEPTS: Department[] = ["조립", "고압", "진공", "튜닝", "튜브", "출하"];

export const WORK_TYPES: { id: WorkType; label: string; icon: LucideIcon; description: string }[] = [
  { id: "raw-io", label: "원자재 입출고", icon: Boxes, description: "창고 기준 입고/출고" },
  { id: "warehouse-io", label: "창고 이동", icon: ArrowLeftRight, description: "창고↔생산부서 이동" },
  { id: "dept-io", label: "부서 입출고", icon: Workflow, description: "생산부서 기준 입고/출고" },
  { id: "package-out", label: "패키지 출고", icon: PackageCheck, description: "등록된 묶음 출고" },
  { id: "defective-register", label: "불량 등록", icon: AlertTriangle, description: "불량 격리 처리" },
  { id: "supplier-return", label: "공급업체 반품", icon: RotateCcw, description: "공급업체 반품 처리" },
];

export const CAUTION_WORK_TYPES: WorkType[] = ["defective-register", "supplier-return"];

export const DEPT_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "창고", value: "창고" },
  { label: "튜브", value: "튜브" },
  { label: "고압", value: "고압" },
  { label: "진공", value: "진공" },
  { label: "튜닝", value: "튜닝" },
  { label: "조립", value: "조립" },
  { label: "출하", value: "출하" },
];

export const PROCESS_TYPE_LABEL: Record<string, string> = {
  TR: "튜브 원자재", TA: "튜브 조립체", TF: "튜브 F타입",
  HR: "고압 원자재", HA: "고압 조립체", HF: "고압 F타입",
  VR: "진공 원자재", VA: "진공 조립체", VF: "진공 F타입",
  NR: "튜닝 원자재", NA: "튜닝 조립체", NF: "튜닝 F타입",
  AR: "조립 원자재", AA: "조립 조립체", AF: "조립 F타입",
  PR: "출하 원자재", PA: "출하 조립체", PF: "출하 F타입",
};

// ─────────────────────────── Helpers ─────────────────────────────

export function matchesSearch(item: Item, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    item.erp_code,
    item.item_name,
    item.barcode ?? "",
    item.spec ?? "",
    item.legacy_model ?? "",
    item.legacy_part ?? "",
    item.location ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

export function workTypeNeedsDept(wt: WorkType): boolean {
  return (
    wt === "warehouse-io"
    || wt === "dept-io"
    || wt === "defective-register"
    || wt === "supplier-return"
  );
}
