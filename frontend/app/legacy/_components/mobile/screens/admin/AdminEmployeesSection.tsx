"use client";

import { useEffect, useState } from "react";
import { api, type DepartmentMaster, type Employee } from "@/lib/api";
import { BottomSheet } from "../../../BottomSheet";
import type { ToastState } from "../../../Toast";
import { LEGACY_COLORS, normalizeDepartment } from "../../../legacyUi";

export function AdminEmployeesSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<DepartmentMaster[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    employee_code: "",
    name: "",
    role: "",
    department: "조립",
    phone: "",
  });

  useEffect(() => {
    void api.getEmployees({ activeOnly: false }).then(setEmployees);
    void api.getDepartments({ isActive: true }).then(setDepartments);
  }, []);

  async function addEmployee() {
    try {
      const next = await api.createEmployee({
        employee_code: form.employee_code,
        name: form.name,
        role: form.role,
        department: form.department as Employee["department"],
        phone: form.phone || undefined,
        display_order: employees.length + 1,
      });
      setEmployees((current) => [...current, next]);
      setAddOpen(false);
      setForm({ employee_code: "", name: "", role: "", department: "조립", phone: "" });
      showToast({ message: "직원을 추가했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "직원을 추가하지 못했습니다.", type: "error" });
    }
  }

  async function toggleActive(employee: Employee) {
    try {
      const updated = await api.updateEmployee(employee.employee_id, { is_active: !employee.is_active });
      setEmployees((current) => current.map((entry) => (entry.employee_id === employee.employee_id ? updated : entry)));
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "상태 변경에 실패했습니다.", type: "error" });
    }
  }

  async function move(employee: Employee, delta: number) {
    const updated = await api.updateEmployee(employee.employee_id, { display_order: employee.display_order + delta });
    setEmployees((current) =>
      current
        .map((entry) => (entry.employee_id === employee.employee_id ? updated : entry))
        .sort((a, b) => a.display_order - b.display_order),
    );
  }

  return (
    <>
      <button
        onClick={() => setAddOpen(true)}
        className="mb-3 w-full rounded-xl border border-dashed py-[13px] text-sm font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        + 직원 추가
      </button>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {employees
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((employee, index, list) => (
            <div key={employee.employee_id} className="flex items-center gap-3 px-[14px] py-3" style={{ borderBottom: index === list.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => void move(employee, -1)} className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>▲</button>
                <button onClick={() => void move(employee, 1)} className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>▼</button>
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${employee.is_active ? "" : "line-through"}`}>{employee.name}</div>
                <div className="truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {employee.employee_code} · {normalizeDepartment(employee.department)} · {employee.role}
                </div>
              </div>
              <button
                onClick={() => void toggleActive(employee)}
                className="inline-flex shrink-0 rounded-full px-[11px] py-1 text-[10px] font-bold transition-colors"
                style={{
                  background: employee.is_active ? "rgba(67,211,157,.16)" : "rgba(255,123,123,.14)",
                  color: employee.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.red,
                  border: `1px solid ${employee.is_active ? "rgba(67,211,157,.3)" : "rgba(255,123,123,.3)"}`,
                }}
              >
                {employee.is_active ? "활성" : "비활성"}
              </button>
            </div>
          ))}
      </div>

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="직원 추가">
        <div className="space-y-3 px-5 pb-6">
          {(
            [
              ["employee_code", "직원 코드"],
              ["name", "이름"],
              ["role", "역할"],
              ["phone", "연락처"],
            ] as [keyof typeof form, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {label}
              </div>
              <input value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
            </div>
          ))}
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
              부서
            </div>
            <select value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button onClick={() => void addEmployee()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>
            추가
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
