"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Palette, Plus, Save, Trash2, X } from "lucide-react";
import {
  api,
  type DepartmentMaster,
  type Employee,
  type Item,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getDepartmentFallbackColor, normalizeDepartment } from "@/lib/mes/department";
import { Button } from "@/lib/ui/Button";
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
import { useRegisterDirty, useLocalDirtyGuard } from "@/lib/ui/dirty-guard";

function deptColor(d: DepartmentMaster): string {
  return d.color_hex ?? getDepartmentFallbackColor(d.name);
}

// Tailwind 표준 팔레트 — 9 hues × 4 shades = 36 swatches
const TAILWIND_PALETTE: { name: string; hex: string }[] = [
  // slate
  { name: "slate-300", hex: "#cbd5e1" },
  { name: "slate-500", hex: "#64748b" },
  { name: "slate-700", hex: "#334155" },
  { name: "slate-900", hex: "#0f172a" },
  // red
  { name: "red-300", hex: "#fca5a5" },
  { name: "red-500", hex: "#ef4444" },
  { name: "red-700", hex: "#b91c1c" },
  { name: "red-900", hex: "#7f1d1d" },
  // orange
  { name: "orange-300", hex: "#fdba74" },
  { name: "orange-500", hex: "#f97316" },
  { name: "orange-700", hex: "#c2410c" },
  { name: "orange-900", hex: "#7c2d12" },
  // amber
  { name: "amber-300", hex: "#fcd34d" },
  { name: "amber-500", hex: "#f59e0b" },
  { name: "amber-700", hex: "#b45309" },
  { name: "amber-900", hex: "#78350f" },
  // green
  { name: "green-300", hex: "#86efac" },
  { name: "green-500", hex: "#22c55e" },
  { name: "green-700", hex: "#15803d" },
  { name: "green-900", hex: "#14532d" },
  // cyan
  { name: "cyan-300", hex: "#67e8f9" },
  { name: "cyan-500", hex: "#06b6d4" },
  { name: "cyan-700", hex: "#0e7490" },
  { name: "cyan-900", hex: "#164e63" },
  // blue
  { name: "blue-300", hex: "#93c5fd" },
  { name: "blue-500", hex: "#3b82f6" },
  { name: "blue-700", hex: "#1d4ed8" },
  { name: "blue-900", hex: "#1e3a8a" },
  // violet
  { name: "violet-300", hex: "#c4b5fd" },
  { name: "violet-500", hex: "#8b5cf6" },
  { name: "violet-700", hex: "#6d28d9" },
  { name: "violet-900", hex: "#4c1d95" },
  // pink
  { name: "pink-300", hex: "#f9a8d4" },
  { name: "pink-500", hex: "#ec4899" },
  { name: "pink-700", hex: "#be185d" },
  { name: "pink-900", hex: "#831843" },
];

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
    setDirty,
  } = useAdminDepartmentsContext();
  const refreshDepartments = useRefreshDepartments();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [addMode, setAddMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentMaster | null>(null);
  const deptSaveRef = useRef<(() => void) | null>(null);

  // PR-2 2-3: 부서명 편집 기능(A3)이 아직 worktree 에 없으므로 dirty 는 placeholder(false).
  // 인프라(가드/모달/registry)는 준비해 두어 A3 머지 후 dirty 노출만 연결하면 바로 동작.
  const deptDirty = false;
  const deptSave = async () => {
    /* placeholder: A3 가 saveDepartment 노출 시 교체 */
  };
  useRegisterDirty("departments", deptDirty, deptSave);
  const { confirmNavigation } = useLocalDirtyGuard(deptDirty, deptSave);

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
    confirmNavigation(() => {
      setAddMode(true);
      setSelectedDept(null);
    });
  }

  function handleSubmitAdd() {
    if (!addName.trim()) return;
    addDepartmentMaster();
    setAddMode(false);
  }

  function handleSelect(dept: DepartmentMaster) {
    confirmNavigation(() => {
      setAddMode(false);
      setSelectedDept(selectedDept?.id === dept.id ? null : dept);
    });
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
            <Button variant="primary" size="md" iconLeft={<Plus className="h-4 w-4" />} onClick={handleStartAdd}>
              부서 추가
            </Button>
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
                <Button variant="secondary" size="sm" iconLeft={<X className="h-3.5 w-3.5" />} onClick={() => setAddMode(false)}>
                  취소
                </Button>
              ) : selectedDept ? (
                <Button variant="primary" size="sm" iconLeft={<Save className="h-3.5 w-3.5" />} onClick={() => deptSaveRef.current?.()}>
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
                onSaveRef={(fn) => { deptSaveRef.current = fn; }}
                onDirtyChange={setDirty}
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
        <label htmlFor="dept-add-name" className="mb-1 block text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          부서명 <span style={{ color: LEGACY_COLORS.red }}>*</span>
        </label>
        <input
          id="dept-add-name"
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
  onSaveRef?: (fn: (() => void) | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
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
  onSaveRef,
  onDirtyChange,
}: DeptDetailViewProps) {
  const savedColor = deptColor(dept);
  const savedIoEnabled = dept.io_enabled ?? true;
  const [editForm, setEditForm] = useState({
    name: dept.name,
    color_hex: savedColor,
    io_enabled: savedIoEnabled,
  });
  const [colorInputError, setColorInputError] = useState<string | null>(null);
  const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
  const refreshDepartments = useRefreshDepartments();

  // dept 변경 시 폼 초기화
  useEffect(() => {
    const color = deptColor(dept);
    setEditForm({
      name: dept.name,
      color_hex: color,
      io_enabled: dept.io_enabled ?? true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept.id, dept.color_hex, dept.name, dept.io_enabled]);

  const dirty =
    editForm.name !== dept.name ||
    editForm.color_hex.toLowerCase() !== savedColor.toLowerCase() ||
    editForm.io_enabled !== savedIoEnabled;

  // dirty 변경 알림
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function save() {
    void api
      .updateDepartment(dept.id, {
        name: editForm.name.trim() || dept.name,
        color_hex: editForm.color_hex,
        io_enabled: editForm.io_enabled,
        pin: adminPin,
      })
      .then((updated) => {
        onSetDepartments((prev) => prev.map((d) => (d.id === dept.id ? updated : d)));
        setSelectedDept(updated);
        onStatusChange(`'${updated.name}' 부서 정보를 저장했습니다.`);
        void refreshDepartments();
      })
      .catch((err: unknown) =>
        onError(err instanceof Error ? err.message : "저장 실패"),
      );
  }

  // 저장 함수 ref 노출 (부모가 헤더 버튼에서 호출)
  useEffect(() => {
    onSaveRef?.(save);
    return () => onSaveRef?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm, adminPin]);

  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(editForm.color_hex);
  const previewColor = isValidHex ? editForm.color_hex : savedColor;
  const colorChanged = isValidHex && previewColor.toLowerCase() !== savedColor.toLowerCase();

  return (
    <div className="flex flex-col gap-4">
      {/* 메타 그리드 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: LEGACY_COLORS.muted2 }}>
            부서명
          </span>
          <input
            type="text"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:border-[var(--c-blue)]"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
        </div>
        <MetaCell label="코드" value={`DPT-${String(dept.id).padStart(2, "0")}`} mono />
        <MetaCell label="소속 직원" value={`${empCount}명`} tone={LEGACY_COLORS.purple} />
        <MetaCell label="관련 품목" value={`${itemCount}개`} tone={LEGACY_COLORS.blue} />
      </div>

      {/* 입출고 권한 (W11) */}
      <DetailCardSlot title="입출고 권한">
        <label className="inline-flex cursor-pointer items-center gap-3 py-1">
          <input
            type="checkbox"
            checked={editForm.io_enabled}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, io_enabled: e.target.checked }))
            }
            className="h-4 w-4 cursor-pointer rounded border"
            style={{
              accentColor: LEGACY_COLORS.blue,
              borderColor: LEGACY_COLORS.border,
            }}
          />
          <span
            className="text-[13px] font-bold"
            style={{
              color: editForm.io_enabled ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
            }}
          >
            {editForm.io_enabled
              ? "사용 가능 (입출고 화면 접근 허용)"
              : "사용 불가 (입출고 화면 차단)"}
          </span>
        </label>
      </DetailCardSlot>

      {/* 색상 변경 */}
      <DetailCardSlot
        title="색상"
        icon={<Palette className="h-3.5 w-3.5" />}
      >
        <div className="flex flex-col gap-3">
          {/* 미리보기 + 텍스트 입력 */}
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 shrink-0 rounded-full border-2"
              style={{ background: savedColor, borderColor: LEGACY_COLORS.border }}
              title="현재 저장된 색상"
            />
            {colorChanged && (
              <>
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>→</span>
                <div
                  className="h-9 w-9 shrink-0 rounded-full border-2"
                  style={{ background: previewColor, borderColor: LEGACY_COLORS.border }}
                  title="미리보기"
                />
              </>
            )}
            <div className="flex flex-col gap-0.5">
              <input
                type="text"
                value={editForm.color_hex}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditForm((f) => ({ ...f, color_hex: val }));
                  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    setColorInputError(null);
                  } else {
                    setColorInputError("올바른 hex 코드를 입력하세요 (예: #3B82F6)");
                  }
                }}
                placeholder="#000000"
                className="w-32 rounded-[8px] border px-2 py-1 font-mono text-[13px] outline-none focus:border-[var(--c-blue)]"
                style={{
                  background: LEGACY_COLORS.s1,
                  borderColor: colorInputError ? "#ef4444" : LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              />
              {colorInputError && (
                <span className="text-[11px]" style={{ color: "#ef4444" }}>
                  {colorInputError}
                </span>
              )}
            </div>
          </div>
          {/* Tailwind 프리셋 팔레트 (9 hues × 4 shades = 36 swatches) */}
          <div className="grid grid-cols-9 gap-1">
            {TAILWIND_PALETTE.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                title={`${swatch.name} — ${swatch.hex}`}
                className="h-7 w-7 rounded-lg border-2 transition-transform hover:scale-110 active:scale-95"
                style={{
                  background: swatch.hex,
                  borderColor:
                    editForm.color_hex.toLowerCase() === swatch.hex.toLowerCase()
                      ? LEGACY_COLORS.text
                      : "transparent",
                }}
                onClick={() => {
                  setEditForm((f) => ({ ...f, color_hex: swatch.hex }));
                  setColorInputError(null);
                }}
              />
            ))}
          </div>
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
          onClick={() => {
            if (dept.is_active) {
              setToggleConfirmOpen(true);
            } else {
              onToggleActive();
            }
          }}
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

      <ConfirmModal
        open={toggleConfirmOpen}
        title={`'${dept.name}' 부서를 비활성화하시겠습니까?`}
        tone="caution"
        confirmLabel="비활성화"
        onClose={() => setToggleConfirmOpen(false)}
        onConfirm={() => { setToggleConfirmOpen(false); onToggleActive(); }}
      />
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
