"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Users, X } from "lucide-react";
import { api, type DepartmentMaster, type DepartmentRole, type Employee, type EmployeeLevel, type ProductModel, type WarehouseRole } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment, getDepartmentFallbackColor } from "@/lib/mes/department";
import { Button } from "@/lib/ui/Button";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { EmptyState } from "../common";
import { AppSelect } from "../common/AppSelect";
import { StatusPill } from "../common/StatusPill";
import {
  AdminDetailCard,
  AdminKpiBar,
  AdminListPanel,
  AdminPageHeader,
} from "./_admin_primitives";
import { useAdminEmployeesContext } from "./AdminEmployeesContext";
import { AssignedModelsEditor } from "./AssignedModelsEditor";
import { useRegisterDirty, useLocalDirtyGuard } from "@/lib/ui/dirty-guard";

const ASSEMBLY_DEPT = "조립";

const WAREHOUSE_ROLE_LABEL: Record<WarehouseRole, { label: string; hint: string; tone: string }> = {
  none: { label: "없음", hint: "기본 작업만 수행", tone: LEGACY_COLORS.muted2 },
  primary: { label: "정", hint: "창고 주담당 결재", tone: LEGACY_COLORS.blue },
  deputy: { label: "부", hint: "보조 결재 가능", tone: LEGACY_COLORS.cyan },
};

const DEPARTMENT_ROLE_LABEL: Record<DepartmentRole, { label: string; hint: string; tone: string }> = {
  none: { label: "없음", hint: "기본 작업만 수행", tone: LEGACY_COLORS.muted2 },
  primary: { label: "정", hint: "부서 주담당 결재", tone: LEGACY_COLORS.green },
  deputy: { label: "부", hint: "보조 결재 가능", tone: LEGACY_COLORS.purple },
};

const LEVEL_LABEL: Record<string, { label: string; hint: string; tone: string }> = {
  admin: { label: "관리자", hint: "전체 시스템 관리 권한", tone: LEGACY_COLORS.red },
  manager: { label: "매니저", hint: "부서 운영·데이터 수정", tone: LEGACY_COLORS.purple },
  staff: { label: "사원", hint: "기본 작업 권한", tone: LEGACY_COLORS.muted2 },
};

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
    addEmployee,
    toggleEmployee,
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
    dirty,
  } = ctx;

  // 활성 섹션 dirty/save 를 상위 registry 에 등록 (탭/사이드바 가드).
  useRegisterDirty("employees", dirty, saveEmployee);
  // 항목 변경(트리거 a) 가드 — 같은 페이지에서 다른 직원 선택.
  const { confirmNavigation } = useLocalDirtyGuard(dirty, saveEmployee);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");
  const [productModels, setProductModels] = useState<ProductModel[]>([]);

  useEffect(() => {
    void api.getModels().then((models) =>
      setProductModels(models.filter((m) => !m.is_reserved && (m.model_name || m.symbol))),
    );
  }, []);

  const deptOptions = useMemo(() => {
    const seen = new Set<string>();
    employees.forEach((e) => {
      if (e.department) seen.add(normalizeDepartment(e.department));
    });
    return ["ALL", ...Array.from(seen).sort()];
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((e) => deptFilter === "ALL" || normalizeDepartment(e.department) === deptFilter)
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          normalizeDepartment(e.department).toLowerCase().includes(q) ||
          (e.role ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [employees, search, deptFilter]);

  // KPI 4개
  const stats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let mgrOrWh = 0;
    for (const e of employees) {
      if (e.is_active) active += 1;
      else inactive += 1;
      if (e.level === "admin" || e.warehouse_role !== "none") mgrOrWh += 1;
    }
    return { active, inactive, mgrOrWh };
  }, [employees]);

  // 첫 활성 직원 자동 선택
  useEffect(() => {
    if (empAddMode) return;
    if (selectedEmployee) return;
    if (filteredEmployees.length === 0) return;
    setSelectedEmployee(filteredEmployees[0]);
  }, [empAddMode, selectedEmployee, filteredEmployees, setSelectedEmployee]);

  function handleStartAdd() {
    confirmNavigation(() => {
      setEmpAddMode(true);
      setSelectedEmployee(null);
    });
  }

  function handleSelectEmployee(employee: Employee) {
    confirmNavigation(() => {
      setSelectedEmployee(employee);
      setEmpAddMode(false);
    });
  }

  return (
    <>
      <div className="flex min-h-0 flex-col">
        <AdminPageHeader
          icon={Users}
          title="직원 관리"
          description="직원 정보·권한·PIN을 등록하고 관리합니다."
          actions={
            <Button variant="primary" size="md" iconLeft={<Plus className="h-4 w-4" />} onClick={handleStartAdd}>
              직원 추가
            </Button>
          }
        />

        <AdminKpiBar
          items={[
            { key: "all", label: "전체 직원", value: employees.length, hint: "등록된 모든 직원", tone: LEGACY_COLORS.blue },
            { key: "active", label: "활성", value: stats.active, hint: "근무 중", tone: LEGACY_COLORS.green },
            { key: "inactive", label: "비활성", value: stats.inactive, hint: "사용 중지", tone: LEGACY_COLORS.muted2 },
            { key: "mgr", label: "관리자·창고담당", value: stats.mgrOrWh, hint: "특별 권한 보유", tone: LEGACY_COLORS.purple },
          ]}
        />

        <div className="flex min-h-0 flex-1 gap-4">
          <AdminListPanel
            title="직원 목록"
            countLabel={`${filteredEmployees.length}명`}
            width={320}
            searchValue={search}
            searchPlaceholder="이름·부서·역할 검색"
            onSearchChange={setSearch}
            filters={
              <AppSelect
                value={deptFilter}
                onChange={setDeptFilter}
                options={deptOptions.map((d) => ({ value: d, label: d === "ALL" ? "전체 부서" : d }))}
                size="sm"
                triggerStyle={{ background: LEGACY_COLORS.s2 }}
              />
            }
            items={filteredEmployees}
            emptyState={
              <EmptyState
                variant={search ? "no-search-result" : "no-data"}
                compact
                title={search ? "검색 결과가 없습니다." : "직원이 없습니다."}
              />
            }
            renderItem={(employee) => {
              const active = selectedEmployee?.employee_id === employee.employee_id;
              const deptName = normalizeDepartment(employee.department);
              const deptColor = getDepartmentFallbackColor(deptName);
              return (
                <button
                  key={employee.employee_id}
                  type="button"
                  onClick={() => handleSelectEmployee(employee)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left transition-colors hover:brightness-[1.04]"
                  style={{
                    background: active
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                      : LEGACY_COLORS.s2,
                    borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: deptColor }}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[13px] font-bold"
                      style={{ color: LEGACY_COLORS.text }}
                    >
                      {employee.name}
                    </div>
                    <div
                      className="truncate text-[11px]"
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      {deptName}
                      {employee.role ? ` · ${employee.role}` : ""}
                    </div>
                  </div>
                  <StatusPill
                    label={employee.is_active ? "활성" : "비활성"}
                    tone={employee.is_active ? "success" : "neutral"}
                    showDot
                    maxWidth={70}
                  />
                </button>
              );
            }}
          />

          <AdminDetailCard
            title={
              empAddMode
                ? "직원 추가"
                : selectedEmployee
                  ? selectedEmployee.name
                  : "직원을 선택하세요"
            }
            subtitle={
              !empAddMode && selectedEmployee
                ? `${normalizeDepartment(selectedEmployee.department)}${
                    selectedEmployee.role ? ` · ${selectedEmployee.role}` : ""
                  }`
                : undefined
            }
            status={
              !empAddMode && selectedEmployee ? (
                <StatusPill
                  label={selectedEmployee.is_active ? "활성" : "비활성"}
                  tone={selectedEmployee.is_active ? "success" : "neutral"}
                />
              ) : null
            }
            actions={
              empAddMode ? (
                <Button variant="secondary" size="sm" iconLeft={<X className="h-3.5 w-3.5" />} onClick={() => setEmpAddMode(false)}>
                  취소
                </Button>
              ) : selectedEmployee ? (
                <Button variant="primary" size="sm" iconLeft={<Save className="h-3.5 w-3.5" />} onClick={saveEmployee}>
                  저장
                </Button>
              ) : null
            }
          >
            {empAddMode ? (
              <EmployeeAddInline
                form={empAddForm}
                setForm={setEmpAddForm}
                departments={departments}
                productModels={productModels}
                onSubmit={addEmployee}
              />
            ) : selectedEmployee ? (
              <EmployeeDetailGrid
                employee={selectedEmployee}
                form={editForm}
                setForm={setEditForm}
                departments={departments}
                productModels={productModels}
                onRequestPinReset={requestPinReset}
                onToggle={toggleEmployee}
                onRequestDelete={requestDelete}
              />
            ) : (
              <EmptyState
                variant="no-data"
                title="좌측에서 직원을 선택하세요"
                description="직원을 클릭하면 권한·PIN·상태 정보를 확인할 수 있습니다."
              />
            )}
          </AdminDetailCard>
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
          <div
            className="mb-1 text-xs font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
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
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
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

interface EmployeeAddInlineProps {
  form: ReturnType<typeof useAdminEmployeesContext>["empAddForm"];
  setForm: ReturnType<typeof useAdminEmployeesContext>["setEmpAddForm"];
  departments: DepartmentMaster[];
  productModels: ProductModel[];
  onSubmit: () => void;
}

function EmployeeAddInline({ form, setForm, departments, productModels, onSubmit }: EmployeeAddInlineProps) {
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
        <FieldRow label="역할" htmlFor="emp-add-role">
          <TextInput
            id="emp-add-role"
            value={form.role}
            onChange={(v) => setForm((f) => ({ ...f, role: v }))}
            placeholder="예: 조립/사원"
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

function EmployeeDetailGrid({
  employee,
  form,
  setForm,
  departments,
  productModels,
  onRequestPinReset,
  onToggle,
  onRequestDelete,
}: EmployeeDetailGridProps) {
  const levelMeta = LEVEL_LABEL[form.level] ?? LEVEL_LABEL.staff;
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
          <FieldRow label="역할" htmlFor="emp-edit-role">
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
          <FieldRow label="등급">
            <SelectInput
              value={form.level}
              onChange={(v) => setForm((f) => ({ ...f, level: v as EmployeeLevel }))}
              options={(["staff", "manager", "admin"] as EmployeeLevel[]).map((l) => ({
                value: l,
                label: LEVEL_LABEL[l].label,
              }))}
            />
            <div className="mt-1.5 text-[11px]" style={{ color: levelMeta.tone }}>
              {levelMeta.hint}
            </div>
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

function DetailCardSlot({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="mb-3 text-[11px] font-black uppercase tracking-[0.18em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldRow({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {label}
        {required && (
          <span className="ml-1" style={{ color: LEGACY_COLORS.red }}>
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:border-[var(--c-blue)]"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
        color: LEGACY_COLORS.text,
      }}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <AppSelect
      value={value}
      onChange={onChange}
      options={options}
      size="md"
      triggerStyle={{ background: LEGACY_COLORS.s1 }}
    />
  );
}
