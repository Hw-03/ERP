"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { canEnterIO } from "../../_warehouse_steps";
import { WarehouseAccessDenied } from "../../_warehouse_sections/WarehouseAccessDenied";
import { readCurrentOperator } from "../../login/useCurrentOperator";
import { DefectHubPanel } from "../../_defect_hub/DefectHubPanel";

/**
 * 불량 모바일 화면.
 *
 * 좁은 화면엔 세로형 허브가 맞아 기존 DefectHubPanel(세로 스택 + 모달)을 그대로 마운트한다.
 * 권한·가시성은 입출고와 동일(canEnterIO). "기능만 되는 수준" — 마감은 앱 전체 손볼 때.
 */
export function MobileDefectScreen({
  defectDeptFilter,
}: {
  defectDeptFilter?: string | null;
}) {
  const operator = typeof window !== "undefined" ? readCurrentOperator() : null;

  if (operator && !canEnterIO(operator)) {
    return <WarehouseAccessDenied department={operator.department ?? ""} />;
  }
  if (!operator) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
        <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
          작업자 로그인이 필요합니다.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 pb-6 pt-3">
      <DefectHubPanel
        defectDeptFilter={defectDeptFilter}
        currentEmployee={{
          employee_id: operator.employee_id,
          name: operator.name,
          department: operator.department,
        }}
      />
    </div>
  );
}
