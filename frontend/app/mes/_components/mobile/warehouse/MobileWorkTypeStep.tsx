"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { MES_DEPARTMENT_COLORS } from "@/lib/mes-department";
import type { IoSubType, IoWorkType, OperatorLike } from "../../_warehouse_v2/types";
import {
  IO_SUB_TYPES,
  IO_WORK_TYPES,
  canSeeWorkType,
  deptIoSubType,
  deptVisibility,
  isExitWorkType,
  isSingleInlineSubType,
  requiresDepartments,
  type DeptIoDirection,
} from "../../_warehouse_v2/ioWorkType";

const PROD_DEPTS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"];

/**
 * Step 1 (모바일) — 작업 유형 선택.
 *
 * 데스크탑 IoWorkTypeStep 은 p-10/text-4xl/h-full grid 라 393px 에서 글자가
 * 세로로 깨지고 카드가 잘린다. 데이터/권한 로직(IO_WORK_TYPES/canSeeWorkType)은
 * 그대로 재사용하고 레이아웃만 모바일 1열 카드로 다시 그린다.
 */
export function MobileWorkTypeStep({
  workType,
  operator,
  onWorkTypeChange,
}: {
  workType: IoWorkType;
  operator: OperatorLike | null;
  onWorkTypeChange: (workType: IoWorkType) => void;
}) {
  const visible = IO_WORK_TYPES.filter((row) => canSeeWorkType(row.id, operator));
  return (
    // 항목 7 — 작업 유형 버튼이 남은 화면 높이를 세로로 균등 분할(버튼 수 무관 전폭 타일).
    <div className="flex min-h-full flex-col gap-2.5">
      {visible.map((row) => {
        const Icon = row.icon;
        const active = workType === row.id;
        const accent = isExitWorkType(row.id) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
        // 활성 카드 텍스트: 연한 틴트 위 brand 색은 AA 미달 → text 색과 섞어 어둡게
        const accentText = `color-mix(in srgb, ${accent} 42%, ${LEGACY_COLORS.text})`;
        return (
          <button
            key={row.id}
            type="button"
            aria-pressed={active}
            onClick={() => onWorkTypeChange(row.id)}
            className="flex min-h-[96px] flex-1 items-center gap-4 rounded-[18px] border p-4 text-left transition-[transform] active:scale-[0.99]"
            style={{
              background: active ? tint(accent, 14) : LEGACY_COLORS.s2,
              borderColor: active ? accent : LEGACY_COLORS.border,
              borderWidth: active ? 2 : 1,
              color: active ? accentText : LEGACY_COLORS.text,
            }}
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: active ? tint(accent, 20) : LEGACY_COLORS.s3 }}
            >
              <Icon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-black leading-tight">{row.label}</span>
              <span
                className="block text-sm font-semibold"
                style={{ color: active ? accentText : LEGACY_COLORS.muted2 }}
              >
                {row.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <div
      className="mb-2 text-xs font-black uppercase tracking-[1.5px]"
      style={{ color: LEGACY_COLORS.muted2 }}
    >
      {text}
    </div>
  );
}

function DeptGrid({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label text={label} />
      <div className="grid grid-cols-3 gap-2">
        {PROD_DEPTS.map((d) => {
          const active = d === value;
          const color =
            MES_DEPARTMENT_COLORS[d as keyof typeof MES_DEPARTMENT_COLORS] ?? LEGACY_COLORS.purple;
          return (
            <button
              key={d}
              type="button"
              aria-label={d}
              aria-pressed={active}
              onClick={() => onChange(d)}
              className="min-h-[48px] rounded-[14px] border text-base font-black transition-[transform] active:scale-95"
              style={{
                background: active ? tint(color, 14) : LEGACY_COLORS.s2,
                borderColor: active ? color : LEGACY_COLORS.border,
                color: active ? color : LEGACY_COLORS.muted2,
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Step 2 (모바일) — 세부 작업 + 부서/방향.
 * 데스크탑 IoSubTypeStep 의 표시 규칙(deptVisibility/requiresDepartments)을
 * 그대로 따르되 모바일 칩/그리드로 다시 그린다.
 */
export function MobileSubTypeStep({
  workType,
  subType,
  fromDepartment,
  toDepartment,
  deptIoDirection,
  onSubTypeChange,
  onFromDepartmentChange,
  onToDepartmentChange,
  onDeptIoDirectionChange,
}: {
  workType: IoWorkType;
  subType: IoSubType;
  fromDepartment: string;
  toDepartment: string;
  deptIoDirection: DeptIoDirection | null;
  onSubTypeChange: (s: IoSubType) => void;
  onFromDepartmentChange: (v: string) => void;
  onToDepartmentChange: (v: string) => void;
  onDeptIoDirectionChange: (d: DeptIoDirection) => void;
}) {
  if (workType === "process") {
    const curDir = deptIoDirection;
    return (
      // 항목 7 — 부서/방향/입력방식 섹션이 화면 높이를 균등 분할(버튼은 과대 stretch 없이 중앙 정렬).
      <div className="flex min-h-full flex-col gap-4">
        <div className="flex flex-1 flex-col justify-center">
          <DeptGrid label="대상 부서" value={toDepartment} onChange={onToDepartmentChange} />
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <Label text="방향" />
          <div className="grid grid-cols-2 gap-3">
            {(["in", "out"] as DeptIoDirection[]).map((dir) => {
              const active = deptIoDirection === dir;
              const color = dir === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => onDeptIoDirectionChange(dir)}
                  className="min-h-[64px] rounded-[16px] border text-xl font-black transition-[transform] active:scale-95"
                  style={{
                    background: active ? tint(color, 14) : LEGACY_COLORS.s2,
                    borderColor: active ? color : LEGACY_COLORS.border,
                    borderWidth: active ? 2 : 1,
                    color: active ? color : LEGACY_COLORS.text,
                  }}
                >
                  {dir === "in" ? "입고" : "출고"}
                </button>
              );
            })}
          </div>
        </div>
        {curDir != null && (
          <div className="flex flex-1 flex-col justify-center">
            <Label text="입력 방식" />
            <div className="grid grid-cols-2 gap-3">
              {(["bom", "single"] as const).map((m) => {
                const active = (isSingleInlineSubType(subType) ? "single" : "bom") === m;
                const label = m === "bom" ? "BOM 전개" : "단품 빠른 입력";
                const desc = m === "bom" ? "하위 자재까지 함께" : "낱개 · 한 화면";
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSubTypeChange(deptIoSubType(curDir, m))}
                    className="flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-[16px] border px-3 transition-[transform] active:scale-95"
                    style={{
                      background: active ? tint(LEGACY_COLORS.blue, 14) : LEGACY_COLORS.s2,
                      borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                      borderWidth: active ? 2 : 1,
                      color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                    }}
                  >
                    <span className="text-base font-black leading-tight">{label}</span>
                    <span
                      className="text-xs font-semibold leading-tight"
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      {desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const subRows = IO_SUB_TYPES[workType];
  const dept = deptVisibility(subType);
  const showAnyDept = requiresDepartments(subType) && (dept.from || dept.to);
  const caution =
    subType === "defect_quarantine" || subType === "supplier_return" ? LEGACY_COLORS.red : null;

  return (
    // 항목 7 — 세부 작업/부서 섹션이 화면 높이를 균등 분할.
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex flex-1 flex-col justify-center">
        <Label text="세부 작업" />
        <div className="grid grid-cols-2 gap-2.5">
          {subRows.map((row) => {
            const active = subType === row.id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSubTypeChange(row.id)}
                className="flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-[16px] border px-3 py-3 text-center transition-[transform] active:scale-95"
                style={{
                  background: active ? tint(LEGACY_COLORS.blue, 14) : LEGACY_COLORS.s2,
                  borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                <span className="text-base font-black leading-tight">{row.label}</span>
                <span
                  className="text-[11px] font-semibold leading-tight"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  {row.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showAnyDept && dept.from && (
        <div className="flex flex-1 flex-col justify-center">
          <DeptGrid
            label={
              subType === "supplier_return"
                ? "반품할 부서 (불량 출처)"
                : subType === "defect_quarantine"
                ? "불량 격리 부서"
                : "출발 부서"
            }
            value={fromDepartment}
            onChange={onFromDepartmentChange}
          />
        </div>
      )}
      {showAnyDept && dept.to && (
        <div className="flex flex-1 flex-col justify-center">
          <DeptGrid
            label={subType === "warehouse_to_dept" ? "도착 부서" : "대상 부서"}
            value={toDepartment}
            onChange={onToDepartmentChange}
          />
        </div>
      )}

      {caution && (
        <div
          className="rounded-[14px] border px-4 py-3 text-sm font-bold leading-relaxed"
          style={{
            background: tint(caution, 8),
            borderColor: tint(caution, 40),
            color: LEGACY_COLORS.text,
          }}
        >
          {subType === "supplier_return"
            ? "공급업체 반품은 되돌릴 수 없습니다. 반품 부서(불량 출처)와 수량을 확인하세요."
            : "불량 격리는 재고가 격리 상태로 이동합니다. 대상 부서를 다시 확인하세요."}
        </div>
      )}
    </div>
  );
}
