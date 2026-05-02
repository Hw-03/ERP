"use client";

import { useMemo } from "react";
import type { Employee } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { TYPO } from "../../tokens";
import { PersonAvatar } from "../../primitives";
import { useWarehouseWizard } from "./context";
import { StepHeading } from "./wizardStepShared";

/**
 * Round-11A (#1) 추출 — WarehouseWizard Step 2 (담당자 선택, 부서별 그룹).
 */
export function StepPerson({ employees, loading }: { employees: Employee[]; loading: boolean }) {
  const { state, dispatch } = useWarehouseWizard();

  const grouped = useMemo(() => {
    const map = new Map<string, Employee[]>();
    employees.forEach((e) => {
      const key = normalizeDepartment(e.department);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return Array.from(map.entries());
  }, [employees]);

  if (loading) {
    return (
      <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        직원 목록을 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <StepHeading title="작업을 진행할 담당자를 선택합니다" hint="담당자를 누르면 바로 다음 단계로 넘어갑니다" />
      {grouped.map(([dept, group]) => (
        <div key={dept} className="flex flex-col gap-2">
          <div className={`${TYPO.caption} font-bold`} style={{ color: LEGACY_COLORS.muted }}>
            {dept}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {group.map((e) => (
              <PersonAvatar
                key={e.employee_id}
                name={e.name}
                department={e.department}
                selected={state.employeeId === e.employee_id}
                onClick={() => {
                  dispatch({ type: "SET_EMPLOYEE", employeeId: e.employee_id });
                  dispatch({ type: "NEXT" });
                }}
                size="md"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
