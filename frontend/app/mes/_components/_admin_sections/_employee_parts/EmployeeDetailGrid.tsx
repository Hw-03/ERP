"use client";

import type { ReactNode } from "react";
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
  employeePositionOptions,
  WAREHOUSE_ROLE_LABEL,
} from "./employeeRoleLabels";
import { DetailCardSlot, FieldRow, SelectInput, TextInput } from "./employeeDetailPrimitives";
import { EmployeePermissionControl } from "./EmployeePermissionControl";
import { SIDEBAR_TAB_IDS, setSidebarTabVisible, type SidebarTabId } from "../../tabAccess";
import { SIDEBAR_TAB_META } from "../../sidebarTabMeta";
import styles from "../_admin_primitives/AdminMasterData.module.css";

const PERMISSION_TONES = { none: LEGACY_COLORS.muted2, primary: LEGACY_COLORS.blue, deputy: LEGACY_COLORS.purple };

interface EmployeeDetailGridProps {
  employee: Employee;
  headerActions?: ReactNode;
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
  headerActions,
  form,
  setForm,
  departments,
  productModels,
  onRequestPinReset,
  onToggle,
  onRequestDelete,
}: EmployeeDetailGridProps) {
  const hiddenTabs = new Set(form.hidden_sidebar_tabs);
  const toggleSidebarTab = (tab: SidebarTabId, checked: boolean) => {
    setForm((f) => ({
      ...f,
      hidden_sidebar_tabs: setSidebarTabVisible(f.hidden_sidebar_tabs, tab, checked),
    }));
  };
  return (
    <>
    <div className="flex min-h-full flex-col gap-3">
      {/* 카드 1: 기본 정보 */}
      <div className={styles.detailHeader}>
        <div role="group" aria-label="직원 기본 정보" className={styles.employeeFields}>
          <FieldRow label="사번">
            <div
              className="flex min-h-11 w-full items-center rounded-[12px] border px-3 py-2 text-[14px] font-bold"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            >
              {employee.employee_code}
            </div>
          </FieldRow>
          <FieldRow label="이름" htmlFor="emp-edit-name">
            <TextInput
              id="emp-edit-name"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
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
        {headerActions}
      </div>
      <div className={styles.employeeCards}>
      <div className={styles.employeeLeft}>

      {/* 카드 2: 결재 권한 */}
      <DetailCardSlot title="결재 권한">
        <div className={styles.employeePermissions}>
          <FieldRow label="창고 결재 권한">
            <EmployeePermissionControl
              key={employee.employee_id}
              label="창고 결재 권한"
              value={form.warehouse_role}
              onChange={(v) => setForm((f) => ({ ...f, warehouse_role: v as WarehouseRole }))}
              options={(["none", "primary", "deputy"] as WarehouseRole[]).map((r) => ({
                value: r,
                ...WAREHOUSE_ROLE_LABEL[r],
                tone: PERMISSION_TONES[r],
              }))}
            />
          </FieldRow>
          <FieldRow label="부서 결재 권한">
            <EmployeePermissionControl
              key={employee.employee_id}
              label="부서 결재 권한"
              value={form.department_role}
              onChange={(v) => setForm((f) => ({ ...f, department_role: v as DepartmentRole }))}
              options={(["none", "primary", "deputy"] as DepartmentRole[]).map((r) => ({
                value: r,
                ...DEPARTMENT_ROLE_LABEL[r],
                tone: PERMISSION_TONES[r],
              }))}
            />
          </FieldRow>
          <FieldRow label="AS·연구 승인 권한">
            <EmployeePermissionControl
              key={employee.employee_id}
              label="AS·연구 승인 권한"
              value={form.as_research_approver ? "approved" : "none"}
              onChange={(v) => setForm((f) => ({ ...f, as_research_approver: v === "approved" }))}
              options={[{ value: "none", label: "없음", hint: "출고 승인 권한 없음", tone: LEGACY_COLORS.muted2 }, { value: "approved", label: "승인", hint: "AR·AA 출고 승인", tone: LEGACY_COLORS.green }]}
            />
          </FieldRow>
        </div>
      </DetailCardSlot>

      <DetailCardSlot title="PIN·계정 관리" className="flex-1">
        <div className={styles.employeeAccountRows}>
        <div className={styles.employeeAccountRow}>
          <div className="flex min-w-0 flex-col items-start gap-2">
          <span className="rounded-full px-2.5 py-1 text-[14px] font-bold" style={{
            background: `color-mix(in srgb, ${employee.pin_is_default ? LEGACY_COLORS.yellow : LEGACY_COLORS.green} 18%, transparent)`,
            color: employee.pin_is_default ? LEGACY_COLORS.yellow : LEGACY_COLORS.green,
          }}>{employee.pin_is_default ? "기본 PIN (0000)" : "직원 설정 PIN"}</span>
          <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>마지막 변경: {employee.pin_last_changed ? new Date(employee.pin_last_changed).toLocaleDateString("ko-KR") : "변경 이력 없음"}</span>
          </div>
          <button type="button" onClick={() => onRequestPinReset(employee)}
            className="standard-hover min-h-12 shrink-0 rounded-[10px] border px-4 py-2 text-[14px] font-bold transition-colors active:scale-[0.98]"
            style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`, borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 35%, transparent)`, color: LEGACY_COLORS.yellow }}>
            PIN 초기화 (0000)
          </button>
        </div>
        <div className={styles.employeeAccountRow}>
          <div className="flex min-w-0 flex-col items-start gap-2">
            <span className="text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>계정 상태</span>
            <span className="flex items-center gap-2 text-[14px] font-bold" style={{ color: employee.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.muted2 }}>
              <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
              {employee.is_active ? "활성 계정" : "비활성 계정"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onToggle(employee)}
              className="standard-hover min-h-12 rounded-[10px] px-3 py-2 text-[14px] font-bold text-white transition-colors active:scale-[0.98]"
              style={{ background: employee.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green }}>
              {employee.is_active ? "직원 비활성화" : "직원 활성화"}
            </button>
            <button type="button" onClick={() => onRequestDelete(employee)}
              className="standard-hover flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-[14px] font-bold transition-colors active:scale-[0.98]"
              style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`, borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`, color: LEGACY_COLORS.red }}>
              <Trash2 className="h-3.5 w-3.5" />직원 삭제
            </button>
          </div>
        </div>
        </div>
      </DetailCardSlot>
      </div>

      <DetailCardSlot title="메뉴 표시" className="h-full">
            <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2">
              {SIDEBAR_TAB_IDS.map((tab) => {
                const { icon: Icon, label, color } = SIDEBAR_TAB_META[tab];
                const selected = !hiddenTabs.has(tab);
                return (
                  <label
                    key={tab}
                    className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--c-blue)]"
                    style={{
                      background: selected
                        ? LEGACY_COLORS.s1
                        : `color-mix(in srgb, ${LEGACY_COLORS.blue} 4%, ${LEGACY_COLORS.s1})`,
                      borderColor: selected
                        ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 24%, ${LEGACY_COLORS.border})`
                        : LEGACY_COLORS.border,
                    }}
                  >
                    <Icon className="h-5 w-5 shrink-0 transition-colors duration-150" style={{ color: selected ? color : LEGACY_COLORS.muted2 }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-base transition-colors duration-150" style={{ color: selected ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>{label}</span>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => toggleSidebarTab(tab, e.target.checked)}
                      className="h-5 w-5 shrink-0 cursor-pointer rounded border"
                      style={{
                        accentColor: LEGACY_COLORS.blue,
                        borderColor: LEGACY_COLORS.border,
                      }}
                    />
                  </label>
                );
              })}
            </div>
      </DetailCardSlot>

      </div>
    </div>

      {/* 조립 담당 모델은 두 열 아래의 전체 너비를 사용한다. */}
      {form.department === ASSEMBLY_DEPT ? (
        <div className="pt-3">
          <DetailCardSlot title="담당 모델 (우선순위 순)">
            <AssignedModelsEditor
              models={productModels}
              selected={form.assigned_model_slots}
              onChange={(next) => setForm((f) => ({ ...f, assigned_model_slots: next }))}
            />
          </DetailCardSlot>
        </div>
      ) : null}
    </>
  );
}
