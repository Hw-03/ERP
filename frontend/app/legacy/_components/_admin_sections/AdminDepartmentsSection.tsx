"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Palette, Plus, Trash2, X } from "lucide-react";
import {
  api,
  type DepartmentMaster,
  type Employee,
  type Item,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getDepartmentFallbackColor, normalizeDepartment } from "@/lib/mes/department";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { EmptyState } from "../common";
import { FilterChip } from "../common/FilterChip";
import { StatusPill } from "../common/StatusPill";
import {
  AdminDetailCard,
  AdminKpiBar,
  AdminListPanel,
  AdminPageHeader,
} from "./_admin_primitives";
import { useAdminDepartmentsContext } from "./AdminDepartmentsContext";
import { useRefreshDepartments } from "../DepartmentsContext";

function deptColor(d: DepartmentMaster): string {
  return d.color_hex ?? getDepartmentFallbackColor(d.name);
}

interface Props {
  employees: Employee[];
  items: Item[];
  adminPin: string;
  setDepartments: (updater: (prev: DepartmentMaster[]) => DepartmentMaster[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
}

export function AdminDepartmentsSection({
  employees,
  items,
  adminPin,
  setDepartments,
  onStatusChange,
  onError,
}: Props) {
  const {
    departments,
    addName,
    setAddName,
    addDepartmentMaster,
    selectedDept,
    setSelectedDept,
  } = useAdminDepartmentsContext();
  const refreshDepartments = useRefreshDepartments();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [addMode, setAddMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentMaster | null>(null);

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
      const dept = it.department ? normalizeDepartment(String(it.department)) : null;
      if (!dept) continue;
      map.set(dept, (map.get(dept) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return departments
      .filter((d) => {
        if (statusFilter === "active" && !d.is_active) return false;
        if (statusFilter === "inactive" && d.is_active) return false;
        return true;
      })
      .filter((d) => !q || d.name.toLowerCase().includes(q));
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
    setAddMode(true);
    setSelectedDept(null);
  }

  function handleSubmitAdd() {
    if (!addName.trim()) return;
    addDepartmentMaster();
    setAddMode(false);
  }

  function handleSelect(dept: DepartmentMaster) {
    setAddMode(false);
    setSelectedDept(selectedDept?.id === dept.id ? null : dept);
  }

  async function handleToggleActive(dept: DepartmentMaster) {
    try {
      const updated = await api.updateDepartment(dept.id, {
        is_active: !dept.is_active,
        pin: adminPin,
      });
      setDepartments((prev) => prev.map((d) => (d.id === dept.id ? updated : d)));
      setSelectedDept(updated);
      onStatusChange(`'${dept.name}' 부서를 ${updated.is_active ? "활성화" : "비활성화"}했습니다.`);
      void refreshDepartments();
    } catch (err) {
      onError(err instanceof Error ? err.message : "상태 변경 실패");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.deleteDepartment(deleteTarget.id, adminPin);
      setDepartments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setSelectedDept(null);
      onStatusChange(`'${deleteTarget.name}' 부서를 삭제했습니다.`);
      void refreshDepartments();
    } catch (err) {
      onError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-col">
        <AdminPageHeader
          icon={Building2}
          title="부서 관리"
          description="조직의 부서를 관리하고 색상·구성원을 설정합니다."
          actions={
            <button
              type="button"
              onClick={handleStartAdd}
              className="flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:brightness-110"
              style={{ background: LEGACY_COLORS.blue }}
            >
              <Plus className="h-4 w-4" />
              부서 추가
            </button>
          }
        />

        <AdminKpiBar
          items={[
            { key: "all", label: "전체 부서", value: departments.length, hint: "등록된 부서 수", tone: LEGACY_COLORS.blue },
            { key: "active", label: "사용 중", value: stats.active, hint: "활성 부서", tone: LEGACY_COLORS.green },
            { key: "inactive", label: "비활성", value: stats.inactive, hint: "사용 중지", tone: LEGACY_COLORS.muted2 },
            { key: "emp", label: "소속 직원 수", value: stats.employees, hint: "전체 직원 합", tone: LEGACY_COLORS.purple },
          ]}
        />

        <div className="flex min-h-0 flex-1 gap-4">
          <AdminListPanel
            title="부서 목록"
            countLabel={`${filteredDepartments.length}개`}
            width={340}
            searchValue={search}
            searchPlaceholder="부서명 검색"
            onSearchChange={setSearch}
            filters={
              <>
                <FilterChip active={statusFilter === "all"} label="전체" onClick={() => setStatusFilter("all")} size="sm" />
                <FilterChip active={statusFilter === "active"} label="사용 중" onClick={() => setStatusFilter("active")} size="sm" tone={LEGACY_COLORS.green} />
                <FilterChip active={statusFilter === "inactive"} label="비활성" onClick={() => setStatusFilter("inactive")} size="sm" />
              </>
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
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => handleSelect(dept)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors hover:brightness-[1.04]"
                  style={{
                    background: active
                      ? `color-mix(in srgb, ${color} 14%, transparent)`
                      : LEGACY_COLORS.s2,
                    borderColor: active ? color : LEGACY_COLORS.border,
                    opacity: dept.is_active ? 1 : 0.65,
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {dept.name}
                    </div>
                    <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      DPT-{String(dept.id).padStart(2, "0")} · {empCount}명
                    </div>
                  </div>
                  {!dept.is_active && <StatusPill label="비활성" tone="neutral" maxWidth={60} />}
                </button>
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
                />
              ) : null
            }
            actions={
              addMode ? (
                <button
                  type="button"
                  onClick={() => setAddMode(false)}
                  className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  취소
                </button>
              ) : null
            }
          >
            {addMode ? (
              <DeptAddForm value={addName} onChange={setAddName} onSubmit={handleSubmitAdd} />
            ) : selectedDept ? (
              <DeptDetailView
                key={selectedDept.id}
                dept={selectedDept}
                adminPin={adminPin}
                empCount={empCountByDept.get(normalizeDepartment(selectedDept.name)) ?? 0}
                itemCount={itemCountByDept.get(normalizeDepartment(selectedDept.name)) ?? 0}
                deptEmployees={employees.filter(
                  (e) => normalizeDepartment(e.department) === normalizeDepartment(selectedDept.name),
                )}
                onSetDepartments={setDepartments}
                setSelectedDept={setSelectedDept}
                onStatusChange={onStatusChange}
                onError={onError}
                onToggleActive={() => handleToggleActive(selectedDept)}
                onRequestDelete={() => setDeleteTarget(selectedDept)}
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
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

function DeptAddForm({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = Boolean(value.trim());
  return (
    <form
      className="flex max-w-[420px] flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div>
        <label className="mb-1 block text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          부서명 <span style={{ color: LEGACY_COLORS.red }}>*</span>
        </label>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="예: 설계"
          className="w-full rounded-[12px] border px-3 py-2.5 text-[14px] outline-none focus:border-[var(--c-blue)]"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-[12px] py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
        style={{ background: LEGACY_COLORS.blue }}
      >
        부서 추가
      </button>
    </form>
  );
}

interface DeptDetailViewProps {
  dept: DepartmentMaster;
  adminPin: string;
  empCount: number;
  itemCount: number;
  deptEmployees: Employee[];
  onSetDepartments: (updater: (prev: DepartmentMaster[]) => DepartmentMaster[]) => void;
  setSelectedDept: (d: DepartmentMaster | null) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  onToggleActive: () => void;
  onRequestDelete: () => void;
}

function DeptDetailView({
  dept,
  adminPin,
  empCount,
  itemCount,
  deptEmployees,
  onSetDepartments,
  setSelectedDept,
  onStatusChange,
  onError,
  onToggleActive,
  onRequestDelete,
}: DeptDetailViewProps) {
  const savedColor = deptColor(dept);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [localColor, setLocalColor] = useState(savedColor);
  const refreshDepartments = useRefreshDepartments();

  useEffect(() => {
    setLocalColor(deptColor(dept));
    // dept 객체 자체를 deps로 넣으면 매 렌더마다 트리거됨 — 핵심 식별 필드만 watch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept.id, dept.color_hex, dept.name]);

  const colorChanged = localColor.toLowerCase() !== savedColor.toLowerCase();

  function applyColor() {
    void api
      .updateDepartment(dept.id, { color_hex: localColor, pin: adminPin })
      .then((updated) => {
        onSetDepartments((prev) => prev.map((d) => (d.id === dept.id ? updated : d)));
        setSelectedDept(updated);
        onStatusChange(`'${dept.name}' 색상을 변경했습니다.`);
        void refreshDepartments();
      })
      .catch((err: unknown) =>
        onError(err instanceof Error ? err.message : "색상 변경 실패"),
      );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 메타 그리드 4개 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetaCell label="부서명" value={dept.name} />
        <MetaCell label="코드" value={`DPT-${String(dept.id).padStart(2, "0")}`} mono />
        <MetaCell label="소속 직원" value={`${empCount}명`} tone={LEGACY_COLORS.purple} />
        <MetaCell label="관련 품목" value={`${itemCount}개`} tone={LEGACY_COLORS.blue} />
      </div>

      {/* 색상 변경 */}
      <DetailCardSlot
        title="색상"
        icon={<Palette className="h-3.5 w-3.5" />}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 shrink-0 rounded-full border-2"
            style={{ background: savedColor, borderColor: LEGACY_COLORS.border }}
            title="현재 적용된 색상"
          />
          {colorChanged && (
            <>
              <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                →
              </span>
              <div
                className="h-9 w-9 shrink-0 rounded-full border-2"
                style={{ background: localColor, borderColor: LEGACY_COLORS.border }}
              />
            </>
          )}
          <span className="ml-2 font-mono text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
            {colorChanged ? localColor : savedColor}
          </span>
          <button
            type="button"
            onClick={() => colorInputRef.current?.click()}
            className="ml-auto rounded-[10px] border px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          >
            색상 선택
          </button>
          <input
            ref={colorInputRef}
            type="color"
            value={localColor}
            onChange={(e) => setLocalColor(e.target.value)}
            className="sr-only"
          />
          {colorChanged && (
            <button
              type="button"
              onClick={applyColor}
              className="rounded-[10px] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:brightness-110"
              style={{ background: LEGACY_COLORS.blue }}
            >
              적용
            </button>
          )}
        </div>
      </DetailCardSlot>

      {/* 소속 직원 미리보기 */}
      <DetailCardSlot title={`소속 직원 (${deptEmployees.length}명)`}>
        {deptEmployees.length === 0 ? (
          <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
            소속된 직원이 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {deptEmployees.slice(0, 5).map((e) => (
              <div key={e.employee_id} className="flex items-center gap-2 text-[13px]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: e.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.muted2 }}
                />
                <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                  {e.name}
                </span>
                {e.role && (
                  <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {e.role}
                  </span>
                )}
              </div>
            ))}
            {deptEmployees.length > 5 && (
              <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                외 {deptEmployees.length - 5}명 더보기
              </div>
            )}
          </div>
        )}
      </DetailCardSlot>

      {/* 액션 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onToggleActive}
          className="flex-1 rounded-[10px] border px-3 py-2 text-[12px] font-bold transition-colors hover:brightness-110"
          style={{
            background: dept.is_active
              ? `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.green} 8%, transparent)`,
            borderColor: dept.is_active
              ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.green} 30%, transparent)`,
            color: dept.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green,
          }}
        >
          {dept.is_active ? "부서 비활성화" : "부서 활성화"}
        </button>
        <button
          type="button"
          onClick={onRequestDelete}
          className="flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-[12px] font-bold transition-colors hover:brightness-110"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          영구 삭제
        </button>
      </div>
    </div>
  );
}

function MetaCell({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div
      className="rounded-[12px] border px-3 py-2.5"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div
        className={`mt-0.5 text-[14px] font-black ${mono ? "font-mono" : ""}`}
        style={{ color: tone ?? LEGACY_COLORS.text }}
      >
        {value}
      </div>
    </div>
  );
}

function DetailCardSlot({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="mb-3 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
