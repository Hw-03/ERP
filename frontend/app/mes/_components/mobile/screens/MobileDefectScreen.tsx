"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { canEnterIO, isWarehouseStaff, isDepartmentApprover } from "../../_warehouse_steps";
import { WarehouseAccessDenied } from "../../_warehouse_sections/WarehouseAccessDenied";
import { readCurrentOperator, type Operator } from "../../login/useCurrentOperator";
import { useWarehouseData } from "../../_warehouse_hooks/useWarehouseData";
import { DefectHubPanel } from "../../_defect_hub/DefectHubPanel";

const NOOP = () => {};

/**
 * 불량 모바일 화면.
 *
 * 좁은 화면엔 세로형 허브가 맞아 기존 DefectHubPanel(세로 스택)을 그대로 마운트한다.
 * 권한·가시성은 입출고와 동일(canEnterIO). 격리 추가·바로 폐기(다품목 카트)·처리 패널은
 * 데스크톱과 동일한 흐름을 모바일 전용으로 재구성해 DefectHubPanel 안에서 렌더한다.
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

  return <MobileDefectInner operator={operator} defectDeptFilter={defectDeptFilter} />;
}

/**
 * 권한 통과 후 본문 — 격리 추가·바로 폐기 카트가 쓸 품목/모델을 로드한다
 * (데스크톱 DefectViewInner 와 동일하게 useWarehouseData 사용).
 */
function MobileDefectInner({
  operator,
  defectDeptFilter,
}: {
  operator: Operator;
  defectDeptFilter?: string | null;
}) {
  const { items, productModels } = useWarehouseData({ globalSearch: "", onStatusChange: NOOP });

  // 역할 기반 기본 출처 — 창고 전담자만 "warehouse", 나머지 "production"(데스크톱 동일).
  const defaultSource: "warehouse" | "production" =
    isWarehouseStaff(operator) && !isDepartmentApprover(operator) ? "warehouse" : "production";

  return (
    <div className="h-full overflow-y-auto px-3 pb-6 pt-3">
      <DefectHubPanel
        defectDeptFilter={defectDeptFilter}
        currentEmployee={{
          employee_id: operator.employee_id,
          name: operator.name,
          department: operator.department,
        }}
        items={items}
        productModels={productModels}
        defaultSource={defaultSource}
      />
    </div>
  );
}
