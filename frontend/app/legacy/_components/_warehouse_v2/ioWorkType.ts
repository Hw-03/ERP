import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  RefreshCcw,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";

const MANUAL_ORIGINS = new Set(["manual", "adjust_in", "adjust_out"]);

export const IO_WORK_TYPES: Array<{
  id: IoWorkType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "receive", label: "원자재 입고", description: "발주 품목 입고", icon: Boxes },
  { id: "warehouse_io", label: "창고 입출고", description: "창고↔부서", icon: ArrowLeftRight },
  { id: "process", label: "부서 입출고", description: "부서 내 작업", icon: Wrench },
  { id: "defect", label: "불량", description: "불량 재고 격리", icon: AlertTriangle },
];

export function canSeeWorkType(
  workType: IoWorkType,
  operator: { warehouse_role?: string | null; name?: string | null } | null | undefined,
): boolean {
  if (workType === "receive") {
    // 원자재 입고는 창고 정/부 만
    return operator?.warehouse_role === "primary" || operator?.warehouse_role === "deputy";
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
  defect: [
    { id: "defect_quarantine", label: "새 격리", description: "정상 재고를 격리 처리 (창고 승인)" },
    { id: "defect_restore",    label: "격리 해제", description: "격리 재고를 정상 복귀 (즉시)" },
    { id: "defect_process",    label: "격리 처리", description: "격리 재고 폐기·재작업 (창고 승인)" },
    { id: "supplier_return",   label: "원자재 반품", description: "격리 재고를 공급처에 반품 (창고 승인)" },
  ],
};

export const DEFAULT_SUB_TYPE: Record<IoWorkType, IoSubType> = {
  receive: "receive_supplier",
  warehouse_io: "warehouse_to_dept",
  process: "produce",
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
    "defect_restore",
    "defect_process",
  ].includes(subType);
}

export function requiresApproval(subType: IoSubType) {
  return ["warehouse_to_dept", "dept_to_warehouse", "defect_quarantine", "supplier_return", "defect_process"].includes(subType);
}

/** 백엔드 MANUAL_LINE_ORIGINS 와 동기 — 1라인이라도 낱개면 부서 결재 필요. */
export function hasManualLine(bundles: IoBundle[]): boolean {
  for (const bundle of bundles) {
    for (const line of bundle.lines ?? []) {
      if (!line.included) continue;
      if (MANUAL_ORIGINS.has(line.origin)) return true;
    }
  }
  return false;
}

export type ApprovalKind = "none" | "warehouse" | "department";

/** subType + 라인 origin 으로 결재 종류 판정.
 *  새 정책: 모든 요청은 창고 또는 부서 중 하나로만 결재 (동시 결재 금지).
 *  - warehouse: warehouse_to_dept/dept_to_warehouse/defect_quarantine (manual line 섞여도 창고 승인 1회로만)
 *  - department: manual_adjustment 등 낱개 라인 단독
 *  - none: 즉시 반영
 */
export function approvalKind(subType: IoSubType, bundles: IoBundle[]): ApprovalKind {
  if (requiresApproval(subType)) return "warehouse";
  if (hasManualLine(bundles)) return "department";
  return "none";
}

// BOM 강제 모드: 부서 입출고 BOM(produce/disassemble) 에서만 하위 라인 잠금 (체크/수량 편집 차단).
// 창고 입출고(warehouse_to_dept/dept_to_warehouse) 는 묶음 선택 후 내부 자유 편집 허용.
export function isBomForced(subType: IoSubType) {
  return subType === "produce" || subType === "disassemble";
}

export type DeptIoDirection = "in" | "out";

// (방향, 액션) → sub_type 매핑. process workType 한정.
export function deptIoSubType(direction: DeptIoDirection, mode: "bom" | "single"): IoSubType {
  if (direction === "in") return mode === "bom" ? "produce" : "adjust_in";
  return mode === "bom" ? "disassemble" : "adjust_out";
}

// sub_type → 방향 (draft 복원·표시용)
export function deptIoDirectionOf(subType: IoSubType): DeptIoDirection | null {
  if (subType === "produce" || subType === "adjust_in") return "in";
  if (subType === "disassemble" || subType === "adjust_out") return "out";
  return null;
}

// Step 3 picker 타이틀의 입/출 접두 ("입고 품목 선택" / "출고 품목 선택").
// subType이 입고 성격이면 "입고", 그 외는 모두 "출고".
export function pickerDirectionLabel(subType: IoSubType): "입고" | "출고" {
  if (
    subType === "receive_supplier" ||
    subType === "warehouse_to_dept" ||
    subType === "produce" ||
    subType === "adjust_in"
  ) return "입고";
  return "출고";
}

// sub_type → 사용자 화면 표시 라벨 (process workType 한정)
export function deptIoDisplayLabel(subType: IoSubType): string | null {
  if (subType === "produce") return "입고 · BOM";
  if (subType === "disassemble") return "출고 · BOM";
  if (subType === "adjust_in") return "입고 · 낱개";
  if (subType === "adjust_out") return "출고 · 낱개";
  return null;
}

// Step 3 picker 의 대상 부서 결정 — sub_type 으로 어느 부서(출발/도착/없음) 가
// picker 정렬·필터 기준이 되는지. IoComposeView Step 3 targetDepartment 단일 소스.
export function targetDepartmentOf(
  subType: IoSubType,
  fromDepartment: string,
  toDepartment: string,
): string | null {
  // 출발 부서가 대상인 작업
  if (subType === "dept_to_warehouse" || subType === "defect_quarantine" || subType === "supplier_return" || subType === "defect_restore" || subType === "defect_process") {
    return fromDepartment;
  }
  // 부서 무관 작업
  if (subType === "receive_supplier") return null;
  // 그 외 (warehouse_to_dept, produce, disassemble, adjust_in/out, dept_transfer) — toDepartment
  return toDepartment;
}

// process workType 방향(in/out/null) → 사용자 표시 단어. Step 2 요약 표기 단일 소스.
export function directionWord(dir: DeptIoDirection | null): "입고" | "출고" | "미선택" {
  return dir === "in" ? "입고" : dir === "out" ? "출고" : "미선택";
}

// sub_type → Step 2 에서 노출할 부서 grid (출발/도착). IoSubTypeStep 단일 소스.
export function deptVisibility(subType: IoSubType): { from: boolean; to: boolean } {
  if (subType === "warehouse_to_dept") return { from: false, to: true };
  if (subType === "dept_to_warehouse") return { from: true, to: false };
  if (subType === "defect_quarantine" || subType === "supplier_return" || subType === "defect_restore" || subType === "defect_process")
    return { from: true, to: false };
  if (subType === "dept_transfer") return { from: true, to: true };
  if (
    subType === "produce" ||
    subType === "disassemble" ||
    subType === "adjust_in" ||
    subType === "adjust_out"
  )
    return { from: false, to: true };
  return { from: false, to: false };
}

// 라인 제외(체크 해제) 시 exclusion_note 문구. IoBundleCart onToggleLine 단일 소스.
export function exclusionNoteFor(
  subType: IoSubType,
  lineOrigin: IoLine["origin"],
  nowIncluded: boolean,
): string | null {
  if (nowIncluded) return null;
  return subType === "disassemble" && lineOrigin === "bom_auto" ? "회수 안 됨" : "이번 작업 제외";
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
  if (subType === "adjust_in" && (line.origin === "direct" || line.origin === "manual")) {
    return { text: "단품 입고", tone: "muted" };
  }
  if (subType === "adjust_out" && (line.origin === "direct" || line.origin === "manual")) {
    return { text: "단품 출고", tone: "muted" };
  }
  if (line.origin === "manual") return { text: "이 품목만", tone: "muted" };
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
  return { text: "직접 선택", tone: "blue" };
}

/** workType 이 출고/비가역 계열이면 true — Step 1 카드 accent 색 결정에 사용. */
export function isExitWorkType(workType: IoWorkType): boolean {
  return workType === "defect";
}

/** defect workType에서 격리(DEFECTIVE) 재고를 소스로 쓰는 서브타입인지 판별. */
export function isDefectInventorySubType(subType: IoSubType): boolean {
  return subType === "defect_restore" || subType === "defect_process" || subType === "supplier_return";
}

export { RefreshCcw };
