"use client";

import { type DepartmentMaster, type DepartmentRole, type ProductModel, type WarehouseRole } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AssignedModelsEditor } from "../AssignedModelsEditor";
import { useAdminEmployeesContext } from "../AdminEmployeesContext";
import {
  ASSEMBLY_DEPT,
  DEPARTMENT_ROLE_LABEL,
  employeePositionOptions,
  WAREHOUSE_ROLE_LABEL,
} from "./employeeRoleLabels";
import { FieldRow, SelectInput, TextInput } from "./employeeDetailPrimitives";

interface EmployeeAddInlineProps {
  form: ReturnType<typeof useAdminEmployeesContext>["empAddForm"];
  setForm: ReturnType<typeof useAdminEmployeesContext>["setEmpAddForm"];
  departments: DepartmentMaster[];
  productModels: ProductModel[];
  onSubmit: () => void;
}

export function EmployeeAddInline({ form, setForm, departments, productModels, onSubmit }: EmployeeAddInlineProps) {
  return (
    <form
      className="flex max-w-[520px] flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="이름" htmlFor="emp-add-name" required>
          <TextInput
            id="emp-add-name"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="예: 홍길동"
          />
        </FieldRow>
        <FieldRow label="직급">
          <SelectInput
            value={form.role}
            onChange={(v) => setForm((f) => ({ ...f, role: v }))}
            options={employeePositionOptions()}
            triggerAriaLabel="직급"
          />
        </FieldRow>
        <FieldRow label="연락처" htmlFor="emp-add-phone">
          <TextInput
            id="emp-add-phone"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder="예: 010-0000-0000"
          />
        </FieldRow>
        <FieldRow label="부서">
          <SelectInput
            value={form.department}
            onChange={(v) => setForm((f) => ({ ...f, department: v }))}
            options={departments
              .filter((d) => d.is_active)
              .map((d) => ({ value: d.name, label: d.name }))}
          />
        </FieldRow>
        <FieldRow label="창고 결재 역할">
          <SelectInput
            value={form.warehouse_role}
            onChange={(v) => setForm((f) => ({ ...f, warehouse_role: v as WarehouseRole }))}
            options={(["none", "primary", "deputy"] as WarehouseRole[]).map((r) => ({
              value: r,
              label: WAREHOUSE_ROLE_LABEL[r].label,
            }))}
          />
        </FieldRow>
        <FieldRow label="부서 결재 역할">
          <SelectInput
            value={form.department_role}
            onChange={(v) => setForm((f) => ({ ...f, department_role: v as DepartmentRole }))}
            options={(["none", "primary", "deputy"] as DepartmentRole[]).map((r) => ({
              value: r,
              label: DEPARTMENT_ROLE_LABEL[r].label,
            }))}
          />
        </FieldRow>
      </div>
      {form.department === ASSEMBLY_DEPT ? (
        <FieldRow label="담당 모델 (우선순위 순)">
          <AssignedModelsEditor
            models={productModels}
            selected={form.assigned_model_slots}
            onChange={(next) => setForm((f) => ({ ...f, assigned_model_slots: next }))}
          />
        </FieldRow>
      ) : null}
      <div
        className="rounded-[10px] border px-3 py-2 text-[12px]"
        style={{
          background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 25%, transparent)`,
          color: LEGACY_COLORS.muted2,
        }}
      >
        직원 코드는 등록 시 자동으로 부여됩니다. (관리자 모드 외부에 노출되지 않음)
      </div>
      <button
        type="submit"
        className="rounded-[12px] py-2.5 text-[14px] font-bold text-white transition-colors hover:brightness-110"
        style={{ background: LEGACY_COLORS.blue }}
      >
        직원 추가
      </button>
    </form>
  );
}
