"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Plus, Save, X } from "lucide-react";
import type { DepartmentMaster, Employee, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { PROCESS_TO_DEPT } from "@/lib/mes/process";
import { Button } from "@/lib/ui/Button";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { EmptyState } from "../common";
import { matchesSearchText } from "@/lib/searchText";
import { FilterChip } from "../common/FilterChip";
import { StatusPill } from "../common/StatusPill";
import {
  AdminDetailCard,
  AdminKpiBar,
  AdminListPanel,
  AdminPageHeader,
} from "./_admin_primitives";
import { useAdminDepartmentsContext } from "./AdminDepartmentsContext";
import { useRegisterDirty, useLocalDirtyGuard } from "@/lib/ui/dirty-guard";
import { deptColor } from "./_department_parts/departmentColors";
import { DeptAddForm } from "./_department_parts/DeptAddForm";
import { DeptDetailView } from "./_department_parts/DeptDetailView";

interface Props {
  employees: Employee[];
  items: Item[];
}

export function AdminDepartmentsSection({
  employees,
  items,
}: Props) {
  const {
    departments,
    addName,
    setAddName,
    addDepartmentMaster,
    deactivateDepartmentMaster,
    reactivateDepartmentMaster,
    hardDeleteDepartment,
    selectedDept,
    setSelectedDept,
    detailForm,
    setDetailForm,
    saveDepartment,
    dirty,
  } = useAdminDepartmentsContext();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [addMode, setAddMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentMaster | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const readableBlue = `color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, ${LEGACY_COLORS.text})`;
  const readableGreen = `color-mix(in srgb, ${LEGACY_COLORS.green} 30%, ${LEGACY_COLORS.text})`;
  const readableMuted = `color-mix(in srgb, ${LEGACY_COLORS.muted2} 30%, ${LEGACY_COLORS.text})`;
  const accessiblePrimaryBackground = `color-mix(in srgb, ${LEGACY_COLORS.blueSolid} 98%, ${LEGACY_COLORS.text})`;
  const persistDepartment = async () => {
    while ((await saveDepartment()).status === "saved") {
      // A save can finish with newer edits still dirty; persist them before navigation.
    }
  };
  useRegisterDirty("departments", dirty, persistDepartment);
  const { confirmNavigation } = useLocalDirtyGuard(dirty, persistDepartment);

  const empCountByDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      const key = normalizeDepartment(e.department);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [employees]);

  const itemCountByDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const mappedDepartment = it.process_type_code
        ? PROCESS_TO_DEPT[it.process_type_code]
        : null;
      const dept = mappedDepartment ? normalizeDepartment(mappedDepartment) : null;
      if (!dept) continue;
      map.set(dept, (map.get(dept) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const filteredDepartments = useMemo(() => {
    return departments
      .filter((d) => {
        if (statusFilter === "active" && !d.is_active) return false;
        if (statusFilter === "inactive" && d.is_active) return false;
        return true;
      })
      .filter((d) => matchesSearchText(d.name, search));
  }, [departments, statusFilter, search]);

  const stats = useMemo(() => {
    const active = departments.filter((d) => d.is_active).length;
    return {
      active,
      inactive: departments.length - active,
      employees: employees.length,
    };
  }, [departments, employees]);

  // 첫 활성 부서 자동 선택
  useEffect(() => {
    if (addMode) return;
    if (selectedDept) return;
    if (filteredDepartments.length === 0) return;
    setSelectedDept(filteredDepartments[0]);
  }, [addMode, selectedDept, filteredDepartments, setSelectedDept]);

  function handleStartAdd() {
    confirmNavigation(() => {
      setAddMode(true);
      setSelectedDept(null);
    });
  }

  function handleSubmitAdd() {
    if (!addName.trim()) return;
    void addDepartmentMaster().then((created) => {
      if (!created) return;
      setAddMode(false);
      setSelectedDept(created);
    });
  }

  function handleSelect(dept: DepartmentMaster) {
    confirmNavigation(() => {
      setAddMode(false);
      setSelectedDept(selectedDept?.id === dept.id ? null : dept);
    });
  }

  async function handleToggleActive(dept: DepartmentMaster) {
    if (dept.is_active) await deactivateDepartmentMaster(dept.id);
    else await reactivateDepartmentMaster(dept.id);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const deleted = await hardDeleteDepartment(deleteTarget.id);
    if (deleted) setDeleteTarget(null);
  }

  function closeDeleteConfirm() {
    setDeleteTarget(null);
    requestAnimationFrame(() => {
      if (deleteButtonRef.current?.isConnected) deleteButtonRef.current.focus();
    });
  }

  return (
    <>
      <div data-testid="admin-departments-section" className="flex min-h-0 flex-1 flex-col">
        <AdminPageHeader
          icon={Building2}
          title="부서 관리"
          summary={
            <AdminKpiBar
              placement="header"
              items={[
                { key: "all", label: "전체 부서", value: departments.length, hint: "등록된 부서 수", tone: LEGACY_COLORS.blue, textTone: readableBlue },
                { key: "active", label: "사용 중", value: stats.active, hint: "활성 부서", tone: LEGACY_COLORS.green, textTone: readableGreen },
                { key: "inactive", label: "비활성", value: stats.inactive, hint: "사용 중지", tone: LEGACY_COLORS.muted2, textTone: readableMuted },
              ]}
            />
          }
          actions={
            <Button variant="primary" size="md" iconLeft={<Plus className="h-4 w-4" />} onClick={handleStartAdd} style={{ background: accessiblePrimaryBackground }}>
              부서 추가
            </Button>
          }
        />

        <div className="flex min-h-0 flex-1 gap-4">
          <AdminListPanel
            title="부서 목록"
            countLabel={`${filteredDepartments.length}개`}
            width={336}
            searchValue={search}
            searchPlaceholder="부서명 검색"
            onSearchChange={setSearch}
            filters={
              <>
                <FilterChip active={statusFilter === "all"} label="전체" onClick={() => setStatusFilter("all")} size="sm" textTone={readableBlue} />
                <FilterChip active={statusFilter === "active"} label="사용 중" onClick={() => setStatusFilter("active")} size="sm" tone={LEGACY_COLORS.green} textTone={readableGreen} />
                <FilterChip active={statusFilter === "inactive"} label="비활성" onClick={() => setStatusFilter("inactive")} size="sm" textTone={readableBlue} />
              </>
            }
            listRole="grid"
            listAriaLabel="부서 목록"
            listClassName="flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5"
            listHeader={
              <div
                data-admin-list-header="departments"
                role="row"
                className="sticky top-0 z-10 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_88px] border-b px-3 py-2 text-[11px] font-bold tracking-[0.08em]"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
              >
                <span role="columnheader">부서명</span>
                <span role="columnheader">코드·소속 직원</span>
                <span role="columnheader" className="text-center">상태</span>
              </div>
            }
            items={filteredDepartments}
            emptyState={
              <EmptyState
                variant={search ? "no-search-result" : "no-data"}
                compact
                title={search ? "검색 결과가 없습니다." : "부서가 없습니다."}
              />
            }
            renderItem={(dept) => {
              const active = selectedDept?.id === dept.id;
              const color = deptColor(dept);
              const empCount = empCountByDept.get(normalizeDepartment(dept.name)) ?? 0;
              return (
                <div
                  key={dept.id}
                  role="row"
                  data-admin-department-row={dept.id}
                  onClick={() => handleSelect(dept)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    handleSelect(dept);
                  }}
                  aria-selected={active}
                  tabIndex={0}
                  className="grid w-full grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_88px] items-center border-b px-3 py-2 text-left transition-colors duration-150 hover:bg-[var(--c-s4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/30"
                  style={{
                    background: active
                      ? `color-mix(in srgb, ${color} 14%, transparent)`
                      : undefined,
                    borderColor: LEGACY_COLORS.border,
                    opacity: dept.is_active ? 1 : 0.65,
                  }}
                >
                  <div role="gridcell" className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <div className="min-w-0 truncate text-[14px] font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {dept.name}
                    </div>
                  </div>
                  <div role="gridcell" className="truncate text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    DPT-{String(dept.id).padStart(2, "0")} · {empCount}명
                  </div>
                  <div role="gridcell" className="flex justify-center">
                    <StatusPill
                      label={dept.is_active ? "사용 중" : "비활성"}
                      tone={dept.is_active ? "success" : "neutral"}
                      textTone={dept.is_active ? readableGreen : readableMuted}
                      showDot
                      maxWidth={84}
                    />
                  </div>
                </div>
              );
            }}
          />

          <AdminDetailCard
            title={
              addMode
                ? "새 부서 추가"
                : selectedDept
                  ? selectedDept.name
                  : "부서를 선택하세요"
            }
            subtitle={
              !addMode && selectedDept ? `DPT-${String(selectedDept.id).padStart(2, "0")}` : undefined
            }
            status={
              !addMode && selectedDept ? (
                <StatusPill
                  label={selectedDept.is_active ? "사용 중" : "비활성"}
                  tone={selectedDept.is_active ? "success" : "neutral"}
                  textTone={selectedDept.is_active ? readableGreen : readableMuted}
                />
              ) : null
            }
            actions={
              addMode ? (
                <Button variant="secondary" size="sm" iconLeft={<X className="h-3.5 w-3.5" />} onClick={() => setAddMode(false)}>
                  취소
                </Button>
              ) : selectedDept ? (
                <Button variant="primary" size="md" className="h-11 min-w-[88px]" iconLeft={<Save className="h-4 w-4" />} onClick={() => void saveDepartment().catch(() => undefined)} style={{ background: accessiblePrimaryBackground }}>
                  저장
                </Button>
              ) : null
            }
          >
            {addMode ? (
              <DeptAddForm value={addName} onChange={setAddName} onSubmit={handleSubmitAdd} />
            ) : selectedDept ? (
              <DeptDetailView
                key={selectedDept.id}
                dept={selectedDept}
                editForm={detailForm}
                setEditForm={setDetailForm}
                empCount={empCountByDept.get(normalizeDepartment(selectedDept.name)) ?? 0}
                itemCount={itemCountByDept.get(normalizeDepartment(selectedDept.name)) ?? 0}
                deptEmployees={employees.filter(
                  (e) => normalizeDepartment(e.department) === normalizeDepartment(selectedDept.name),
                )}
                onToggleActive={() => handleToggleActive(selectedDept)}
                onRequestDelete={() => setDeleteTarget(selectedDept)}
                deleteButtonRef={deleteButtonRef}
              />
            ) : (
              <EmptyState
                variant="no-data"
                title="좌측에서 부서를 선택하세요"
                description="부서를 클릭하면 상세 정보·색상 변경·소속 직원을 확인할 수 있습니다."
              />
            )}
          </AdminDetailCard>
        </div>
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title={`'${deleteTarget?.name}' 부서를 영구 삭제하시겠습니까?`}
        tone="danger"
        cautionMessage="이 작업은 되돌릴 수 없습니다. 부서에 속한 직원과 품목 매핑은 유지되지만, 부서명 참조가 사라집니다."
        confirmLabel="삭제"
        onClose={closeDeleteConfirm}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
