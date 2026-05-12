"use client";

import { AlertTriangle, Check } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { MES_DEPARTMENT_COLORS } from "@/lib/mes-department";
import type { IoSubType, IoWorkType, OperatorLike } from "./types";
import { IO_SUB_TYPES, IO_WORK_TYPES, canSeeWorkType, requiresDepartments } from "./ioWorkType";
import { SettingLabel } from "./_atoms";

interface WorkTypeProps {
  workType: IoWorkType;
  operator: OperatorLike | null;
  onWorkTypeChange: (workType: IoWorkType) => void;
}

/**
 * Step 1 본문 — 큰 작업 유형 카드 5개. WizardStepCard 안에 들어감.
 */
export function IoWorkTypeStep({ workType, operator, onWorkTypeChange }: WorkTypeProps) {
  const visibleWorkTypes = IO_WORK_TYPES.filter((row) => canSeeWorkType(row.id, operator));
  const n = visibleWorkTypes.length;
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {visibleWorkTypes.map((row) => {
        const Icon = row.icon;
        const active = workType === row.id;
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onWorkTypeChange(row.id)}
            className="flex flex-col items-start gap-2 rounded-[18px] border p-6 text-left transition-all hover:brightness-110"
            style={{
              background: active ? tint(LEGACY_COLORS.blue, 14) : LEGACY_COLORS.s2,
              borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              borderWidth: active ? 2 : 1,
              color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
            }}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-7 w-7 shrink-0" />
              <span className="text-lg font-black leading-tight">{row.label}</span>
            </div>
            <span
              className="text-sm font-semibold leading-tight"
              style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}
            >
              {row.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface SubTypeProps {
  workType: IoWorkType;
  subType: IoSubType;
  fromDepartment: string;
  toDepartment: string;
  onSubTypeChange: (subType: IoSubType) => void;
  onFromDepartmentChange: (value: string) => void;
  onToDepartmentChange: (value: string) => void;
}

/* sub_type → 어느 부서 grid를 보여줄지 */
function deptVisibility(subType: IoSubType): { from: boolean; to: boolean } {
  if (subType === "warehouse_to_dept") return { from: false, to: true };
  if (subType === "dept_to_warehouse") return { from: true, to: false };
  if (subType === "defect_quarantine" || subType === "supplier_return") return { from: true, to: false };
  if (subType === "dept_transfer") return { from: true, to: true };
  if (
    subType === "produce" ||
    subType === "disassemble" ||
    subType === "adjust_in" ||
    subType === "adjust_out"
  )
    return { from: false, to: true };
  return { from: false, to: false };
}

const PROD_DEPTS = ["조립", "고압", "진공", "튜닝", "튜브", "출하"];

export function IoSubTypeStep({
  workType,
  subType,
  fromDepartment,
  toDepartment,
  onSubTypeChange,
  onFromDepartmentChange,
  onToDepartmentChange,
}: SubTypeProps) {
  const subRows = IO_SUB_TYPES[workType];
  const dept = deptVisibility(subType);
  const showAnyDept = requiresDepartments(subType) && (dept.from || dept.to);
  const cautionTone =
    subType === "defect_quarantine" || subType === "supplier_return" ? LEGACY_COLORS.red : null;

  return (
    <div className="space-y-5">
      {/* 세부 작업 칩 */}
      <div>
        <SettingLabel label="세부 작업" />
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(subRows.length, 4)}, minmax(0, 1fr))`,
          }}
        >
          {subRows.map((row) => {
            const active = subType === row.id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSubTypeChange(row.id)}
                title={row.description}
                className="flex items-center justify-center gap-1.5 rounded-[12px] border px-3 py-2.5 text-sm font-bold transition-all hover:brightness-110"
                style={{
                  background: active ? tint(LEGACY_COLORS.blue, 14) : LEGACY_COLORS.s2,
                  borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                {active && <Check className="h-3.5 w-3.5" />}
                {row.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 부서 grid (옛 PROD_DEPTS 6 column 패턴) */}
      {showAnyDept && dept.from && (
        <DeptGrid
          label={subType === "supplier_return" ? "반품할 부서 (불량 출처)" : subType === "defect_quarantine" ? "불량 격리 부서" : "출발 부서"}
          value={fromDepartment}
          onChange={onFromDepartmentChange}
        />
      )}
      {showAnyDept && dept.to && (
        <DeptGrid
          label={
            subType === "warehouse_to_dept"
              ? "도착 부서"
              : subType === "produce" ||
                subType === "disassemble" ||
                subType === "adjust_in" ||
                subType === "adjust_out"
              ? "대상 부서"
              : "도착 부서"
          }
          value={toDepartment}
          onChange={onToDepartmentChange}
        />
      )}

      {/* caution */}
      {cautionTone && (
        <div
          className="flex items-start gap-2 rounded-[14px] border p-3"
          style={{
            background: tint(cautionTone, 8),
            borderColor: tint(cautionTone, 40),
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: cautionTone }} />
          <div className="text-[12px]" style={{ color: LEGACY_COLORS.text }}>
            {subType === "supplier_return"
              ? "공급업체 반품은 되돌릴 수 없습니다. 반품 부서(불량 출처)와 수량을 확인하세요."
              : "불량 격리는 재고가 격리 상태로 이동합니다. 대상 부서를 다시 한 번 확인하세요."}
          </div>
        </div>
      )}
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
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <SettingLabel label={label} />
      <div className="grid grid-cols-6 gap-2">
        {PROD_DEPTS.map((d) => {
          const active = d === value;
          const deptColor = MES_DEPARTMENT_COLORS[d as keyof typeof MES_DEPARTMENT_COLORS] ?? LEGACY_COLORS.purple;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              className="rounded-[12px] border px-1 py-2 text-sm font-bold transition-all hover:brightness-110"
              style={{
                background: active ? tint(deptColor, 14) : LEGACY_COLORS.s2,
                borderColor: active ? deptColor : LEGACY_COLORS.border,
                color: active ? deptColor : LEGACY_COLORS.muted2,
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
