"use client";

import { Trash2 } from "lucide-react";
import {
  type DepartmentMaster,
  type DepartmentRole,
  type Employee,
  type ProductModel,
  type WarehouseRole,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AssignedModelsEditor } from "../AssignedModelsEditor";
import { useAdminEmployeesContext } from "../AdminEmployeesContext";
import {
  ASSEMBLY_DEPT,
  DEPARTMENT_ROLE_LABEL,
  WAREHOUSE_ROLE_LABEL,
} from "./employeeRoleLabels";
import { DetailCardSlot, FieldRow, SelectInput, TextInput } from "./employeeDetailPrimitives";

interface EmployeeDetailGridProps {
  employee: Employee;
  form: ReturnType<typeof useAdminEmployeesContext>["editForm"];
  setForm: ReturnType<typeof useAdminEmployeesContext>["setEditForm"];
  departments: DepartmentMaster[];
  productModels: ProductModel[];
  onRequestPinReset: (e: Employee) => void;
  onToggle: (e: Employee) => void;
  onRequestDelete: (e: Employee) => void;
}

export function EmployeeDetailGrid({
  employee,
  form,
  setForm,
  departments,
  productModels,
  onRequestPinReset,
  onToggle,
  onRequestDelete,
}: EmployeeDetailGridProps) {
  const whMeta = WAREHOUSE_ROLE_LABEL[form.warehouse_role];
  const deptMeta = DEPARTMENT_ROLE_LABEL[form.department_role];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* 카드 1: 기본 정보 */}
      <DetailCardSlot title="기본 정보">
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="이름" htmlFor="emp-edit-name">
            <TextInput
              id="emp-edit-name"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            />
          </FieldRow>
          <FieldRow label="직급" htmlFor="emp-edit-role">
            <TextInput
              id="emp-edit-role"
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v }))}
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
          <FieldRow label="연락처" htmlFor="emp-edit-phone">
            <TextInput
              id="emp-edit-phone"
              value={form.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            />
          </FieldRow>
        </div>
      </DetailCardSlot>

      {/* 카드 2: 권한 */}
      <DetailCardSlot title="권한">
        <div className="flex flex-col gap-3">
          <FieldRow label="창고 결재 역할">
            <SelectInput
              value={form.warehouse_role}
              onChange={(v) => setForm((f) => ({ ...f, warehouse_role: v as WarehouseRole }))}
              options={(["none", "primary", "deputy"] as WarehouseRole[]).map((r) => ({
                value: r,
                label: WAREHOUSE_ROLE_LABEL[r].label,
              }))}
            />
            <div
              className="mt-1.5 text-[11px]"
              style={{ color: whMeta.tone }}
            >
              {whMeta.hint}
            </div>
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
            <div
              className="mt-1.5 text-[11px]"
              style={{ color: deptMeta.tone }}
            >
              {deptMeta.hint}
            </div>
          </FieldRow>
          <FieldRow label="입출고 권한">
            <label className="inline-flex cursor-pointer items-center gap-3 py-1">
              <input
                type="checkbox"
                checked={form.io_enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, io_enabled: e.target.checked }))
                }
                className="h-4 w-4 cursor-pointer rounded border"
                style={{
                  accentColor: LEGACY_COLORS.blue,
                  borderColor: LEGACY_COLORS.border,
                }}
              />
              <span
                className="text-[13px]"
                style={{ color: LEGACY_COLORS.text }}
              >
                입출고 화면 접근 허용
              </span>
            </label>
            <div className="mt-1.5 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
              직원 개별 권한. 체크 해제 시 입출고 화면 접근 차단.
            </div>
          </FieldRow>
        </div>
      </DetailCardSlot>

      {/* 카드 3: PIN */}
      <DetailCardSlot title="PIN">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
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
          <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
            마지막 변경:{" "}
            {employee.pin_last_changed
              ? new Date(employee.pin_last_changed).toLocaleDateString("ko-KR")
              : "변경 이력 없음"}
          </div>
          <button
            type="button"
            onClick={() => onRequestPinReset(employee)}
            className="mt-1 rounded-[10px] border px-3 py-2 text-[12px] font-bold transition-colors hover:brightness-110"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 35%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            PIN 초기화 (0000)
          </button>
        </div>
      </DetailCardSlot>

      {/* 카드 4: 상태 */}
      <DetailCardSlot title="상태">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onToggle(employee)}
            className="rounded-[10px] px-3 py-2 text-[12px] font-bold text-white transition-colors hover:brightness-110"
            style={{ background: employee.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
          >
            {employee.is_active ? "직원 비활성화" : "직원 활성화"}
          </button>
          <button
            type="button"
            onClick={() => onRequestDelete(employee)}
            className="flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-[12px] font-bold transition-colors hover:brightness-110"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            직원 삭제
          </button>
        </div>
      </DetailCardSlot>

      {/* 카드 5: 담당 모델 — 조립 부서일 때만 노출. 입출고 화면에서 조립 그룹 내 정렬 우선순위로 사용. */}
      {form.department === ASSEMBLY_DEPT ? (
        <div className="lg:col-span-2">
          <DetailCardSlot title="담당 모델 (우선순위 순)">
            <AssignedModelsEditor
              models={productModels}
              selected={form.assigned_model_slots}
              onChange={(next) => setForm((f) => ({ ...f, assigned_model_slots: next }))}
            />
          </DetailCardSlot>
        </div>
      ) : null}
    </div>
  );
}
