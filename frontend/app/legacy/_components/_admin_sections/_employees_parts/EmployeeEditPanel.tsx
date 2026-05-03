"use client";

import type { DepartmentMaster, Employee, EmployeeLevel, WarehouseRole } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { EmployeeEditForm } from "../../_admin_hooks/useAdminEmployees";

/**
 * 직원 선택 시 우측 패널 — 정보 수정 폼 + PIN 카드 + 비활성/삭제 버튼.
 *
 * Round-10B (#4) 추출. AdminEmployeesSection 우측에서 selectedEmployee 가
 * 있을 때 표시되는 가장 큰 JSX 블록 (~165줄) 을 분리.
 *
 * 시각/className/style 모두 보존. PIN 카드의 default vs 직원 설정 색상
 * 분기, 마지막 변경 일자 포맷도 그대로.
 */

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

interface Props {
  employee: Employee;
  form: EmployeeEditForm;
  setForm: (updater: (f: EmployeeEditForm) => EmployeeEditForm) => void;
  departments: DepartmentMaster[];
  onSave: () => void;
  onRequestPinReset: (employee: Employee) => void;
  onToggle: (employee: Employee) => void;
  onRequestDelete: (employee: Employee) => void;
}

export function EmployeeEditPanel({
  employee,
  form,
  setForm,
  departments,
  onSave,
  onRequestPinReset,
  onToggle,
  onRequestDelete,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-black">{employee.name}</div>
        <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          {employee.employee_code}
        </div>
      </div>

      {/* 정보 수정 폼 */}
      <div className="space-y-3 border-t pt-4" style={{ borderColor: LEGACY_COLORS.border }}>
        <FieldRow label="이름">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </FieldRow>
        <FieldRow label="역할">
          <input
            type="text"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </FieldRow>
        <FieldRow label="연락처">
          <input
            type="text"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </FieldRow>
        <FieldRow label="부서">
          <select
            value={form.department}
            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
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
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as EmployeeLevel }))}
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
            value={form.warehouse_role}
            onChange={(e) => setForm((f) => ({ ...f, warehouse_role: e.target.value as WarehouseRole }))}
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
            value={form.display_order}
            onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) || 0 }))}
            className="w-full rounded-[14px] border px-3 py-2 text-sm outline-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </FieldRow>
      </div>

      <button
        onClick={onSave}
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
                employee.pin_is_default ? LEGACY_COLORS.yellow : LEGACY_COLORS.green
              } 18%, transparent)`,
              color: employee.pin_is_default ? LEGACY_COLORS.yellow : LEGACY_COLORS.green,
            }}
          >
            {employee.pin_is_default ? "기본 PIN (0000)" : "직원 설정 PIN"}
          </span>
        </div>
        <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          마지막 변경:{" "}
          {employee.pin_last_changed
            ? new Date(employee.pin_last_changed).toLocaleDateString("ko-KR")
            : "변경 이력 없음"}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          보안상 PIN 자체는 표시되지 않습니다. 직원이 PIN을 잊은 경우 아래 &apos;초기화&apos;로 0000로 되돌리세요.
        </p>
      </div>

      {/* PIN 초기화 / 비활성화 */}
      <div className="grid grid-cols-2 gap-2 border-t pt-4" style={{ borderColor: LEGACY_COLORS.border }}>
        <button
          onClick={() => onRequestPinReset(employee)}
          className="rounded-[14px] border px-3 py-2.5 text-sm font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.yellow }}
        >
          PIN 초기화
        </button>
        <button
          onClick={() => onToggle(employee)}
          className="rounded-[14px] px-3 py-2.5 text-sm font-bold text-white"
          style={{ background: employee.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
        >
          {employee.is_active ? "비활성화" : "활성화"}
        </button>
      </div>
      <button
        onClick={() => onRequestDelete(employee)}
        className="w-full rounded-[14px] border px-3 py-2.5 text-sm font-bold"
        style={{
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
          color: LEGACY_COLORS.red,
        }}
      >
        직원 삭제
      </button>
    </div>
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
