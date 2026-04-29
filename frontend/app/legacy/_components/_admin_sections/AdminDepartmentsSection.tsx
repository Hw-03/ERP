"use client";

import { Building2, PowerOff, RotateCcw } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";
import { useAdminDepartmentsContext } from "./AdminDepartmentsContext";

export function AdminDepartmentsSection() {
  const { departments, addName, setAddName, addDepartmentMaster, deactivateDepartmentMaster, reactivateDepartmentMaster } =
    useAdminDepartmentsContext();

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
            <div className="space-y-2">
              {active.map((dept) => (
                <div
                  key={dept.id}
                  className="flex items-center justify-between rounded-[16px] border px-4 py-3"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-white"
                      style={{ background: LEGACY_COLORS.purple }}
                    >
                      {dept.name.slice(0, 1)}
                    </div>
                    <span className="text-base font-bold">{dept.name}</span>
                  </div>
                  <button
                    onClick={() => deactivateDepartmentMaster(dept.id)}
                    className="flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-white/10"
                    style={{ borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`, color: LEGACY_COLORS.red }}
                  >
                    <PowerOff className="h-3 w-3" />
                    비활성화
                  </button>
                </div>
              ))}

              {inactive.length > 0 && (
                <>
                  <div
                    className="mt-3 mb-2 px-1 text-[10px] font-black uppercase tracking-[0.2em]"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    비활성
                  </div>
                  {inactive.map((dept) => (
                    <div
                      key={dept.id}
                      className="flex items-center justify-between rounded-[16px] border px-4 py-3 opacity-50"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
                          style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
                        >
                          {dept.name.slice(0, 1)}
                        </div>
                        <span className="text-base">{dept.name}</span>
                      </div>
                      <button
                        onClick={() => reactivateDepartmentMaster(dept.id)}
                        className="flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-white/10"
                        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                      >
                        <RotateCcw className="h-3 w-3" />
                        활성화
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
