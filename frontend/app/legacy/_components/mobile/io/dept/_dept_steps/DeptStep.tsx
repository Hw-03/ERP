"use client";

import { useEffect, useState } from "react";
import { api, type DepartmentMaster } from "@/lib/api";
import { LEGACY_COLORS, employeeColor } from "../../../../legacyUi";
import { TYPO } from "../../../tokens";
import { useDeptWizard } from "../context";
import { StepHeading } from "./_shared";

export function StepDepartment() {
  const { state, dispatch } = useDeptWizard();
  const [departments, setDepartments] = useState<DepartmentMaster[]>([]);

  useEffect(() => {
    void api.getDepartments({ isActive: true }).then(setDepartments).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading
        title="어느 부서의 거래인지 선택합니다"
        hint="선택 시 바로 해당 부서의 담당자 단계로 넘어갑니다"
      />
      <div className="grid grid-cols-2 gap-2">
        {departments.map((dept) => {
          const active = state.department === dept.name;
          const color = dept.color_hex ?? employeeColor(dept.name);
          return (
            <button
              key={dept.id}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_DEPARTMENT", department: dept.name });
                dispatch({ type: "NEXT" });
              }}
              className="flex flex-col items-start gap-1 rounded-[20px] border px-4 py-4 text-left active:scale-[0.98]"
              style={{
                background: active ? `${color}1a` : LEGACY_COLORS.s2,
                borderColor: active ? color : LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-[14px]"
                style={{ background: `${color}22`, color }}
              >
                <span className={`${TYPO.body} font-black`}>{dept.name.slice(0, 1)}</span>
              </div>
              <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                {dept.name}
              </div>
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                {dept.name === "출하" ? "출하 · 패키지" : `${dept.name}부`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
