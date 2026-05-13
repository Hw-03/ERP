"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Employee, type ProductModel } from "@/lib/api";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import type { ToastState } from "@/lib/ui/Toast";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { useDepartments } from "../../../DepartmentsContext";
import { AssignedModelsEditor } from "../../../_admin_sections/AssignedModelsEditor";

const ASSEMBLY_DEPT = "조립";

export function AdminEmployeesSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const departments = useDepartments();
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    employee_code: "",
    name: "",
    role: "",
    department: ASSEMBLY_DEPT,
    phone: "",
    assigned_model_slots: [] as number[],
  });
  const [editForm, setEditForm] = useState({
    name: "",
    role: "",
    department: ASSEMBLY_DEPT,
    phone: "",
    assigned_model_slots: [] as number[],
  });

  useEffect(() => {
    void api.getEmployees({ activeOnly: false }).then(setEmployees);
    void api.getModels().then((models) =>
      setProductModels(models.filter((m) => !m.is_reserved && (m.model_name || m.symbol))),
    );
  }, []);

  const sortedEmployees = useMemo(
    () => employees.slice().sort((a, b) => a.display_order - b.display_order),
    [employees],
  );

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedEmployees;
    return sortedEmployees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        normalizeDepartment(e.department).toLowerCase().includes(q) ||
        (e.role ?? "").toLowerCase().includes(q),
    );
  }, [sortedEmployees, search]);

  async function addEmployee() {
    try {
      const isAssembly = form.department === ASSEMBLY_DEPT;
      const next = await api.createEmployee({
        employee_code: form.employee_code,
        name: form.name,
        role: form.role,
        department: form.department as Employee["department"],
        phone: form.phone || undefined,
        display_order: employees.length + 1,
        assigned_model_slots: isAssembly ? form.assigned_model_slots : [],
      });
      setEmployees((current) => [...current, next]);
      setAddOpen(false);
      setForm({
        employee_code: "",
        name: "",
        role: "",
        department: ASSEMBLY_DEPT,
        phone: "",
        assigned_model_slots: [],
      });
      showToast({ message: "직원을 추가했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "직원을 추가하지 못했습니다.", type: "error" });
    }
  }

  function openEdit(employee: Employee) {
    setEditing(employee);
    setEditForm({
      name: employee.name,
      role: employee.role,
      department: employee.department,
      phone: employee.phone ?? "",
      assigned_model_slots: employee.assigned_model_slots ?? [],
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const isAssembly = editForm.department === ASSEMBLY_DEPT;
    try {
      const updated = await api.updateEmployee(editing.employee_id, {
        name: editForm.name,
        role: editForm.role,
        department: editForm.department as Employee["department"],
        phone: editForm.phone || undefined,
        assigned_model_slots: isAssembly ? editForm.assigned_model_slots : [],
      });
      setEmployees((current) =>
        current.map((e) => (e.employee_id === updated.employee_id ? updated : e)),
      );
      setEditing(null);
      showToast({ message: "직원 정보를 수정했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "수정에 실패했습니다.", type: "error" });
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
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="이름·코드·부서·역할 검색"
        className="mb-3 w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
      />
      <button
        onClick={() => setAddOpen(true)}
        className="mb-3 w-full rounded-xl border border-dashed py-[13px] text-sm font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        + 직원 추가
      </button>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {filteredEmployees.length === 0 ? (
          <div className="px-[14px] py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            {search ? "검색 결과가 없습니다." : "직원이 없습니다."}
          </div>
        ) : null}
        {filteredEmployees
          .map((employee, index, list) => (
            <div key={employee.employee_id} className="flex items-center gap-3 px-[14px] py-3" style={{ borderBottom: index === list.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => void move(employee, -1)} className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>▲</button>
                <button onClick={() => void move(employee, 1)} className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>▼</button>
              </div>
              <button
                onClick={() => openEdit(employee)}
                className="min-w-0 flex-1 text-left"
              >
                <div className={`text-sm font-semibold ${employee.is_active ? "" : "line-through"}`}>{employee.name}</div>
                <div className="truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {employee.employee_code} · {normalizeDepartment(employee.department)} · {employee.role}
                  {employee.department === ASSEMBLY_DEPT && (employee.assigned_model_slots?.length ?? 0) > 0
                    ? ` · 담당 모델 ${employee.assigned_model_slots!.length}개`
                    : ""}
                </div>
              </button>
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
            ] as ["employee_code" | "name" | "role" | "phone", string][]
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
          {form.department === ASSEMBLY_DEPT ? (
            <div>
              <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
                담당 모델 (우선순위 순)
              </div>
              <AssignedModelsEditor
                models={productModels}
                selected={form.assigned_model_slots}
                onChange={(next) => setForm((current) => ({ ...current, assigned_model_slots: next }))}
              />
            </div>
          ) : null}
          <button onClick={() => void addEmployee()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>
            추가
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title="직원 수정">
        {editing ? (
          <div className="space-y-3 px-5 pb-6">
            <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
              {editing.employee_code}
            </div>
            {(
              [
                ["name", "이름"],
                ["role", "역할"],
                ["phone", "연락처"],
              ] as ["name" | "role" | "phone", string][]
            ).map(([key, label]) => (
              <div key={key}>
                <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {label}
                </div>
                <input
                  value={editForm[key]}
                  onChange={(event) => setEditForm((current) => ({ ...current, [key]: event.target.value }))}
                  className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </div>
            ))}
            <div>
              <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
                부서
              </div>
              <select
                value={editForm.department}
                onChange={(event) => setEditForm((current) => ({ ...current, department: event.target.value }))}
                className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {editForm.department === ASSEMBLY_DEPT ? (
              <div>
                <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  담당 모델 (우선순위 순)
                </div>
                <AssignedModelsEditor
                  models={productModels}
                  selected={editForm.assigned_model_slots}
                  onChange={(next) => setEditForm((current) => ({ ...current, assigned_model_slots: next }))}
                />
              </div>
            ) : null}
            <button onClick={() => void saveEdit()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>
              저장
            </button>
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}
