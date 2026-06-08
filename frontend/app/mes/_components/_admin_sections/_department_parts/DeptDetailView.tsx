"use client";

import { useEffect, useState } from "react";
import { Palette, Trash2 } from "lucide-react";
import { api, type DepartmentMaster, type Employee } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
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
  const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
  const refreshDepartments = useRefreshDepartments();

  // dept 변경 시 폼 초기화
  useEffect(() => {
    const color = deptColor(dept);
    setEditForm({
      name: dept.name,
      color_hex: color,
    });
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
