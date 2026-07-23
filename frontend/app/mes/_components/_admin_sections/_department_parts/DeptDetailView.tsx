"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Palette, Trash2 } from "lucide-react";
import { api, type DepartmentMaster, type Employee } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { PROCESS_TO_DEPT } from "@/lib/mes/process";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { useRefreshDepartments } from "../../DepartmentsContext";
import { deptColor, TAILWIND_PALETTE } from "./departmentColors";
import { DetailCardSlot, MetaCell } from "./departmentDetailPrimitives";

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

export function DeptDetailView({
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
  const [editForm, setEditForm] = useState({
    name: dept.name,
    color_hex: savedColor,
  });
  const [colorInputError, setColorInputError] = useState<string | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
  const refreshDepartments = useRefreshDepartments();
  const normalizedDepartment = normalizeDepartment(dept.name);
  const isProcessMappedDepartment = Object.values(PROCESS_TO_DEPT).some(
    (name) => name === normalizedDepartment,
  );

  // dept 변경 시 폼 초기화
  useEffect(() => {
    const color = deptColor(dept);
    setEditForm({
      name: dept.name,
      color_hex: color,
    });
    setIsPaletteOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept.id, dept.color_hex, dept.name]);

  const dirty =
    editForm.name !== dept.name ||
    editForm.color_hex.toLowerCase() !== savedColor.toLowerCase();

  // dirty 변경 알림
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function save() {
    void api
      .updateDepartment(dept.id, {
        name: editForm.name.trim() || dept.name,
        color_hex: editForm.color_hex,
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
    <div className="flex min-h-full flex-col gap-4">
      {/* 메타 그리드 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="department-name" className="text-[12px] font-bold tracking-wide" style={{ color: LEGACY_COLORS.muted2 }}>
            부서명
          </label>
          <input
            id="department-name"
            type="text"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-[10px] border px-3 py-2 text-[14px] outline-none focus-visible:border-[var(--c-blue)] focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/20"
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
      <p className="-mt-2 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
        품목 코드 공정 기준{!isProcessMappedDepartment ? " · 공정 코드 매핑 없음" : ""}
      </p>

      {/* 색상 변경 */}
      <DetailCardSlot
        title="색상"
        icon={<Palette className="h-3.5 w-3.5" />}
        className="min-h-0 flex-1"
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
                aria-label="색상 코드"
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
                className="w-32 rounded-[8px] border px-2 py-1 font-mono text-[14px] outline-none focus-visible:border-[var(--c-blue)] focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/20"
                style={{
                  background: LEGACY_COLORS.s1,
                  borderColor: colorInputError ? "#ef4444" : LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              />
              {colorInputError && (
                <span className="text-[12px]" style={{ color: "#ef4444" }}>
                  {colorInputError}
                </span>
              )}
            </div>
          </div>
          <div>
            <button
              type="button"
              aria-expanded={isPaletteOpen}
              aria-controls="department-color-palette"
              onClick={() => setIsPaletteOpen((open) => !open)}
              className="flex h-11 w-full items-center justify-between rounded-[12px] border px-3 text-[12px] font-bold transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/30"
              style={{
                background: isPaletteOpen
                  ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`
                  : LEGACY_COLORS.s1,
                borderColor: isPaletteOpen
                  ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 35%, transparent)`
                  : LEGACY_COLORS.border,
                color: isPaletteOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
              }}
            >
              전체 색상 보기
              <ChevronDown
                className="h-4 w-4 transition-transform duration-150"
                style={{ transform: isPaletteOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
            {isPaletteOpen && (
              <div id="department-color-palette" className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-9">
                {TAILWIND_PALETTE.map((swatch) => {
                  const selected = editForm.color_hex.toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.hex}
                      type="button"
                      aria-label={`${swatch.name} ${swatch.hex}`}
                      aria-pressed={selected}
                      className="h-11 w-11 rounded-lg border-2 transition-transform hover:scale-105 active:scale-[0.98]"
                      style={{
                        background: swatch.hex,
                        borderColor: selected ? LEGACY_COLORS.text : "transparent",
                      }}
                      onClick={() => {
                        setEditForm((f) => ({ ...f, color_hex: swatch.hex }));
                        setColorInputError(null);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DetailCardSlot>

      {/* 소속 직원 미리보기 */}
      <DetailCardSlot
        title={`소속 직원 (${deptEmployees.length}명)`}
        className="min-h-0 flex-1"
      >
        {deptEmployees.length === 0 ? (
          <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
            소속된 직원이 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {deptEmployees.slice(0, 5).map((e) => (
              <div key={e.employee_id} className="flex items-center gap-2 text-[14px]">
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
              <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                외 {deptEmployees.length - 5}명 더보기
              </div>
            )}
          </div>
        )}
      </DetailCardSlot>

      {/* 액션 */}
      <div className="mt-auto flex gap-2">
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
