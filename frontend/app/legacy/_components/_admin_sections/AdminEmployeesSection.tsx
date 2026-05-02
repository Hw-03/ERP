"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { LEGACY_COLORS, normalizeDepartment } from "../legacyUi";
import { useAdminEmployeesContext } from "./AdminEmployeesContext";
import { ConfirmModal } from "@/features/mes/shared/ConfirmModal";
import { EmployeeAddPanel } from "./_employees_parts/EmployeeAddPanel";
import { EmployeeEditPanel } from "./_employees_parts/EmployeeEditPanel";

export function AdminEmployeesSection() {
  const ctx = useAdminEmployeesContext();
  const {
    employees,
    departments,
    selectedEmployee,
    setSelectedEmployee,
    empAddMode,
    setEmpAddMode,
    empAddForm,
    setEmpAddForm,
    addEmployee: onAddEmployee,
    toggleEmployee: onToggleEmployee,
    confirmTarget,
    confirmToggle,
    cancelConfirm,
    editForm,
    setEditForm,
    saveEmployee,
    pinResetTarget,
    pinResetAdminPin,
    setPinResetAdminPin,
    pinResetError,
    requestPinReset,
    confirmPinReset,
    cancelPinReset,
    deleteTarget,
    requestDelete,
    confirmDelete,
    cancelDelete,
  } = ctx;

  const [search, setSearch] = useState("");
  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        normalizeDepartment(e.department).toLowerCase().includes(q) ||
        (e.role ?? "").toLowerCase().includes(q),
    );
  }, [employees, search]);

  return (
    <>
      <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div
          className="flex flex-col overflow-hidden rounded-[28px] border"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
            <div
              className="mb-3 rounded-[12px] border px-3 py-2 flex items-center gap-3 flex-wrap"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                전체 <span style={{ color: LEGACY_COLORS.blue, fontWeight: 900 }}>{employees.length}</span>명
              </span>
              <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                활성 <span style={{ color: LEGACY_COLORS.green, fontWeight: 900 }}>
                  {employees.filter((e) => e.is_active).length}
                </span>명
              </span>
              <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                비활성 <span style={{ color: LEGACY_COLORS.red, fontWeight: 900 }}>
                  {employees.filter((e) => !e.is_active).length}
                </span>명
              </span>
            </div>
            <div
              className="mb-3 flex items-center gap-2 rounded-[12px] border px-3 py-2"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <Search className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름·코드·부서·역할 검색"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                style={{ color: LEGACY_COLORS.text }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/10"
                  style={{ color: LEGACY_COLORS.muted2 }}
                  aria-label="검색 초기화"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setEmpAddMode(true);
                setSelectedEmployee(null);
              }}
              className="w-full rounded-[14px] border border-dashed py-2.5 text-base font-bold"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              + 직원 추가
            </button>
          </div>
          <div className="overflow-y-auto">
            {filteredEmployees.length === 0 && (
              <div className="px-4 py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                {search ? "검색 결과가 없습니다." : "직원이 없습니다."}
              </div>
            )}
            {filteredEmployees.map((employee, index) => (
              <button
                key={employee.employee_id}
                onClick={() => {
                  setSelectedEmployee(employee);
                  setEmpAddMode(false);
                }}
                className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-white/[0.12]"
                style={{
                  borderBottom: index === filteredEmployees.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                  background:
                    selectedEmployee?.employee_id === employee.employee_id
                      ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 10%, transparent)`
                      : "transparent",
                }}
              >
                <div>
                  <div className="text-base font-semibold">{employee.name}</div>
                  <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                    {employee.employee_code} / {normalizeDepartment(employee.department)}
                  </div>
                </div>
                <span
                  className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{
                    background: employee.is_active
                      ? `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)`
                      : `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
                    color: employee.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.red,
                  }}
                >
                  {employee.is_active ? "활성" : "비활성"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div
          className="overflow-y-auto rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          {empAddMode ? (
            <EmployeeAddPanel
              form={empAddForm}
              setForm={setEmpAddForm}
              departments={departments}
              onClose={() => setEmpAddMode(false)}
              onSubmit={onAddEmployee}
            />
          ) : selectedEmployee ? (
            <EmployeeEditPanel
              employee={selectedEmployee}
              form={editForm}
              setForm={setEditForm}
              departments={departments}
              onSave={saveEmployee}
              onRequestPinReset={requestPinReset}
              onToggle={onToggleEmployee}
              onRequestDelete={requestDelete}
            />
          ) : (
            <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              직원을 선택하면 정보를 수정하거나 PIN을 초기화할 수 있습니다.
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmTarget !== null}
        title={`'${confirmTarget?.name}' 직원을 ${confirmTarget?.is_active ? "비활성화" : "활성화"}하시겠습니까?`}
        tone={confirmTarget?.is_active ? "danger" : "normal"}
        confirmLabel={confirmTarget?.is_active ? "비활성화" : "활성화"}
        onClose={cancelConfirm}
        onConfirm={confirmToggle}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={`'${deleteTarget?.name}' 직원을 삭제하시겠습니까?`}
        tone="danger"
        cautionMessage="거래 이력이 있으면 비활성화, 없으면 영구 삭제됩니다."
        confirmLabel="삭제"
        onClose={cancelDelete}
        onConfirm={confirmDelete}
      />

      <ConfirmModal
        open={pinResetTarget !== null}
        title={`'${pinResetTarget?.name}' 직원의 PIN을 0000으로 초기화하시겠습니까?`}
        tone="caution"
        cautionMessage="기존 PIN은 더 이상 사용할 수 없게 됩니다. 관리자 PIN을 입력하세요."
        confirmLabel="초기화"
        onClose={cancelPinReset}
        onConfirm={confirmPinReset}
      >
        <div className="mt-2">
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
            관리자 PIN
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={32}
            value={pinResetAdminPin}
            onChange={(e) => setPinResetAdminPin(e.target.value)}
            placeholder="0000"
            className="w-full rounded-[12px] border px-3 py-2 text-sm tracking-widest outline-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
          {pinResetError && (
            <p className="mt-1.5 text-xs" style={{ color: LEGACY_COLORS.red }}>
              {pinResetError}
            </p>
          )}
        </div>
      </ConfirmModal>
    </>
  );
}
