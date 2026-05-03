/**
 * Round-15 (#3) 분리 — stock-request 승인 필요 여부 정책.
 *
 * 백엔드 `services/stock_requests.line_requires_approval` 와 동일하게
 * from/to bucket 중 하나라도 warehouse 면 승인 필요로 판정한다.
 */

import type { RequestBucket } from "@/lib/api";
import type { DefectiveSource, Direction, TransferDirection, WorkType } from "../_warehouse_steps";

/** 라인 단위 승인 필요 여부 — 백엔드 정책과 동일. */
export function lineRequiresApproval(
  from_bucket: RequestBucket,
  to_bucket: RequestBucket,
): boolean {
  return from_bucket === "warehouse" || to_bucket === "warehouse";
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
      // return(공급업체 반품)은 from=defective, to=none → warehouse 미포함 → 승인 불필요.
      return input.rawDirection !== "return";
    case "warehouse-io":
    case "dept-io":
    case "package-out":
      return true;
    case "defective-register":
      return input.defectiveSource === "warehouse";
  }
}
