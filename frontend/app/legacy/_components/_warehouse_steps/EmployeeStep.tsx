"use client";

import type { Employee } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import { normalizeDepartment } from "@/lib/mes/department";
import { firstEmployeeLetter } from "@/lib/mes/employee";
import { useDeptColorLookup } from "../DepartmentsContext";

export function EmployeeStep({
  employees,
  selectedId,
  onSelect,
  expanded,
  setExpanded,
}: {
  employees: Employee[];
  selectedId: string;
  onSelect: (id: string) => void;
  expanded: boolean;
  setExpanded: (e: boolean) => void;
}) {
  const getDeptColor = useDeptColorLookup();
  const visible = expanded ? employees : employees.slice(0, 10);
  const overflow = !expanded && employees.length > 10;

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {visible.map((emp) => {
          const active = emp.employee_id === selectedId;
          const tone = getDeptColor(emp.department);
          return (
            <button
              key={emp.employee_id}
              onClick={() => onSelect(emp.employee_id)}
              className="flex flex-col items-center gap-1.5 rounded-[14px] border p-3 transition-all hover:brightness-110"
              style={{
                background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
                borderColor: active ? tone : LEGACY_COLORS.border,
                borderWidth: active ? 2 : 1,
              }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-base font-black text-white"
                style={{ background: tone }}
              >
                {firstEmployeeLetter(emp.name)}
              </span>
              <span className="text-xs font-bold" style={{ color: active ? tone : LEGACY_COLORS.text }}>
                {emp.name}
              </span>
              <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {normalizeDepartment(emp.department)}
              </span>
            </button>
          );
        })}
        {overflow && (
          <button
            onClick={() => setExpanded(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed p-3 text-xs font-bold transition-colors hover:brightness-110"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            <span className="text-2xl leading-none">+</span>
            <span>추가 {employees.length - 10}명</span>
          </button>
        )}
      </div>
    </div>
  );
}
