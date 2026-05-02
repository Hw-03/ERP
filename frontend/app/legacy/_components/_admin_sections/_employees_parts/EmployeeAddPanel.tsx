"use client";

import { X } from "lucide-react";
import type { DepartmentMaster, WarehouseRole } from "@/lib/api";
import { LEGACY_COLORS } from "../../legacyUi";
import { EMPTY_EMPLOYEE_FORM, type EmployeeAddForm } from "../adminShared";

/**
 * 직원 추가 모드 우측 패널.
 *
 * Round-10B (#4) 추출. AdminEmployeesSection 우측에서 empAddMode === true 일 때
 * 표시되는 폼(직원코드/이름/역할/연락처/부서/창고결재) 영역을 분리.
 *
 * 시각/className/style 모두 그대로. EMPTY_EMPLOYEE_FORM 으로 reset 하는 cancel
 * 동작도 동일.
 */

const WAREHOUSE_ROLE_OPTIONS: { value: WarehouseRole; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "primary", label: "창고 정담당자" },
  { value: "deputy", label: "창고 부담당자" },
];

const TEXT_FIELDS: { key: keyof EmployeeAddForm; label: string; required: boolean; placeholder: string }[] = [
  { key: "employee_code", label: "직원 코드", required: true, placeholder: "예: E27" },
  { key: "name", label: "이름", required: true, placeholder: "예: 홍길동" },
  { key: "role", label: "역할", required: false, placeholder: "예: 조립/사원" },
  { key: "phone", label: "연락처", required: false, placeholder: "예: 010-0000-0000" },
];

interface Props {
  form: EmployeeAddForm;
  setForm: (updater: (f: EmployeeAddForm) => EmployeeAddForm) => void;
  departments: DepartmentMaster[];
  onClose: () => void;
  onSubmit: () => void;
}

export function EmployeeAddPanel({ form, setForm, departments, onClose, onSubmit }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-bold">직원 추가</div>
        <button
          onClick={() => {
            onClose();
            setForm(() => EMPTY_EMPLOYEE_FORM);
          }}
          className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
          style={{ color: LEGACY_COLORS.red }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {TEXT_FIELDS.map(({ key, label, required, placeholder }) => (
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
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
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
          value={form.department}
          onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
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
          value={form.warehouse_role}
          onChange={(e) => setForm((f) => ({ ...f, warehouse_role: e.target.value as WarehouseRole }))}
          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          {WAREHOUSE_ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <button
        onClick={onSubmit}
        className="w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
        style={{ background: LEGACY_COLORS.blue }}
      >
        추가
      </button>
    </div>
  );
}
