"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { MES_DEPARTMENT_COLORS } from "@/lib/mes-department";
import type { IoSubType, IoWorkType, OperatorLike } from "./types";
import { IO_SUB_TYPES, IO_WORK_TYPES, canSeeWorkType, isExitWorkType, requiresDepartments, type DeptIoDirection } from "./ioWorkType";

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
  const rows = Math.ceil(n / cols);
  return (
    <div
      className="grid h-full min-h-0 gap-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {visibleWorkTypes.map((row) => {
        const Icon = row.icon;
        const active = workType === row.id;
        const cardAccent = isExitWorkType(row.id) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
        return (
          <button
            key={row.id}
            type="button"
            aria-pressed={active}
            onClick={() => onWorkTypeChange(row.id)}
            className="flex h-full min-h-0 flex-col items-start justify-between gap-6 rounded-[22px] border p-10 text-left transition-all hover:brightness-110"
            style={{
              background: active ? tint(cardAccent, 14) : LEGACY_COLORS.s2,
              borderColor: active ? cardAccent : LEGACY_COLORS.border,
              borderWidth: active ? 2 : 1,
              color: active ? cardAccent : LEGACY_COLORS.text,
            }}
          >
            <div className="flex items-center gap-5">
              <Icon className="h-10 w-10 shrink-0" />
              <span className="text-4xl font-black leading-tight">{row.label}</span>
            </div>
            <span
              className="text-xl font-bold leading-tight"
              style={{ color: active ? cardAccent : LEGACY_COLORS.muted2 }}
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
  deptIoDirection: DeptIoDirection | null;
  onSubTypeChange: (subType: IoSubType) => void;
  onFromDepartmentChange: (value: string) => void;
  onToDepartmentChange: (value: string) => void;
  onDeptIoDirectionChange: (dir: DeptIoDirection) => void;
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

const PROD_DEPTS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"];

function Step2Label({ label }: { label: string }) {
  return (
    <div className="mb-2 text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
      {label}
    </div>
  );
}

export function IoSubTypeStep({
  workType,
  subType,
  fromDepartment,
  toDepartment,
  deptIoDirection,
  onSubTypeChange,
  onFromDepartmentChange,
  onToDepartmentChange,
  onDeptIoDirectionChange,
}: SubTypeProps) {
  // process workType은 (입고/출고) 카드 + 대상 부서 그리드만 노출. 4 chip 숨김.
  if (workType === "process") {
    return (
      <div className="grid h-full min-h-0 gap-6" style={{ gridTemplateRows: "4fr 6fr" }}>
        <DeptGrid label="대상 부서" value={toDepartment} onChange={onToDepartmentChange} fill />
        <div className="flex min-h-0 flex-col">
          <Step2Label label="방향" />
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
            <DirectionCard
              dir="in"
              active={deptIoDirection === "in"}
              onClick={() => onDeptIoDirectionChange("in")}
            />
            <DirectionCard
              dir="out"
              active={deptIoDirection === "out"}
              onClick={() => onDeptIoDirectionChange("out")}
            />
          </div>
        </div>
      </div>
    );
  }

  const subRows = IO_SUB_TYPES[workType];
  const dept = deptVisibility(subType);
  const showAnyDept = requiresDepartments(subType) && (dept.from || dept.to);
  const cautionTone =
    subType === "defect_quarantine" || subType === "supplier_return" ? LEGACY_COLORS.red : null;
  const deptSectionCount = Number(showAnyDept && dept.from) + Number(showAnyDept && dept.to);
  const nonProcessRows = !showAnyDept
    ? "1fr"
    : cautionTone && deptSectionCount === 1
      ? "3fr 5fr 2fr"
      : deptSectionCount >= 2
        ? cautionTone
          ? "3fr 3fr 3fr 2fr"
          : "3fr 1fr 1fr"
        : "4fr 6fr";

  return (
    <div className="grid h-full min-h-0 gap-6" style={{ gridTemplateRows: nonProcessRows }}>
      {/* 세부 작업 칩 */}
      <div className="flex min-h-0 flex-col">
        <Step2Label label="세부 작업" />
        <div
          className="grid min-h-0 flex-1 gap-4"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, Math.min(subRows.length, 4))}, minmax(0, 1fr))`,
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
                className="flex h-full min-h-[120px] items-center justify-center rounded-[20px] border px-6 py-6 text-center transition-all hover:brightness-110"
                style={{
                  background: active ? tint(LEGACY_COLORS.blue, 14) : LEGACY_COLORS.s2,
                  borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                <span className="text-3xl font-black leading-tight">{row.label}</span>
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
          fill
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
          fill
        />
      )}

      {/* caution */}
      {cautionTone && (
        <div
          className="flex h-full min-h-[92px] items-center gap-4 rounded-[18px] border px-6 py-5"
          style={{
            background: tint(cautionTone, 8),
            borderColor: tint(cautionTone, 40),
          }}
        >
          <AlertTriangle className="h-8 w-8 shrink-0" style={{ color: cautionTone }} />
          <div className="text-base font-bold leading-relaxed" style={{ color: LEGACY_COLORS.text }}>
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
  fill = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fill?: boolean;
}) {
  return (
    <div className={fill ? "flex min-h-0 flex-col" : undefined}>
      <Step2Label label={label} />
      <div className={fill ? "grid min-h-0 flex-1 grid-cols-6 gap-3" : "grid grid-cols-6 gap-3"}>
        {PROD_DEPTS.map((d) => {
          const active = d === value;
          const deptColor = MES_DEPARTMENT_COLORS[d as keyof typeof MES_DEPARTMENT_COLORS] ?? LEGACY_COLORS.purple;
          return (
            <button
              key={d}
              type="button"
              aria-label={d}
              aria-pressed={active}
              onClick={() => onChange(d)}
              className={`border font-black transition-all hover:brightness-110 ${
                fill
                  ? "h-full min-h-[96px] rounded-[18px] px-2 py-6 text-3xl"
                  : "min-h-[60px] rounded-[16px] px-2 py-4 text-base"
              }`}
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

function DirectionCard({
  dir,
  active,
  onClick,
}: {
  dir: DeptIoDirection;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "in" ? ArrowDownToLine : ArrowUpFromLine;
  const label = dir === "in" ? "입고" : "출고";
  const activeColor = dir === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-[96px] items-center justify-center gap-3 rounded-[18px] border p-6 text-left transition-all hover:brightness-110"
      style={{
        background: active ? tint(activeColor, 14) : LEGACY_COLORS.s2,
        borderColor: active ? activeColor : LEGACY_COLORS.border,
        borderWidth: active ? 2 : 1,
        color: active ? activeColor : LEGACY_COLORS.text,
      }}
    >
      <Icon className="h-12 w-12 shrink-0" />
      <span className="text-4xl font-black leading-tight">{label}</span>
    </button>
  );
}
