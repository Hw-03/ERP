"use client";

import { useMemo } from "react";
import type { Department, Employee, Item, ShipPackage } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import {
  CAUTION_WORK_TYPES,
  isWarehouseStaff,
  workTypesForOperator,
  type WorkType,
} from "../_warehouse_steps";
import {
  inputRequiresApproval,
  resolveRequestType,
} from "../_warehouse_helpers/requestMapping";
import type { DefectiveSource, Direction, TransferDirection } from "../_warehouse_steps";
import type { Operator } from "../login/useCurrentOperator";

/**
 * DesktopWarehouseView 의 wizard state → UI 라벨/조건 derivation.
 *
 * Round-10B (#6) 추출. 본 hook 이 묶는 것:
 *   - effectiveLabel / shortLabel — 작업유형별 화면 라벨
 *   - isOutbound / isRawReturn / isCaution — 위험/색상 분기 플래그
 *   - canExecute / quantityInvalid / blockerText / stockShortage — 제출 차단 조건
 *   - accent — 색상
 *   - requiresApproval / currentRequestType — backend 라우팅
 *   - availableWorkTypes — 권한별 노출
 *
 * 모두 pure derivation 이라 동작 변화 0.
 */

export interface UseWarehouseDerivationsInput {
  operator: Operator | null;
  selectedEmployee: Employee | null;
  selectedItems: Map<string, number>;
  selectedEntries: { item: Item; quantity: number }[];
  selectedPackage: ShipPackage | null;
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
  selectedDept: Department;
  defectiveSource: DefectiveSource;
}

export interface UseWarehouseDerivationsResult {
  isOutbound: boolean;
  isRawReturn: boolean;
  isCaution: boolean;
  effectiveLabel: string;
  shortLabel: string;
  totalQty: number;
  quantityInvalid: boolean;
  stockShortage: boolean;
  canExecute: boolean;
  blockerText: string | null;
  accent: string;
  requiresApproval: boolean;
  currentRequestType: ReturnType<typeof resolveRequestType>;
  availableWorkTypes: ReturnType<typeof workTypesForOperator>;
}

export function useWarehouseDerivations(
  input: UseWarehouseDerivationsInput,
): UseWarehouseDerivationsResult {
  const {
    operator,
    selectedEmployee,
    selectedItems,
    selectedEntries,
    selectedPackage,
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
    selectedDept,
    defectiveSource,
  } = input;

  const isOutbound =
    workType === "raw-io"
      ? rawDirection !== "in"
      : workType === "warehouse-io"
        ? warehouseDirection === "wh-to-dept"
        : workType === "dept-io"
          ? deptDirection === "out"
          : true;

  const isRawReturn = workType === "raw-io" && rawDirection === "return";
  const isCaution = CAUTION_WORK_TYPES.includes(workType) || isRawReturn;

  const effectiveLabel =
    workType === "raw-io"
      ? rawDirection === "in"
        ? "원자재 입고"
        : rawDirection === "out"
          ? "원자재 출고"
          : `공급업체 반품 (${selectedDept} 불량)`
      : workType === "warehouse-io"
        ? warehouseDirection === "wh-to-dept"
          ? `창고→${selectedDept} 이동`
          : `${selectedDept}→창고 복귀`
        : workType === "dept-io"
          ? `${selectedDept} ${deptDirection === "in" ? "입고" : "출고"}`
          : workType === "defective-register"
            ? `불량 등록 (${defectiveSource === "warehouse" ? "창고" : selectedDept} → ${selectedDept} 격리)`
            : "패키지 출고";

  const shortLabel = effectiveLabel.replace(/\s*\(.*\)\s*$/, "");

  const totalQty = Array.from(selectedItems.values()).reduce((sum, q) => sum + q, 0);

  const quantityInvalid =
    workType !== "package-out" && selectedEntries.some((e) => e.quantity <= 0);

  const stockShortage =
    workType !== "package-out" &&
    isOutbound &&
    selectedEntries.some((e) => Number(e.item.quantity) - e.quantity < 0);

  const canExecute =
    !!selectedEmployee &&
    (workType === "package-out" ? !!selectedPackage : selectedEntries.length > 0) &&
    !quantityInvalid;

  const blockerText = !selectedEmployee
    ? "담당자를 선택하세요"
    : workType === "package-out" && !selectedPackage
      ? "출고할 패키지를 선택하세요"
      : workType !== "package-out" && selectedEntries.length === 0
        ? "품목을 선택하세요"
        : quantityInvalid
          ? "수량을 확인하세요"
          : stockShortage
            ? "출고 후 재고가 음수입니다 — 수량을 다시 확인하세요"
            : null;

  const accent = isOutbound ? LEGACY_COLORS.red : LEGACY_COLORS.blue;

  // 창고 정/부(warehouse_role=primary/deputy)가 본인 명의로 제출하면 백엔드에서
  // 자가승인 처리되므로 UI 라벨도 "즉시 처리" 로 통일한다.
  const requiresApproval =
    inputRequiresApproval({
      workType,
      rawDirection,
      warehouseDirection,
      deptDirection,
      defectiveSource,
    }) && !isWarehouseStaff(operator);

  const currentRequestType = useMemo(
    () =>
      resolveRequestType({
        workType,
        rawDirection,
        warehouseDirection,
        deptDirection,
        defectiveSource,
      }),
    [workType, rawDirection, warehouseDirection, deptDirection, defectiveSource],
  );

  const availableWorkTypes = useMemo(() => workTypesForOperator(operator), [operator]);

  return {
    isOutbound,
    isRawReturn,
    isCaution,
    effectiveLabel,
    shortLabel,
    totalQty,
    quantityInvalid,
    stockShortage,
    canExecute,
    blockerText,
    accent,
    requiresApproval,
    currentRequestType,
    availableWorkTypes,
  };
}
