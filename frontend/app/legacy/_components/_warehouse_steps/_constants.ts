import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Department, DepartmentRole, EmployeeLevel, Item, WarehouseRole } from "@/lib/api";

// ───────────────────────────── Types ─────────────────────────────

export type WorkType =
  | "raw-io"
  | "warehouse-io"
  | "dept-adjustment"
  | "defective-register";
export type Direction = "in" | "out" | "return";
export type TransferDirection = "wh-to-dept" | "dept-to-wh";
export type DefectiveSource = "warehouse" | "production";

type OperatorLike =
  | {
      warehouse_role: WarehouseRole;
      department_role?: DepartmentRole;
      level?: EmployeeLevel;
      department: Department;
    }
  | null
  | undefined;

// ─────────────────────────── Constants ───────────────────────────

export const PAGE_SIZE = 100;

export const PROD_DEPTS: Department[] = ["튜브", "고압", "진공", "튜닝", "조립", "출하"];

export const WORK_TYPES: { id: WorkType; label: string; icon: LucideIcon; description: string }[] = [
  { id: "raw-io",            label: "공급업체 입출고",  icon: Boxes,         description: "창고 입고 · 출고 · 공급업체 반품" },
  { id: "warehouse-io",      label: "창고 ↔ 부서 이동", icon: ArrowLeftRight, description: "창고↔생산부서 이동" },
  { id: "dept-adjustment",   label: "부서 재고 조정",   icon: Workflow,      description: "생산/분해/수량 보정" },
  { id: "defective-register",label: "불량 격리",        icon: AlertTriangle, description: "불량 격리 처리" },
];

export const CAUTION_WORK_TYPES: WorkType[] = ["defective-register"];

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

// 작업자 소속 부서를 PROD 영역 맨 앞으로 끌어올린 부서 옵션. ALL/창고 는 항상 상단 유지.
// PROD_DEPTS 에 없는 부서는 입력되어도 무시 (기본 순서 반환).
export function getDeptOptionsForOperator(operatorDept?: string | null) {
  if (!operatorDept || !PROD_DEPTS.includes(operatorDept as Department)) return DEPT_OPTIONS;
  const head = [
    { label: "전체", value: "ALL" },
    { label: "창고", value: "창고" },
    { label: operatorDept, value: operatorDept },
  ];
  const rest = PROD_DEPTS
    .filter((d) => d !== operatorDept)
    .map((d) => ({ label: d, value: d }));
  return [...head, ...rest];
}

export const PROCESS_TYPE_LABEL: Record<string, string> = {
  TR: "튜브 원자재", TA: "튜브 중간공정", TF: "튜브 공정완료",
  HR: "고압 원자재", HA: "고압 중간공정", HF: "고압 공정완료",
  VR: "진공 원자재", VA: "진공 중간공정", VF: "진공 공정완료",
  NR: "튜닝 원자재", NA: "튜닝 중간공정", NF: "튜닝 공정완료",
  AR: "조립 원자재", AA: "조립 중간공정", AF: "조립 공정완료",
  PR: "출하 원자재", PA: "출하 중간공정", PF: "출하 공정완료",
};

// ─────────────────────────── Helpers ─────────────────────────────

export function matchesSearch(item: Item, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    item.item_code,
    item.item_name,
    item.legacy_part ?? "",
    item.location ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

export function workTypeNeedsDept(wt: WorkType): boolean {
  return wt === "warehouse-io" || wt === "defective-register" || wt === "dept-adjustment";
}

// ───────────── Operator → 작업유형 가시성 매트릭스 ─────────────

export function isWarehouseStaff(op: OperatorLike): boolean {
  return op?.warehouse_role === "primary" || op?.warehouse_role === "deputy";
}

export function isDepartmentApprover(op: OperatorLike): boolean {
  if (!op) return false;
  if (op.level === "admin") return true;
  return op.department_role === "primary" || op.department_role === "deputy";
}

export function canEnterIO(op: OperatorLike): boolean {
  if (!op) return false;
  if (isWarehouseStaff(op)) return true;
  return PROD_DEPTS.includes(op.department);
}

export function workTypesForOperator(op: OperatorLike): WorkType[] {
  if (!op) return [];
  if (isWarehouseStaff(op)) {
    return ["raw-io", "warehouse-io", "dept-adjustment", "defective-register"];
  }
  if (PROD_DEPTS.includes(op.department)) {
    return ["warehouse-io", "dept-adjustment", "defective-register"];
  }
  return [];
}
