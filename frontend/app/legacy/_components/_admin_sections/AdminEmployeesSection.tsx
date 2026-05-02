"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { EmployeeLevel, WarehouseRole } from "@/lib/api";
import { LEGACY_COLORS, normalizeDepartment } from "../legacyUi";
import { EMPTY_EMPLOYEE_FORM, type EmployeeAddForm } from "./adminShared";
import { useAdminEmployeesContext } from "./AdminEmployeesContext";
import { ConfirmModal } from "@/features/mes/shared/ConfirmModal";

const LEVEL_LABEL: Record<EmployeeLevel, string> = {
  admin: "관리자",
  manager: "매니저",
  staff: "사원",
};

const WAREHOUSE_ROLE_OPTIONS: { value: WarehouseRole; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "primary", label: "창고 정담당자" },
  { value: "deputy", label: "창고 부담당자" },
];

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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold">직원 추가</div>
              <button
                onClick={() => {
                  setEmpAddMode(false);
                  setEmpAddForm(() => EMPTY_EMPLOYEE_FORM);
                }}
                className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
                style={{ color: LEGACY_COLORS.red }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(
              [
                { key: "employee_code", label: "직원 코드", required: true, placeholder: "예: E27" },
                { key: "name", label: "이름", required: true, placeholder: "예: 홍길동" },
                { key: "role", label: "역할", required: false, placeholder: "예: 조립/사원" },
                { key: "phone", label: "연락처", required: false, placeholder: "예: 010-0000-0000" },
              ] as { key: keyof EmployeeAddForm; label: string; required: boolean; placeholder: string }[]
            ).map(({ key, label, required, placeholder }) => (
              <div key={key}>
                <div
                  className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  {label}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: required
                        ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`
                        : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 20%, transparent)`,
                      color: required ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
                    }}
                  >
                    {required ? "필수" : "선택"}
                  </span>
                </div>
                <input
                  type="text"
                  value={empAddForm[key]}
                  onChange={(e) => setEmpAddForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </div>
            ))}
            <div>
              <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                부서
              </div>
              <select
                value={empAddForm.department}
                onChange={(e) => setEmpAddForm((f) => ({ ...f, department: e.target.value }))}
                className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                {departments.filter((d) => d.is_active).map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                창고 결재 역할
              </div>
              <select
                value={empAddForm.warehouse_role}
                onChange={(e) => setEmpAddForm((f) => ({ ...f, warehouse_role: e.target.value as WarehouseRole }))}
                className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                {WAREHOUSE_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={onAddEmployee}
              className="w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
              style={{ background: LEGACY_COLORS.blue }}
            >
              추가
            </button>
          </div>
        ) : selectedEmployee ? (
          <div className="space-y-4">
            <div>
              <div className="text-xl font-black">{selectedEmployee.name}</div>
              <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                {selectedEmployee.employee_code}
              </div>
            </div>

            {/* 정보 수정 폼 */}
            <div className="space-y-3 border-t pt-4" style={{ borderColor: LEGACY_COLORS.border }}>
              <FieldRow label="이름">
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </FieldRow>
              <FieldRow label="역할">
                <input
                  type="text"
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </FieldRow>
              <FieldRow label="연락처">
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </FieldRow>
              <FieldRow label="부서">
                <select
                  value={editForm.department}
                  onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                  className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                >
                  {departments.filter((d) => d.is_active).map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="권한">
                <select
                  value={editForm.level}
                  onChange={(e) => setEditForm((f) => ({ ...f, level: e.target.value as EmployeeLevel }))}
                  className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                >
                  {(["admin", "manager", "staff"] as EmployeeLevel[]).map((value) => (
                    <option key={value} value={value}>{LEVEL_LABEL[value]}</option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="창고 결재 역할">
                <select
                  value={editForm.warehouse_role}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, warehouse_role: e.target.value as WarehouseRole }))
                  }
                  className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                >
                  {WAREHOUSE_ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="표시 순서">
                <input
                  type="number"
                  value={editForm.display_order}
                  onChange={(e) => setEditForm((f) => ({ ...f, display_order: Number(e.target.value) || 0 }))}
                  className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </FieldRow>
            </div>

            <button
              onClick={saveEmployee}
              className="w-full rounded-[14px] px-4 py-2.5 text-sm font-bold text-white"
              style={{ background: LEGACY_COLORS.blue }}
            >
              저장
            </button>

            {/* PIN 정보 카드 */}
            <div
              className="rounded-[14px] border p-3 mt-1"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  PIN
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{
                    background: `color-mix(in srgb, ${
                      selectedEmployee.pin_is_default ? LEGACY_COLORS.yellow : LEGACY_COLORS.green
                    } 18%, transparent)`,
                    color: selectedEmployee.pin_is_default ? LEGACY_COLORS.yellow : LEGACY_COLORS.green,
                  }}
                >
                  {selectedEmployee.pin_is_default ? "기본 PIN (0000)" : "직원 설정 PIN"}
                </span>
              </div>
              <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                마지막 변경:{" "}
                {selectedEmployee.pin_last_changed
                  ? new Date(selectedEmployee.pin_last_changed).toLocaleDateString("ko-KR")
                  : "변경 이력 없음"}
              </p>
              <p className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                보안상 PIN 자체는 표시되지 않습니다. 직원이 PIN을 잊은 경우 아래 &apos;초기화&apos;로 0000로 되돌리세요.
              </p>
            </div>

            {/* PIN 초기화 / 비활성화 */}
            <div className="grid grid-cols-2 gap-2 border-t pt-4" style={{ borderColor: LEGACY_COLORS.border }}>
              <button
                onClick={() => requestPinReset(selectedEmployee)}
                className="rounded-[14px] border px-3 py-2.5 text-sm font-bold"
                style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.yellow }}
              >
                PIN 초기화
              </button>
              <button
                onClick={() => onToggleEmployee(selectedEmployee)}
                className="rounded-[14px] px-3 py-2.5 text-sm font-bold text-white"
                style={{ background: selectedEmployee.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
              >
                {selectedEmployee.is_active ? "비활성화" : "활성화"}
              </button>
            </div>
            <button
              onClick={() => requestDelete(selectedEmployee)}
              className="w-full rounded-[14px] border px-3 py-2.5 text-sm font-bold"
              style={{
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
                color: LEGACY_COLORS.red,
              }}
            >
              직원 삭제
            </button>
          </div>
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
