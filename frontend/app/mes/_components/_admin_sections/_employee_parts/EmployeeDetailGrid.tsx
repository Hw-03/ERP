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
import { SIDEBAR_TAB_IDS, setSidebarTabVisible, type SidebarTabId } from "../../tabAccess";
import { SIDEBAR_TAB_META } from "../../sidebarTabMeta";
import styles from "../_admin_primitives/AdminMasterData.module.css";


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
      <div className={`grid min-h-0 flex-1 gap-4 lg:grid-cols-2 xl:items-stretch ${styles.employeeCards}`}>

      {/* 카드 2: 결재 권한 */}
      <DetailCardSlot title="결재 권한" className="h-full">
        <div className="flex flex-1 flex-col justify-between gap-4">
          <FieldRow label="창고 결재 역할">
            <SelectInput
              value={form.warehouse_role}
              onChange={(v) => setForm((f) => ({ ...f, warehouse_role: v as WarehouseRole }))}
              options={(["none", "primary", "deputy"] as WarehouseRole[]).map((r) => ({
                value: r,
                label: `${WAREHOUSE_ROLE_LABEL[r].label} · ${WAREHOUSE_ROLE_LABEL[r].hint}`,
              }))}
            />
          </FieldRow>
          <FieldRow label="부서 결재 역할">
            <SelectInput
              value={form.department_role}
              onChange={(v) => setForm((f) => ({ ...f, department_role: v as DepartmentRole }))}
              options={(["none", "primary", "deputy"] as DepartmentRole[]).map((r) => ({
                value: r,
                label: `${DEPARTMENT_ROLE_LABEL[r].label} · ${DEPARTMENT_ROLE_LABEL[r].hint}`,
              }))}
            />
          </FieldRow>
          <FieldRow label="AS·연구 승인 권한">
            <label className="flex min-h-12 min-w-0 cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
              <input
                type="checkbox"
                aria-label="AS·연구 승인 권한"
                checked={form.as_research_approver}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((f) => ({ ...f, as_research_approver: checked }));
                }}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border"
                style={{ accentColor: LEGACY_COLORS.blue, borderColor: LEGACY_COLORS.border }}
              />
              <span className="min-w-0 truncate text-[14px] leading-5" style={{ color: LEGACY_COLORS.muted2 }}>
                AR·AA 출고 승인
              </span>
            </label>
          </FieldRow>
        </div>
      </DetailCardSlot>

      <DetailCardSlot title="직원에게 보이는 메뉴">
            <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2">
              {SIDEBAR_TAB_IDS.map((tab) => {
                const { icon: Icon, label, color } = SIDEBAR_TAB_META[tab];
                const selected = !hiddenTabs.has(tab);
                return (
                  <label
                    key={tab}
                    className="flex min-h-12 cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--c-blue)]"
                    style={{
                      background: selected
                        ? LEGACY_COLORS.s1
                        : `color-mix(in srgb, ${LEGACY_COLORS.blue} 4%, ${LEGACY_COLORS.s1})`,
                      borderColor: selected
                        ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 24%, ${LEGACY_COLORS.border})`
                        : LEGACY_COLORS.border,
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0 transition-colors duration-150" style={{ color: selected ? color : LEGACY_COLORS.muted2 }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-sm transition-colors duration-150" style={{ color: selected ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>{label}</span>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => toggleSidebarTab(tab, e.target.checked)}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border"
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

      {/* 조립 담당 모델 다음에 계정 작업을 일반 본문 흐름으로 배치한다. */}
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

      <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">
        <DetailCardSlot
          title="PIN"
          headerAccessory={(
            <div className="flex items-center gap-2 text-[12px] normal-case tracking-normal">
              <span
                className="rounded-full px-2.5 py-0.5 text-[12px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${
                    employee.pin_is_default ? LEGACY_COLORS.yellow : LEGACY_COLORS.green
                  } 18%, transparent)`,
                  color: employee.pin_is_default ? LEGACY_COLORS.yellow : LEGACY_COLORS.green,
                }}
              >
                {employee.pin_is_default ? "기본 PIN (0000)" : "직원 설정 PIN"}
              </span>
              <span style={{ color: LEGACY_COLORS.muted2 }}>
              마지막 변경:{" "}
              {employee.pin_last_changed
                ? new Date(employee.pin_last_changed).toLocaleDateString("ko-KR")
                : "변경 이력 없음"}
              </span>
            </div>
          )}
        >
          <button
            type="button"
            onClick={() => onRequestPinReset(employee)}
            className="standard-hover mt-auto min-h-12 self-start rounded-[10px] border px-4 py-2 text-[14px] font-bold transition-colors active:scale-[0.98]"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 35%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            PIN 초기화 (0000)
          </button>
        </DetailCardSlot>

        <DetailCardSlot title="계정 상태 및 위험 작업">
          <div className="mt-auto flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onToggle(employee)}
              className="standard-hover min-h-12 flex-1 rounded-[10px] px-3 py-2 text-[14px] font-bold text-white transition-colors active:scale-[0.98]"
              style={{ background: employee.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
            >
              {employee.is_active ? "직원 비활성화" : "직원 활성화"}
            </button>
            <button
              type="button"
              onClick={() => onRequestDelete(employee)}
              className="standard-hover flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-[14px] font-bold transition-colors active:scale-[0.98]"
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
      </div>

      </div>
    </div>
  );
}
