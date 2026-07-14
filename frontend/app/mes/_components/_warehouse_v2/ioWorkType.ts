import {
  ArrowLeftRight,
  Boxes,
  PackageMinus,
  RefreshCcw,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IoBundle, IoEntryIntent, IoLine, IoSubType, IoWorkType } from "./types";
import {
  SUB_TYPE_DESCRIPTION,
  SUB_TYPE_LABEL,
  WORK_TYPE_DESCRIPTION,
  WORK_TYPE_LABEL,
} from "@/lib/io/glossary";

const MANUAL_ORIGINS = new Set(["manual", "adjust_in", "adjust_out"]);

export const IO_WORK_TYPES: Array<{
  id: IoWorkType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "receive", label: WORK_TYPE_LABEL.receive, description: WORK_TYPE_DESCRIPTION.receive, icon: Boxes },
  { id: "warehouse_io", label: WORK_TYPE_LABEL.warehouse_io, description: WORK_TYPE_DESCRIPTION.warehouse_io, icon: ArrowLeftRight },
  { id: "process", label: WORK_TYPE_LABEL.process, description: WORK_TYPE_DESCRIPTION.process, icon: Wrench },
  { id: "internal_use", label: WORK_TYPE_LABEL.internal_use, description: WORK_TYPE_DESCRIPTION.internal_use, icon: PackageMinus },
  // 불량(defect) 워크타입은 별도 최상위 "불량" 탭으로 분리됨 — 입출고 메뉴에서 제외.
  // (IoWorkType 유니온과 glossary/helper 의 defect 분기는 입출고 내역·타입 보존 위해 그대로 둔다.)
];

export function canSeeWorkType(
  workType: IoWorkType,
  operator: { warehouse_role?: string | null; name?: string | null; department?: string | null } | null | undefined,
): boolean {
  if (workType === "receive") {
    // 원자재 입고는 창고 정/부 만
    return operator?.warehouse_role === "primary" || operator?.warehouse_role === "deputy";
  }
  if (workType === "internal_use") {
    return operator?.department === "AS"
      || operator?.department === "연구"
      || operator?.warehouse_role === "primary"
      || operator?.warehouse_role === "deputy";
  }
  return true;
}

const _row = (id: IoSubType) => ({
  id,
  label: SUB_TYPE_LABEL[id],
  description: SUB_TYPE_DESCRIPTION[id],
});

export const IO_SUB_TYPES: Record<
  IoWorkType,
  Array<{ id: IoSubType; label: string; description: string }>
> = {
  receive: [_row("receive_supplier")],
  warehouse_io: [_row("warehouse_to_dept"), _row("dept_to_warehouse")],
  process: [_row("produce"), _row("disassemble"), _row("adjust_in"), _row("adjust_out")],
  defect: [
    _row("defect_quarantine"),
    _row("defect_restore"),
    _row("defect_process"),
    _row("supplier_return"),
  ],
  internal_use: [_row("internal_use_out")],
};

export const DEFAULT_SUB_TYPE: Record<IoWorkType, IoSubType> = {
  receive: "receive_supplier",
  warehouse_io: "warehouse_to_dept",
  process: "produce",
  defect: "defect_quarantine",
  internal_use: "internal_use_out",
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
    "internal_use_out",
  ].includes(subType);
}

export function requiresApproval(subType: IoSubType) {
  return ["warehouse_to_dept", "dept_to_warehouse", "internal_use_out"].includes(subType);
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
 *  - warehouse: warehouse_to_dept/dept_to_warehouse/internal_use_out (manual line 섞여도 창고 승인 1회로만)
 *  - department: manual_adjustment 등 낱개 라인 단독
 *  - none: 즉시 반영
 */
const _DEFECT_SUB_TYPES: IoSubType[] = [
  "defect_quarantine", "defect_restore", "defect_process", "supplier_return",
];

export function approvalKind(
  subType: IoSubType,
  bundles: IoBundle[],
  fromDepartment?: string | null,
): ApprovalKind {
  if (requiresApproval(subType)) {
    return "warehouse";
  }
  // 불량 관련 작업은 항상 즉시 처리 — manual line 여부 무관하게 "none".
  if (_DEFECT_SUB_TYPES.includes(subType)) return "none";
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

// Step 3 picker 타이틀 접두. 창고 방향이 명확한 sub_type은 "창고 반출/반입", 그 외 "입고/출고".
export function pickerDirectionLabel(subType: IoSubType): "입고" | "출고" | "창고 반출" | "창고 반입" | "사용출고" {
  if (subType === "internal_use_out") return "사용출고";
  if (subType === "warehouse_to_dept") return "창고 반출";
  if (subType === "dept_to_warehouse") return "창고 반입";
  if (subType === "receive_supplier" || subType === "produce" || subType === "adjust_in") return "입고";
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
  if (subType === "internal_use_out") return toDepartment;
  // 그 외 (warehouse_to_dept, produce, disassemble, adjust_in/out, dept_transfer) — toDepartment
  return toDepartment;
}

// process workType 방향(in/out/null) → 사용자 표시 단어. Step 2 요약 표기 단일 소스.
export function directionWord(dir: DeptIoDirection | null): "입고" | "출고" | "미선택" {
  return dir === "in" ? "입고" : dir === "out" ? "출고" : "미선택";
}

// sub_type → Step 2 에서 노출할 부서 grid (출발/도착). IoSubTypeStep 단일 소스.
export function deptVisibility(subType: IoSubType): { from: boolean; to: boolean } {
  if (subType === "internal_use_out") return { from: false, to: true };
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

/** 단품 부서 입출고(낱개 입고/출고) — 모바일에서 5단계 위저드 대신 인라인 빠른 폼으로 분기.
 *  adjust 는 getItemActionMode === "single_only" 라 BOM 전개가 없어 한 화면 완결이 가능하다. */
export function isSingleInlineSubType(subType: IoSubType): boolean {
  return subType === "adjust_in" || subType === "adjust_out";
}

/** 한 묶음 카트 안에서 BOM 묶음과 낱개 묶음을 같이 가질 수 있는지.
 *  현재는 창고 입출고(warehouse_to_dept/dept_to_warehouse)만 true.
 *  produce/disassemble 은 BOM 강제(isBomForced) 흐름과 백엔드 분기가 달라 락 유지. */
export function allowsMixedBundles(subType: IoSubType): boolean {
  return subType === "warehouse_to_dept" || subType === "dept_to_warehouse";
}

export type LineTagTone = "green" | "red" | "blue" | "purple" | "muted";

// 라인의 sub_type/origin/direction 조합으로 현장 친화 태그 결정.
// IoLineRow / IoBundleCard 표시용.
export function lineTagLabel(line: IoLine, subType: IoSubType): { text: string; tone: LineTagTone } {
  if (subType === "internal_use_out") return { text: "사용출고", tone: "red" };
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
  return workType === "defect" || workType === "internal_use";
}

/** defect workType에서 격리(DEFECTIVE) 재고를 소스로 쓰는 서브타입인지 판별. */
export function isDefectInventorySubType(subType: IoSubType): boolean {
  return subType === "defect_restore" || subType === "defect_process" || subType === "supplier_return";
}

export { RefreshCcw };

// ── 빠른작업 팝업 → IoEntryIntent 매핑 ──────────────────────────────────────

export type QuickIoChoice =
  | "dept_in"
  | "wh_in"
  | "receive"
  | "dept_out"
  | "wh_out";

/** 팝업 선택 → IoEntryIntent 순수 변환. */
export function quickChoiceToIntent(choice: QuickIoChoice): IoEntryIntent {
  switch (choice) {
    case "dept_in":
      return { workType: "process", direction: "in" };
    case "wh_in":
      return { workType: "warehouse_io", subType: "dept_to_warehouse" };
    case "receive":
      return { workType: "receive", subType: "receive_supplier" };
    case "dept_out":
      return { workType: "process", direction: "out" };
    case "wh_out":
      return { workType: "warehouse_io", subType: "warehouse_to_dept" };
  }
}

/** 입고 팝업 선택지. canReceive=true 일 때만 "원자재 수령" 포함. */
export function inboundChoices(canReceive: boolean): Array<{ key: QuickIoChoice; label: string; desc: string }> {
  const base: Array<{ key: QuickIoChoice; label: string; desc: string }> = [
    { key: "dept_in", label: "부서 입고", desc: "생산·분해 결과를 입고" },
    { key: "wh_in", label: "창고 반입", desc: "부서 재고를 창고로 반환" },
  ];
  if (canReceive) {
    base.push({ key: "receive", label: "원자재 수령", desc: "공급처에서 원자재 입고" });
  }
  return base;
}

/** 출고 팝업 선택지. */
export const outboundChoices: Array<{ key: QuickIoChoice; label: string; desc: string }> = [
  { key: "dept_out", label: "부서 출고", desc: "부서 소비·분해 출고" },
  { key: "wh_out", label: "창고 반출", desc: "창고에서 부서로 출고" },
];
