"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Users, X } from "lucide-react";
import { type Employee, type ProductModel } from "@/lib/api";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { PIN_LENGTH } from "@/lib/auth/constants";
import { normalizeDepartment, resolveDepartmentColor } from "@/lib/mes/department";
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
import { useRegisterDirty, useLocalDirtyGuard } from "@/lib/ui/dirty-guard";
import { EmployeeAddInline } from "./_employee_parts/EmployeeAddInline";
import { EmployeeDetailGrid } from "./_employee_parts/EmployeeDetailGrid";
import { normalizeEmployeePosition } from "./_employee_parts/employeeRoleLabels";

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
  const { data: allModels } = useModelsQuery();
  const productModels = useMemo<ProductModel[]>(
    () => (allModels ?? []).filter((m) => !m.is_reserved && (m.model_name || m.symbol)),
    [allModels],
  );

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
      setEmpAddForm((form) => ({ ...form, role: form.role || "사원" }));
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
      <div className="flex min-h-0 flex-1 flex-col">
        <AdminPageHeader
          icon={Users}
          title="직원 관리"
          summary={
            <AdminKpiBar
              placement="header"
              items={[
                { key: "all", label: "전체 직원", value: employees.length, hint: "등록된 모든 직원", tone: LEGACY_COLORS.blue },
                { key: "active", label: "활성", value: stats.active, hint: "근무 중", tone: LEGACY_COLORS.green },
                { key: "inactive", label: "비활성", value: stats.inactive, hint: "사용 중지", tone: LEGACY_COLORS.muted2 },
              ]}
            />
          }
          actions={
            <Button variant="primary" size="md" iconLeft={<Plus className="h-4 w-4" />} onClick={handleStartAdd}>
              직원 추가
            </Button>
          }
        />

        <div className="flex min-h-0 flex-1 gap-4">
          <AdminListPanel
            title="직원 목록"
            countLabel={`${filteredEmployees.length}명`}
            width={288}
            searchValue={search}
            searchPlaceholder="이름·부서·직급 검색"
            onSearchChange={setSearch}
            action={
              <AppSelect
                value={deptFilter}
                onChange={setDeptFilter}
                options={deptOptions.map((d) => ({ value: d, label: d === "ALL" ? "전체 부서" : d }))}
                size="sm"
                className="w-[144px] shrink-0"
                triggerClassName="whitespace-nowrap"
                triggerAriaLabel="부서 필터"
                triggerStyle={{ background: LEGACY_COLORS.s2 }}
              />
            }
            listRole="grid"
            listAriaLabel="직원 목록"
            listClassName="flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5"
            listHeader={
              <div
                data-admin-list-header="employees"
                role="row"
                className="sticky top-0 z-10 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_76px] border-b px-3 py-2 text-[11px] font-bold tracking-[0.08em]"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
              >
                <span role="columnheader">이름</span>
                <span role="columnheader">부서·직급</span>
                <span role="columnheader" className="text-center">상태</span>
              </div>
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
              const deptName = normalizeDepartment(active ? editForm.department : employee.department);
              const position = active
                ? normalizeEmployeePosition(editForm.role)
                : employee.role
                  ? normalizeEmployeePosition(employee.role)
                  : "";
              const deptColor = resolveDepartmentColor(departments, deptName);
              return (
                <div
                  key={employee.employee_id}
                  role="row"
                  data-admin-employee-row={employee.employee_id}
                  onClick={() => handleSelectEmployee(employee)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    handleSelectEmployee(employee);
                  }}
                  aria-selected={active}
                  tabIndex={0}
                  className="grid w-full grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_76px] items-center border-b px-3 py-2 text-left transition-colors duration-150 hover:bg-[var(--c-s4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/30"
                  style={{
                    background: active
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                      : undefined,
                    borderColor: LEGACY_COLORS.border,
                  }}
                >
                  <div role="gridcell" className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: deptColor }}
                    />
                    <div
                      className="min-w-0 truncate text-[14px] font-bold"
                      style={{ color: LEGACY_COLORS.text }}
                    >
                      {employee.name}
                    </div>
                  </div>
                  <div
                    role="gridcell"
                    className="truncate text-[12px]"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    {deptName}
                    {position ? ` · ${position}` : ""}
                  </div>
                  <div role="gridcell" className="flex justify-center">
                  <StatusPill
                    label={employee.is_active ? "활성" : "비활성"}
                    tone={employee.is_active ? "success" : "neutral"}
                    showDot
                    maxWidth={70}
                  />
                  </div>
                </div>
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
                ? `${normalizeDepartment(editForm.department)}${
                    editForm.role ? ` · ${normalizeEmployeePosition(editForm.role)}` : ""
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
        confirmDisabled={pinResetAdminPin.length !== PIN_LENGTH}
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
            pattern="\d{4}"
            maxLength={PIN_LENGTH}
            value={pinResetAdminPin}
            onChange={(e) => setPinResetAdminPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
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
