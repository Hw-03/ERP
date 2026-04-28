/**
 * DesktopWarehouseView wizard 입력값 → /api/stock-requests payload 변환.
 *
 * 변환 단위: workType + 방향 + selectedDept + entries → request_type + lines[].
 * 백엔드 정책 (`services/stock_requests.line_requires_approval`) 과 동일하게
 * from/to bucket 중 하나라도 warehouse면 승인 필요로 판정한다.
 */

import type {
  Department,
  Item,
  RequestBucket,
  ShipPackage,
  StockRequestCreatePayload,
  StockRequestType,
} from "@/lib/api";
import type {
  DefectiveSource,
  Direction,
  TransferDirection,
  WorkType,
} from "../_warehouse_steps";

export interface BuildPayloadInput {
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
  selectedDept: Department;
  defectiveSource: DefectiveSource;
  entries: { item: Item; quantity: number }[];
  selectedPackage: ShipPackage | null;
  requesterEmployeeId: string;
  referenceNo?: string;
  notes?: string;
}

interface LineSpec {
  item_id: string;
  quantity: number;
  from_bucket: RequestBucket;
  from_department?: Department | null;
  to_bucket: RequestBucket;
  to_department?: Department | null;
}

/** 라인 단위 승인 필요 여부 — 백엔드 정책과 동일. */
export function lineRequiresApproval(
  from_bucket: RequestBucket,
  to_bucket: RequestBucket
): boolean {
  return from_bucket === "warehouse" || to_bucket === "warehouse";
}

/** wizard 입력 → request_type 결정. */
export function resolveRequestType(input: {
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
  defectiveSource: DefectiveSource;
}): StockRequestType {
  const { workType, rawDirection, warehouseDirection, deptDirection, defectiveSource } = input;
  switch (workType) {
    case "raw-io":
      return rawDirection === "in" ? "raw_receive" : "raw_ship";
    case "warehouse-io":
      return warehouseDirection === "wh-to-dept" ? "warehouse_to_dept" : "dept_to_warehouse";
    case "dept-io":
      // 기존 코드에서 dept-io 도 창고 ↔ 부서 이동 (transfer_to_production / transfer_to_warehouse)
      // 을 호출하므로 동일하게 매핑한다. 향후 진정한 부서 내부 이동 UI는 별도.
      return deptDirection === "in" ? "warehouse_to_dept" : "dept_to_warehouse";
    case "defective-register":
      return defectiveSource === "warehouse" ? "mark_defective_wh" : "mark_defective_prod";
    case "supplier-return":
      return "supplier_return";
    case "package-out":
      return "package_out";
  }
}

/** wizard 입력 → 라인 페이로드 (from/to bucket + 부서). */
function buildLines(input: BuildPayloadInput): LineSpec[] {
  const {
    workType, rawDirection, warehouseDirection, deptDirection,
    selectedDept, defectiveSource, entries, selectedPackage,
  } = input;

  if (workType === "package-out") {
    if (!selectedPackage) return [];
    return selectedPackage.items.map((it) => ({
      item_id: it.item_id,
      quantity: Number(it.quantity),
      from_bucket: "warehouse",
      to_bucket: "none",
    }));
  }

  return entries.map(({ item, quantity }): LineSpec => {
    if (workType === "raw-io") {
      return rawDirection === "in"
        ? { item_id: item.item_id, quantity, from_bucket: "none", to_bucket: "warehouse" }
        : { item_id: item.item_id, quantity, from_bucket: "warehouse", to_bucket: "none" };
    }
    if (workType === "warehouse-io") {
      return warehouseDirection === "wh-to-dept"
        ? {
            item_id: item.item_id,
            quantity,
            from_bucket: "warehouse",
            to_bucket: "production",
            to_department: selectedDept,
          }
        : {
            item_id: item.item_id,
            quantity,
            from_bucket: "production",
            from_department: selectedDept,
            to_bucket: "warehouse",
          };
    }
    if (workType === "dept-io") {
      return deptDirection === "in"
        ? {
            item_id: item.item_id,
            quantity,
            from_bucket: "warehouse",
            to_bucket: "production",
            to_department: selectedDept,
          }
        : {
            item_id: item.item_id,
            quantity,
            from_bucket: "production",
            from_department: selectedDept,
            to_bucket: "warehouse",
          };
    }
    if (workType === "defective-register") {
      if (defectiveSource === "warehouse") {
        return {
          item_id: item.item_id,
          quantity,
          from_bucket: "warehouse",
          to_bucket: "defective",
          to_department: selectedDept,
        };
      }
      return {
        item_id: item.item_id,
        quantity,
        from_bucket: "production",
        from_department: selectedDept,
        to_bucket: "defective",
        to_department: selectedDept,
      };
    }
    // supplier-return
    return {
      item_id: item.item_id,
      quantity,
      from_bucket: "defective",
      from_department: selectedDept,
      to_bucket: "none",
    };
  });
}

/** 전체 페이로드 빌드. */
export function buildStockRequestPayload(input: BuildPayloadInput): StockRequestCreatePayload {
  const request_type = resolveRequestType(input);
  const lines = buildLines(input);
  return {
    requester_employee_id: input.requesterEmployeeId,
    request_type,
    reference_no: input.referenceNo || null,
    notes: input.notes || null,
    lines,
  };
}

/** wizard 입력만으로 승인 필요 여부 미리 판정 (UI 라벨링용). */
export function inputRequiresApproval(input: {
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
  defectiveSource: DefectiveSource;
}): boolean {
  // 라인을 시뮬레이션할 필요 없이 정책 분기를 그대로 본다.
  switch (input.workType) {
    case "raw-io":
    case "warehouse-io":
    case "dept-io":
    case "package-out":
      return true;
    case "defective-register":
      return input.defectiveSource === "warehouse";
    case "supplier-return":
      // from=defective, to=none → warehouse 미포함 → 승인 불필요
      return false;
  }
}
