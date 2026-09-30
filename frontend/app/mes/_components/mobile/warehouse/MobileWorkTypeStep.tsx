"use client";

import Image from "next/image";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ChevronRight } from "lucide-react";
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

function DeptGrid({
  value,
  onChange,
  className = "flex flex-1 flex-col",
  options = PROD_DEPTS,
  stacked = false,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  options?: readonly string[];
  stacked?: boolean;
}) {
  const colsClass = stacked ? "grid-cols-1" : options.length === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={className}>
      <div className={`grid flex-1 ${colsClass} gap-2`}>
        {options.map((d) => {
          const active = d === value;
          const illustrated = d === "AS" || d === "연구";
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
              className={`${illustrated ? presentation.illustratedChoice : ""} min-h-[64px] rounded-[12px] border text-lg font-bold transition-[transform] active:scale-95`}
              style={{
                background: illustrated ? tint(color, active ? 16 : 7) : active ? tint(color, 14) : LEGACY_COLORS.s2,
                borderColor: active ? color : illustrated ? tint(color, 25) : LEGACY_COLORS.border,
                borderWidth: illustrated ? (active ? 2 : 1) : undefined,
                color: active ? color : LEGACY_COLORS.muted2,
              }}
            >
              <span>{d}</span>
              {illustrated && (
                <Image
                  src={`/images/warehouse/dexray-${d === "AS" ? "as-service" : "research-board"}.webp`}
                  alt=""
                  width={1536}
                  height={1024}
                  unoptimized
                  loading="eager"
                  className={presentation.choiceArt}
                  draggable={false}
                />
              )}
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
  if (workType === "internal_use") {
    return <DeptGrid value={toDepartment} onChange={onToDepartmentChange} options={["AS", "연구"]} stacked />;
  }

  if (workType === "process" || workType === "warehouse_adjust") {
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-1 flex-col">
          <div className={presentation.twoChoices}>
            {(["in", "out"] as DeptIoDirection[]).map((dir) => {
              const active = deptIoDirection === dir;
              const color = dir === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => onDeptIoDirectionChange(dir)}
                  className={`${presentation.directionChoice} ${presentation.illustratedChoice}`}
                  aria-pressed={active}
                  style={{
                    background: tint(color, active ? 16 : 7),
                    borderColor: active ? color : tint(color, 25),
                    borderWidth: active ? 2 : 1,
                    color: active ? color : LEGACY_COLORS.text,
                  }}
                >
                  <span>{dir === "in" ? "입고" : "출고"}</span>
                  <Image
                    src={`/images/warehouse/dexray-stock-${dir}.webp`}
                    alt=""
                    width={840}
                    height={560}
                    unoptimized
                    loading="eager"
                    className={presentation.choiceArt}
                    draggable={false}
                  />
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
        <div className={subRows.length === 2 ? presentation.twoChoices : "grid flex-1 grid-cols-2 gap-2"}>
          {subRows.map((row) => {
            const active = subType === row.id && (workType !== "warehouse_io" || deptIoDirection != null);
            const illustrated = workType === "warehouse_io";
            const tone = workType === "warehouse_io" && row.id === "warehouse_to_dept" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSubTypeChange(row.id)}
                className={`${illustrated ? presentation.illustratedChoice : "flex items-center justify-center"} min-h-[56px] rounded-[14px] border px-3 py-3 text-center transition-[transform] active:scale-95`}
                style={{
                  background: illustrated ? tint(tone, active ? 16 : 7) : active ? tint(tone, 14) : LEGACY_COLORS.s2,
                  borderColor: active ? tone : illustrated ? tint(tone, 25) : LEGACY_COLORS.border,
                  borderWidth: illustrated ? (active ? 2 : 1) : undefined,
                  color: active ? tone : illustrated ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                }}
              >
                <span className="text-xl font-bold leading-tight">{row.label}</span>
                {illustrated && (
                  <Image
                    src={`/images/warehouse/dexray-stock-${row.id === "warehouse_to_dept" ? "out" : "in"}.webp`}
                    alt=""
                    width={840}
                    height={560}
                    unoptimized
                    loading="eager"
                    className={presentation.choiceArt}
                    draggable={false}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {showAnyDept && dept.from && (
        <DeptGrid
          className="flex flex-1 flex-col"
          value={fromDepartment}
          onChange={onFromDepartmentChange}
        />
      )}
      {showAnyDept && dept.to && (
        <DeptGrid
          className="flex flex-1 flex-col"
          value={toDepartment}
          onChange={onToDepartmentChange}
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
