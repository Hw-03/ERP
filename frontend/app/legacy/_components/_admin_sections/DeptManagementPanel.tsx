"use client";

import { useEffect, useRef, useState } from "react";
import { api, type DepartmentMaster } from "@/lib/api";
import { LEGACY_COLORS, employeeColor } from "../legacyUi";
import { useRefreshDepartments } from "../DepartmentsContext";

/**
 * 우측 패널의 부서 상세 편집 영역.
 *
 * DesktopAdminView 본체에서 분리 — 부서 색상 변경 / 활성 토글 / 영구 삭제만 담당.
 * 화면 구조 / 동작 / 스타일은 그대로 유지한다.
 */
export interface DeptManagementPanelProps {
  dept: DepartmentMaster;
  adminPin: string;
  /**
   * 호출처에서 전달하지만 패널 본문에서는 사용하지 않는다 (호환 유지용).
   * 미래에 부서 목록 기반 조작이 들어올 자리.
   */
  departments: DepartmentMaster[];
  setDepartments: (updater: (prev: DepartmentMaster[]) => DepartmentMaster[]) => void;
  setSelectedDept: (d: DepartmentMaster | null) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
}

export function DeptManagementPanel({
  dept,
  adminPin,
  setDepartments,
  setSelectedDept,
  onStatusChange,
  onError,
}: DeptManagementPanelProps) {
  const savedColor = dept.color_hex ?? employeeColor(dept.name);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [localColor, setLocalColor] = useState(savedColor);
  const refreshDepartments = useRefreshDepartments();

  useEffect(() => {
    setLocalColor(dept.color_hex ?? employeeColor(dept.name));
  }, [dept.id, dept.color_hex, dept.name]);

  const colorChanged = localColor.toLowerCase() !== savedColor.toLowerCase();

  function applyColor() {
    void api
      .updateDepartment(dept.id, { color_hex: localColor, pin: adminPin })
      .then((updated) => {
        setDepartments((prev) => prev.map((d) => (d.id === dept.id ? updated : d)));
        setSelectedDept(updated);
        void refreshDepartments();
      })
      .catch((err: unknown) => onError(err instanceof Error ? err.message : "색상 변경 실패"));
  }

  function toggleActive() {
    const next = !dept.is_active;
    if (next === false && !confirm(`'${dept.name}' 부서를 비활성화하시겠습니까?`)) return;
    void api
      .updateDepartment(dept.id, { is_active: next, pin: adminPin })
      .then((updated) => {
        setDepartments((prev) => prev.map((d) => (d.id === dept.id ? updated : d)));
        setSelectedDept(updated);
        onStatusChange(`'${dept.name}' 부서를 ${next ? "활성화" : "비활성화"}했습니다.`);
        void refreshDepartments();
      })
      .catch((err: unknown) => onError(err instanceof Error ? err.message : "상태 변경 실패"));
  }

  function deleteDept() {
    if (!confirm(`'${dept.name}' 부서를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    void api
      .deleteDepartment(dept.id, adminPin)
      .then(() => {
        setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
        setSelectedDept(null);
        onStatusChange(`'${dept.name}' 부서를 삭제했습니다.`);
        void refreshDepartments();
      })
      .catch((err: unknown) => onError(err instanceof Error ? err.message : "삭제 실패"));
  }

  return (
    <div className="space-y-3">
      {/* 선택된 부서 헤더 */}
      <div
        className="rounded-[20px] border p-4 flex items-center gap-3"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
          style={{ background: localColor }}
        >
          {dept.name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <div className="text-base font-black truncate">{dept.name}</div>
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{
              background: dept.is_active
                ? `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`
                : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
              color: dept.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.muted2,
            }}
          >
            {dept.is_active ? "활성" : "비활성"}
          </span>
        </div>
      </div>

      {/* 색상 */}
      <div
        className="rounded-[20px] border p-4"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: LEGACY_COLORS.muted2 }}>
          색상
        </div>
        <div className="mb-3 flex items-center gap-3">
          <div
            className="h-9 w-9 shrink-0 rounded-full border-2"
            style={{ background: savedColor, borderColor: LEGACY_COLORS.border }}
            title="현재 적용된 색상"
          />
          {colorChanged && (
            <>
              <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>→</span>
              <div
                className="h-9 w-9 shrink-0 rounded-full border-2"
                style={{ background: localColor, borderColor: LEGACY_COLORS.border }}
                title="선택한 색상"
              />
            </>
          )}
          <span className="ml-auto font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {colorChanged ? localColor : savedColor}
          </span>
        </div>
        <button
          onClick={() => colorInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 rounded-[12px] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-75"
          style={{ background: localColor }}
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
            onClick={applyColor}
            className="mt-2 w-full rounded-[12px] py-2.5 text-sm font-semibold text-white"
            style={{ background: LEGACY_COLORS.blue }}
          >
            적용
          </button>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-col gap-2">
        <button
          onClick={toggleActive}
          className="w-full rounded-[14px] border py-2.5 text-sm font-semibold transition-colors hover:bg-white/10"
          style={{
            borderColor: dept.is_active
              ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`
              : LEGACY_COLORS.border,
            color: dept.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
          }}
        >
          {dept.is_active ? "비활성화" : "활성화"}
        </button>
        <button
          onClick={deleteDept}
          className="w-full rounded-[14px] border py-2.5 text-sm font-semibold transition-colors hover:bg-white/10"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 20%, transparent)`,
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          영구 삭제
        </button>
      </div>
    </div>
  );
}
