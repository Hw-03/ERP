"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight } from "lucide-react";
import presentation from "../mobilePresentation.module.css";
import { tint } from "@/lib/mes/colorUtils";
import { departmentDisplayColor, MES_DEPARTMENT_COLORS } from "@/lib/mes-department";
import type { IoSubType, IoWorkType, OperatorLike } from "../../_warehouse_v2/types";
import {
  IO_SUB_TYPES,
  IO_WORK_TYPES,
  canSeeWorkType,
  deptVisibility,
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
  selectedWorkType,
  operator,
  onWorkTypeChange,
}: {
  selectedWorkType: IoWorkType | null;
  operator: OperatorLike | null;
  onWorkTypeChange: (workType: IoWorkType) => void;
}) {
  const visible = IO_WORK_TYPES.filter((row) => canSeeWorkType(row.id, operator));
  return (
    <div className={`${presentation.surface} ${presentation.choiceList}`}>
      {visible.map((row) => {
        const Icon = row.icon;
        const active = selectedWorkType === row.id;
        return (
          <button
            key={row.id}
            type="button"
            aria-pressed={active}
            onClick={() => onWorkTypeChange(row.id)}
            className={presentation.menuRow}
          >
            <span className={presentation.choiceIcon} style={{ color: row.id === "internal_use" ? LEGACY_COLORS.red : LEGACY_COLORS.blue }} aria-hidden="true"><Icon /></span>
            <span className="min-w-0 flex-1">
              <span className="block leading-snug">{row.label}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} aria-hidden />
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
  className = "flex flex-1 flex-col",
  options = PROD_DEPTS,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  options?: readonly string[];
}) {
  const colsClass = options.length === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={className}>
      <Label text={label} />
      <div className={`grid flex-1 ${colsClass} gap-2`}>
        {options.map((d) => {
          const active = d === value;
          const color = departmentDisplayColor(
            MES_DEPARTMENT_COLORS[d as keyof typeof MES_DEPARTMENT_COLORS] ?? LEGACY_COLORS.purple,
            d,
          );
          return (
            <button
              key={d}
              type="button"
              aria-label={d}
              aria-pressed={active}
              onClick={() => onChange(d)}
              className="min-h-[64px] rounded-[12px] border text-lg font-bold transition-[transform] active:scale-95"
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
  if (workType === "process" || workType === "warehouse_adjust") {
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-1 flex-col">
          <Label text="방향" />
          <div className={presentation.twoChoices}>
            {(["in", "out"] as DeptIoDirection[]).map((dir) => {
              const active = deptIoDirection === dir;
              const color = dir === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => onDeptIoDirectionChange(dir)}
                  className={presentation.directionChoice}
                  style={{
                    background: active ? tint(color, 14) : LEGACY_COLORS.s2,
                    borderColor: active ? color : LEGACY_COLORS.border,
                    borderWidth: active ? 2 : 1,
                    color: active ? color : LEGACY_COLORS.text,
                  }}
                >
                  <span className={presentation.choiceIcon} style={{ color }} aria-hidden="true">
                    {dir === "in" ? <ArrowDownToLine /> : <ArrowUpFromLine />}
                  </span>
                  {dir === "in" ? "입고" : "출고"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const subRows = IO_SUB_TYPES[workType];
  const dept = deptVisibility(subType);
  const showAnyDept = requiresDepartments(subType) && (dept.from || dept.to);
  const caution =
    subType === "defect_quarantine" || subType === "supplier_return" ? LEGACY_COLORS.red : null;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-1 flex-col">
        <Label text="세부 작업" />
        <div className={subRows.length === 2 ? presentation.twoChoices : "grid flex-1 grid-cols-2 gap-2"}>
          {subRows.map((row) => {
            const active = subType === row.id && (workType !== "warehouse_io" || deptIoDirection != null);
            const tone = workType === "warehouse_io" && row.id === "warehouse_to_dept" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSubTypeChange(row.id)}
                className="flex min-h-[56px] items-center justify-center rounded-[14px] border px-3 py-3 text-center transition-[transform] active:scale-95"
                style={{
                  background: active ? tint(tone, 14) : LEGACY_COLORS.s2,
                  borderColor: active ? tone : LEGACY_COLORS.border,
                  color: active ? tone : LEGACY_COLORS.muted2,
                }}
              >
                <span className="text-xl font-bold leading-tight">{row.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {showAnyDept && dept.from && (
        <DeptGrid
          className="flex flex-1 flex-col"
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
      )}
      {showAnyDept && dept.to && (
        <DeptGrid
          className="flex flex-1 flex-col"
          label={
            subType === "warehouse_to_dept"
              ? "도착 부서"
              : subType === "internal_use_out"
              ? "사용 부서"
              : "대상 부서"
          }
          value={toDepartment}
          onChange={onToDepartmentChange}
          options={subType === "internal_use_out" ? ["AS", "연구"] : undefined}
        />
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
