"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { Department } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { SettingLabel } from "./_atoms";
import { WorkTypeCardGrid } from "./WorkTypeCardGrid";
import {
  CAUTION_WORK_TYPES,
  PROD_DEPTS,
  workTypeNeedsDept,
} from "./_constants";
import type {
  DefectiveSource,
  Direction,
  TransferDirection,
  WorkType,
} from "./_constants";

export function WorkTypeStep({
  workType,
  onWorkTypeChange,
  rawDirection,
  setRawDirection,
  warehouseDirection,
  setWarehouseDirection,
  deptDirection,
  setDeptDirection,
  selectedDept,
  setSelectedDept,
  defectiveSource,
  setDefectiveSource,
  availableWorkTypes,
  ready,
  onConfirm,
}: {
  workType: WorkType;
  onWorkTypeChange: (wt: WorkType) => void;
  rawDirection: Direction;
  setRawDirection: (d: Direction) => void;
  warehouseDirection: TransferDirection;
  setWarehouseDirection: (d: TransferDirection) => void;
  deptDirection: Direction;
  setDeptDirection: (d: Direction) => void;
  selectedDept: Department;
  setSelectedDept: (d: Department) => void;
  defectiveSource: DefectiveSource;
  setDefectiveSource: (s: DefectiveSource) => void;
  availableWorkTypes: WorkType[];
  ready: boolean;
  onConfirm: () => void;
}) {
  const isRawReturn = workType === "raw-io" && rawDirection === "return";
  const isCaution = CAUTION_WORK_TYPES.includes(workType) || isRawReturn;
  const accent = isCaution ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  const [pendingDept, setPendingDept] = useState<Department | null>(null);

  const directionButtons =
    workType === "raw-io"
      ? [
          { id: "in", label: "창고에 입고", active: rawDirection === "in", onClick: () => setRawDirection("in") },
          { id: "out", label: "창고에서 출고", active: rawDirection === "out", onClick: () => setRawDirection("out") },
          { id: "return", label: "공급업체 반품", active: rawDirection === "return", onClick: () => setRawDirection("return") },
        ]
      : workType === "warehouse-io"
        ? [
            { id: "wh-to-dept", label: `창고→${selectedDept}`, active: warehouseDirection === "wh-to-dept", onClick: () => setWarehouseDirection("wh-to-dept") },
            { id: "dept-to-wh", label: `${selectedDept}→창고`, active: warehouseDirection === "dept-to-wh", onClick: () => setWarehouseDirection("dept-to-wh") },
          ]
        : workType === "dept-io"
          ? [
              { id: "in", label: `${selectedDept}에 입고`, active: deptDirection === "in", onClick: () => setDeptDirection("in") },
              { id: "out", label: `${selectedDept}에서 출고`, active: deptDirection === "out", onClick: () => setDeptDirection("out") },
            ]
          : [];

  return (
    <div className="space-y-5">
      {/* 작업 유형 grid */}
      <div>
        <SettingLabel label="작업 유형 선택" />
        <WorkTypeCardGrid
          workType={workType}
          availableWorkTypes={availableWorkTypes}
          onWorkTypeChange={onWorkTypeChange}
        />
      </div>

      {/* 이동 방향 */}
      {directionButtons.length > 0 && (
        <div>
          <SettingLabel label="이동 방향" />
          <div className={`grid gap-2 ${directionButtons.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {directionButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={btn.onClick}
                className="flex items-center justify-center gap-1.5 rounded-[12px] border px-3 py-2.5 text-sm font-bold transition-all hover:brightness-110"
                style={{
                  background: btn.active ? `color-mix(in srgb, ${accent} 14%, transparent)` : LEGACY_COLORS.s2,
                  borderColor: btn.active ? accent : LEGACY_COLORS.border,
                  color: btn.active ? accent : LEGACY_COLORS.muted2,
                }}
              >
                {btn.active && <Check className="h-3.5 w-3.5" />}
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 부서 */}
      {(workTypeNeedsDept(workType) || isRawReturn) && (
        <div>
          <SettingLabel
            label={
              isRawReturn
                ? "반품할 부서 (불량 출처)"
                : workType === "defective-register"
                  ? "불량 격리 부서"
                  : "대상 부서"
            }
          />
          <div className="grid grid-cols-6 gap-2">
            {PROD_DEPTS.map((d) => {
              const active = d === selectedDept;
              const handleDeptClick = () => {
                if (d === selectedDept) return;
                if (workType === "warehouse-io") {
                  setPendingDept(d);
                  return;
                }
                setSelectedDept(d);
              };
              return (
                <button
                  key={d}
                  onClick={handleDeptClick}
                  className="rounded-[12px] border px-1 py-2 text-sm font-bold transition-all hover:brightness-110"
                  style={{
                    background: active ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)` : LEGACY_COLORS.s2,
                    borderColor: active ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                    color: active ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2,
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 불량 발견 위치 */}
      {workType === "defective-register" && (
        <div>
          <SettingLabel label="불량 발견 위치" />
          <div className="grid grid-cols-2 gap-2">
            {(["warehouse", "production"] as DefectiveSource[]).map((src) => {
              const active = src === defectiveSource;
              const label = src === "warehouse" ? "창고에서 발견" : `${selectedDept}에서 발견`;
              return (
                <button
                  key={src}
                  onClick={() => setDefectiveSource(src)}
                  className="rounded-[12px] border px-3 py-2.5 text-sm font-bold transition-all hover:brightness-110"
                  style={{
                    background: active ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)` : LEGACY_COLORS.s2,
                    borderColor: active ? LEGACY_COLORS.red : LEGACY_COLORS.border,
                    color: active ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 주의 사항 */}
      {isCaution && (
        <div
          className="flex items-start gap-2 rounded-[14px] border p-3"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.yellow }} />
          <div className="text-[12px]" style={{ color: LEGACY_COLORS.text }}>
            {isRawReturn
              ? "공급업체 반품은 되돌릴 수 없습니다. 반품 부서(불량 출처)와 수량을 확인하세요."
              : "불량 등록은 재고가 격리 상태로 이동합니다. 대상 부서·발견 위치를 다시 한 번 확인하세요."}
          </div>
        </div>
      )}

      {/* 진행 버튼 */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onConfirm}
          disabled={!ready}
          className="rounded-[14px] px-6 py-3 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
          style={{ background: accent }}
        >
          이 작업으로 진행 →
        </button>
      </div>

      <ConfirmModal
        open={pendingDept !== null}
        title="대상 부서 변경"
        tone="caution"
        confirmLabel="변경"
        cancelLabel="유지"
        onClose={() => setPendingDept(null)}
        onConfirm={() => {
          if (pendingDept) setSelectedDept(pendingDept);
          setPendingDept(null);
        }}
      >
        <p className="text-sm" style={{ color: LEGACY_COLORS.text }}>
          담당자 부서가 <b>{selectedDept}</b>(으)로 지정되어 있습니다.
          <br />
          대상 부서를 <b>{pendingDept}</b>(으)로 변경하시겠습니까?
        </p>
      </ConfirmModal>
    </div>
  );
}
