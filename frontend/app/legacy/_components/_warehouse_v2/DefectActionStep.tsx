"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { IoSubType } from "./types";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { ChildDecision } from "../_defect_hub/DisassembleTree";
import { ReasonFormFields } from "../_defect_hub/ReasonFormFields";
import { DisassembleTree } from "../_defect_hub/DisassembleTree";

interface DefectActionStepProps {
  subType: IoSubType;
  selectedLocation: DefectLocation;
  action: "scrap" | "restore" | "supplier_return" | "disassemble" | null;
  reasonCategory: string;
  reasonMemo: string;
  bomDecisions: ChildDecision[];
  onActionChange: (a: "scrap" | "restore" | "supplier_return" | "disassemble") => void;
  onReasonChange: (category: string, memo: string) => void;
  onBomDecisionsChange: (decisions: ChildDecision[]) => void;
  canAdvance: boolean;
  onAdvance: () => void;
}

function SummaryCard({ location }: { location: DefectLocation }) {
  return (
    <div
      className="rounded-[14px] border px-5 py-4"
      style={{
        background: tint(LEGACY_COLORS.red, 6),
        borderColor: tint(LEGACY_COLORS.red, 28),
      }}
    >
      <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
        {location.item_name}
      </div>
      <div
        className="mt-0.5 flex flex-wrap items-center gap-3 text-xs font-bold"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        <span>{location.item_code}</span>
        <span>격리 수량 {formatQty(Number(location.quantity))}개</span>
        <span>{location.department}</span>
        <span>격리 {new Date(location.defective_at).toLocaleDateString("ko-KR")}</span>
      </div>
    </div>
  );
}

type ActionOption = {
  value: "scrap" | "restore" | "supplier_return" | "disassemble";
  label: string;
  desc: string;
};

const PROCESS_OPTIONS: ActionOption[] = [
  { value: "restore", label: "정상 복귀", desc: "격리 해제 후 정상 재고로 복귀합니다." },
  { value: "scrap", label: "폐기", desc: "재고에서 영구 제거합니다. 창고 결재 후 처리됩니다." },
  { value: "disassemble", label: "분해 처리", desc: "PA/PF 조립품 분해. 자식 부품 처리를 선택합니다." },
];

export function DefectActionStep({
  subType,
  selectedLocation,
  action,
  reasonCategory,
  reasonMemo,
  bomDecisions,
  onActionChange,
  onReasonChange,
  onBomDecisionsChange,
  canAdvance,
  onAdvance,
}: DefectActionStepProps) {
  const isPaPf =
    selectedLocation.item_code.startsWith("PA-") ||
    selectedLocation.item_code.startsWith("PF-") ||
    selectedLocation.item_code.startsWith("PA") ||
    selectedLocation.item_code.startsWith("PF");

  if (subType === "defect_restore") {
    return (
      <div className="flex flex-col gap-4">
        <SummaryCard location={selectedLocation} />

        <div
          className="rounded-[12px] border px-4 py-3 text-sm font-bold"
          style={{
            background: tint(LEGACY_COLORS.green, 8),
            borderColor: tint(LEGACY_COLORS.green, 30),
            color: LEGACY_COLORS.green,
          }}
        >
          정상 복귀 (즉시 반영)
        </div>

        <ReasonFormFields
          category={reasonCategory}
          memo={reasonMemo}
          onCategoryChange={(cat) => onReasonChange(cat, reasonMemo)}
          onMemoChange={(memo) => onReasonChange(reasonCategory, memo)}
          required
        />

        <button
          type="button"
          onClick={onAdvance}
          disabled={!canAdvance}
          className="flex w-full items-center justify-center gap-2 rounded-[18px] px-7 py-5 text-lg font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
          style={{ background: LEGACY_COLORS.red }}
        >
          {canAdvance ? "제출하기 →" : "사유 카테고리를 선택하세요"}
        </button>
      </div>
    );
  }

  if (subType === "supplier_return") {
    return (
      <div className="flex flex-col gap-4">
        <SummaryCard location={selectedLocation} />

        <div
          className="rounded-[12px] border px-4 py-3 text-sm font-bold"
          style={{
            background: tint(LEGACY_COLORS.yellow, 8),
            borderColor: tint(LEGACY_COLORS.yellow, 30),
            color: LEGACY_COLORS.yellow,
          }}
        >
          공급처 반품 (창고 결재 필요)
        </div>

        <ReasonFormFields
          category={reasonCategory}
          memo={reasonMemo}
          onCategoryChange={(cat) => onReasonChange(cat, reasonMemo)}
          onMemoChange={(memo) => onReasonChange(reasonCategory, memo)}
          required
        />

        <button
          type="button"
          onClick={onAdvance}
          disabled={!canAdvance}
          className="flex w-full items-center justify-center gap-2 rounded-[18px] px-7 py-5 text-lg font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
          style={{ background: LEGACY_COLORS.red }}
        >
          {canAdvance ? "제출하기 →" : "사유 카테고리를 선택하세요"}
        </button>
      </div>
    );
  }

  // defect_process
  const options = isPaPf ? PROCESS_OPTIONS : PROCESS_OPTIONS.filter((o) => o.value !== "disassemble");

  return (
    <div className="flex flex-col gap-4">
      <SummaryCard location={selectedLocation} />

      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-3 transition-colors"
            style={{
              borderColor: action === opt.value ? LEGACY_COLORS.red : LEGACY_COLORS.border,
              background:
                action === opt.value
                  ? tint(LEGACY_COLORS.red, 6)
                  : LEGACY_COLORS.s2,
            }}
          >
            <input
              type="radio"
              name="defect-action"
              value={opt.value}
              checked={action === opt.value}
              onChange={() => onActionChange(opt.value)}
              className="mt-0.5 accent-red-500"
            />
            <div>
              <div className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                {opt.label}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted }}>
                {opt.desc}
              </div>
            </div>
          </label>
        ))}
      </div>

      {action === "disassemble" && (
        <DisassembleTree
          parentItemId={selectedLocation.item_id}
          parentQty={Number(selectedLocation.quantity)}
          parentDept={selectedLocation.department}
          decisions={bomDecisions}
          onChange={onBomDecisionsChange}
        />
      )}

      <ReasonFormFields
        category={reasonCategory}
        memo={reasonMemo}
        onCategoryChange={(cat) => onReasonChange(cat, reasonMemo)}
        onMemoChange={(memo) => onReasonChange(reasonCategory, memo)}
        required
      />

      <button
        type="button"
        onClick={onAdvance}
        disabled={!canAdvance}
        className="flex w-full items-center justify-center gap-2 rounded-[18px] px-7 py-5 text-lg font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
        style={{ background: LEGACY_COLORS.red }}
      >
        {canAdvance ? "제출하기 →" : "처리 방법과 사유를 선택하세요"}
      </button>
    </div>
  );
}
