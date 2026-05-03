"use client";

import { useMemo } from "react";
import { PackageSearch } from "lucide-react";
import type { Department, Employee } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../../../tokens";
import { EmptyState, PersonAvatar } from "../../../primitives";
import { useDeptWizard } from "../context";
import { StepHeading } from "./_shared";

export function StepPerson({
  employees,
  loading,
}: {
  employees: Employee[];
  loading: boolean;
}) {
  const { state, dispatch } = useDeptWizard();

  const visibleEmployees = useMemo(
    () => employees.filter((e) => e.department === (state.department as Department)),
    [employees, state.department],
  );

  if (loading) {
    return (
      <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        직원 목록을 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading
        title={`${state.department ?? ""}부 담당자를 선택합니다`}
        hint="담당자 선택 시 다음 단계로 자동 이동합니다"
      />
      {visibleEmployees.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="등록된 담당자가 없습니다"
          description="관리자 탭에서 직원을 추가해 주세요."
        />
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {visibleEmployees.map((e) => (
            <PersonAvatar
              key={e.employee_id}
              name={e.name}
              department={e.department}
              selected={state.employeeId === e.employee_id}
              onClick={() => {
                dispatch({ type: "SET_EMPLOYEE", employeeId: e.employee_id });
                dispatch({ type: "NEXT" });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
