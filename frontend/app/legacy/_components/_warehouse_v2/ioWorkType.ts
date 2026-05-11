import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  PackageCheck,
  RefreshCcw,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IoSubType, IoWorkType } from "./types";

export const IO_WORK_TYPES: Array<{
  id: IoWorkType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "receive", label: "입고", description: "외부에서 들어온 품목 등록", icon: Boxes },
  { id: "warehouse_io", label: "창고입출고", description: "창고와 부서 사이 이동", icon: ArrowLeftRight },
  { id: "process", label: "공정처리", description: "생산, 조립, 분해, 보정", icon: Wrench },
  { id: "ship", label: "출하", description: "출하부 재고 차감", icon: PackageCheck },
  { id: "defect", label: "불량", description: "정상 재고를 불량으로 격리", icon: AlertTriangle },
];

export const IO_SUB_TYPES: Record<
  IoWorkType,
  Array<{ id: IoSubType; label: string; description: string }>
> = {
  receive: [
    { id: "receive_supplier", label: "외부 입고", description: "선택 품목을 창고 재고로 증가" },
  ],
  warehouse_io: [
    { id: "warehouse_to_dept", label: "창고 → 부서", description: "BOM 1단계 하위 품목 자동 포함" },
    { id: "dept_to_warehouse", label: "부서 → 창고", description: "반납할 하위 품목만 체크" },
  ],
  process: [
    { id: "produce", label: "생산/조립", description: "하위 품목 출고 + 결과 품목 입고" },
    { id: "disassemble", label: "분해/회수", description: "대상 품목 출고 + 회수 품목 입고" },
    { id: "dept_transfer", label: "부서간 이동", description: "부서 A에서 부서 B로 이동" },
    { id: "adjust", label: "수량 보정", description: "실사 차이를 부서 재고에 반영" },
  ],
  ship: [
    { id: "ship", label: "출하", description: "패키지 또는 단품을 출하부에서 차감" },
  ],
  defect: [
    { id: "defect_quarantine", label: "불량 격리", description: "창고 승인 요청으로 격리" },
    { id: "supplier_return", label: "공급처 반품", description: "불량 재고를 반품 처리" },
  ],
};

export const DEFAULT_SUB_TYPE: Record<IoWorkType, IoSubType> = {
  receive: "receive_supplier",
  warehouse_io: "warehouse_to_dept",
  process: "produce",
  ship: "ship",
  defect: "defect_quarantine",
};

export const DEPARTMENT_OPTIONS = ["조립", "고압", "진공", "튜닝", "튜브", "출하", "AS"];

export function subTypeLabel(subType: IoSubType) {
  for (const rows of Object.values(IO_SUB_TYPES)) {
    const found = rows.find((row) => row.id === subType);
    if (found) return found.label;
  }
  return subType;
}

export function requiresDepartments(subType: IoSubType) {
  return [
    "warehouse_to_dept",
    "dept_to_warehouse",
    "produce",
    "disassemble",
    "dept_transfer",
    "adjust",
    "defect_quarantine",
    "supplier_return",
  ].includes(subType);
}

export function requiresApproval(subType: IoSubType) {
  return ["warehouse_to_dept", "dept_to_warehouse", "defect_quarantine"].includes(subType);
}

export function canPickPackages(workType: IoWorkType) {
  return workType === "ship";
}

export { RefreshCcw };
