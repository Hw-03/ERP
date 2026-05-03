"use client";

import { useState } from "react";
import { Building2, GripVertical } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useAdminDepartmentsContext } from "./AdminDepartmentsContext";
import { getDepartmentFallbackColor } from "@/lib/mes-department";
import type { DepartmentMaster } from "@/lib/api";

function getDeptColor(dept: DepartmentMaster) {
  // DB color_hex 우선, 없으면 mes-department fallback (employeeColor 와 동일 hex).
  return dept.color_hex ?? getDepartmentFallbackColor(dept.name);
}

function DeptGridButton({
  dept,
  selected,
  onSelect,
  muted,
  dragging,
  dragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  dept: DepartmentMaster;
  selected: boolean;
  onSelect: () => void;
  muted?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const color = getDeptColor(dept);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="relative"
      style={{ opacity: dragging ? 0.4 : 1 }}
    >
      {dragOver && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[20px]"
          style={{ boxShadow: `0 0 0 2px ${color}`, zIndex: 10 }}
        />
      )}
      <button
        onClick={onSelect}
        className="flex w-full items-center justify-center rounded-[20px] border py-8 text-2xl font-bold transition-all active:scale-[0.98] cursor-grab active:cursor-grabbing"
        style={{
          background: selected ? `color-mix(in srgb, ${color} 22%, transparent)` : `color-mix(in srgb, ${color} 12%, transparent)`,
          borderColor: selected ? color : `color-mix(in srgb, ${color} 30%, transparent)`,
          color: muted ? LEGACY_COLORS.muted2 : color,
          opacity: muted ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `color-mix(in srgb, ${color} 22%, transparent)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = selected
            ? `color-mix(in srgb, ${color} 22%, transparent)`
            : `color-mix(in srgb, ${color} 12%, transparent)`;
        }}
      >
        <GripVertical className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-20" />
        {dept.name}
      </button>
    </div>
  );
}

function DeptGrid({
  depts,
  selectedDept,
  setSelectedDept,
  reorderDepartments,
  allDepts,
  muted,
}: {
  depts: DepartmentMaster[];
  selectedDept: DepartmentMaster | null;
  setSelectedDept: (d: DepartmentMaster | null) => void;
  reorderDepartments: (ordered: DepartmentMaster[]) => void;
  allDepts: DepartmentMaster[];
  muted?: boolean;
}) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  function handleDrop(targetId: number) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = depts.findIndex((d) => d.id === draggedId);
    const toIdx = depts.findIndex((d) => d.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...depts];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const newOrder = muted
      ? [...allDepts.filter((d) => d.is_active), ...reordered]
      : [...reordered, ...allDepts.filter((d) => !d.is_active)];

    reorderDepartments(newOrder);
    setDraggedId(null);
    setDragOverId(null);
  }

  return (
    <div className="grid grid-cols-5 gap-3">
      {depts.map((dept) => (
        <DeptGridButton
          key={dept.id}
          dept={dept}
          selected={selectedDept?.id === dept.id}
          onSelect={() => setSelectedDept(selectedDept?.id === dept.id ? null : dept)}
          muted={muted}
          dragging={draggedId === dept.id}
          dragOver={dragOverId === dept.id}
          onDragStart={() => setDraggedId(dept.id)}
          onDragOver={(e) => { e.preventDefault(); setDragOverId(dept.id); }}
          onDrop={() => handleDrop(dept.id)}
          onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
        />
      ))}
    </div>
  );
}

export function AdminDepartmentsSection() {
  const {
    departments,
    addName,
    setAddName,
    addDepartmentMaster,
    selectedDept,
    setSelectedDept,
    reorderDepartments,
  } = useAdminDepartmentsContext();

  const active = departments.filter((d) => d.is_active);
  const inactive = departments.filter((d) => !d.is_active);

  return (
    <div className="overflow-y-auto">
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* 추가 폼 */}
        <div
          className="rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4 flex items-center gap-2 text-base font-bold">
            <Building2 className="h-4 w-4" /> 새 부서 추가
          </div>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                부서명 *
              </label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDepartmentMaster()}
                placeholder="예: 설계"
                className="w-full rounded-[14px] border px-3 py-2 text-base outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </div>
            <button
              disabled={!addName.trim()}
              onClick={addDepartmentMaster}
              className="w-full rounded-[14px] py-2.5 text-base font-bold text-white"
              style={{
                background: addName.trim() ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                opacity: addName.trim() ? 1 : 0.5,
              }}
            >
              부서 추가
            </button>
          </div>
        </div>

        {/* 목록 */}
        <div
          className="rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-base font-bold">
              <Building2 className="h-4 w-4" /> 등록된 부서
            </div>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {active.length}개 활성 / {inactive.length}개 비활성
            </span>
          </div>

          {departments.length === 0 ? (
            <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>등록된 부서가 없습니다.</div>
          ) : (
            <div className="space-y-4">
              <DeptGrid
                depts={active}
                selectedDept={selectedDept}
                setSelectedDept={setSelectedDept}
                reorderDepartments={reorderDepartments}
                allDepts={departments}
              />

              {inactive.length > 0 && (
                <>
                  <div
                    className="px-1 text-[10px] font-black uppercase tracking-[0.2em]"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    비활성
                  </div>
                  <DeptGrid
                    depts={inactive}
                    selectedDept={selectedDept}
                    setSelectedDept={setSelectedDept}
                    reorderDepartments={reorderDepartments}
                    allDepts={departments}
                    muted
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
