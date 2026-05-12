import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  PackageCheck,
  RefreshCcw,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IoLine, IoSubType, IoWorkType } from "./types";

export const IO_WORK_TYPES: Array<{
  id: IoWorkType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "receive", label: "원자재 입고", description: "외부에서 들어온 품목 등록", icon: Boxes },
  { id: "warehouse_io", label: "창고입출고", description: "창고와 부서 사이 이동", icon: ArrowLeftRight },
  { id: "process", label: "공정처리", description: "생산, 조립, 분해, 보정", icon: Wrench },
  { id: "ship", label: "출하", description: "출하부 재고 차감", icon: PackageCheck },
  { id: "defect", label: "불량", description: "정상 재고를 불량으로 격리", icon: AlertTriangle },
];

const SHIP_ALLOWED_NAMES = ["김건호", "김현우", "남재원", "김민재", "이형진", "이필욱"];

export function canSeeWorkType(
  workType: IoWorkType,
  operator: { warehouse_role?: string | null; name?: string | null } | null | undefined,
): boolean {
  if (workType === "receive") {
    // 원자재 입고는 창고 정/부 만
    return operator?.warehouse_role === "primary" || operator?.warehouse_role === "deputy";
  }
  if (workType === "ship") {
    // 출하는 지정된 직원 6명만
    return !!operator?.name && SHIP_ALLOWED_NAMES.includes(operator.name);
  }
  return true;
}

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
    { id: "produce", label: "생산", description: "하위 자재 출고 + 결과 품목 입고" },
    { id: "disassemble", label: "분해", description: "상위 품목 출고 + 회수 품목 입고" },
    { id: "adjust_in", label: "수량보정 입고", description: "선택 품목 수량 증가" },
    { id: "adjust_out", label: "수량보정 출고", description: "선택 품목 수량 감소" },
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
    "adjust_in",
    "adjust_out",
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

export type ItemActionMode = "bom_or_single" | "single_only";

// BOM 자동 전개 대상이면 "BOM 적용"/"이 품목만" 2버튼, 그 외는 "선택" 1버튼.
// backend _direct_item_bundle 의 BOM 확장 화이트리스트와 일치.
export function getItemActionMode(subType: IoSubType): ItemActionMode {
  if (
    subType === "warehouse_to_dept" ||
    subType === "dept_to_warehouse" ||
    subType === "produce" ||
    subType === "disassemble"
  ) {
    return "bom_or_single";
  }
  return "single_only";
}

export type LineTagTone = "green" | "red" | "blue" | "purple" | "muted";

// 라인의 sub_type/origin/direction 조합으로 현장 친화 태그 결정.
// IoLineRow / IoBundleCard 표시용.
export function lineTagLabel(line: IoLine, subType: IoSubType): { text: string; tone: LineTagTone } {
  if (line.origin === "manual") return { text: "이 품목만", tone: "muted" };
  if (line.origin === "package_auto") return { text: "패키지 자동", tone: "purple" };
  if (subType === "produce") {
    if (line.origin === "direct") return { text: "생산 결과품", tone: "green" };
    if (line.origin === "bom_auto") return { text: "투입 자재", tone: "red" };
  }
  if (subType === "disassemble") {
    if (line.origin === "direct") return { text: "분해 대상", tone: "red" };
    if (line.origin === "bom_auto") return { text: "회수 품목", tone: "green" };
  }
  if (subType === "warehouse_to_dept" || subType === "dept_to_warehouse") {
    if (line.origin === "direct") return { text: "상위", tone: "blue" };
    if (line.origin === "bom_auto") return { text: "하위", tone: "muted" };
  }
  if (subType === "ship") return { text: "패키지 항목", tone: "purple" };
  return { text: "직접 선택", tone: "blue" };
}

export { RefreshCcw };
