"use client";

import type { Employee, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TYPO } from "../../../tokens";
import {
  PrimaryActionButton,
  SectionCard,
  SectionCardRow,
  StickyFooter,
} from "../../../primitives";
import { useDeptWizard } from "../context";

export function StepConfirm({
  items,
  employee,
  onSubmit,
  onBack,
}: {
  items: Item[];
  employee: Employee | null;
  onSubmit: () => void;
  onBack?: () => void;
}) {
  const { state, dispatch } = useDeptWizard();

  const selectedList = Array.from(state.items.entries())
    .map(([id, q]) => ({ item: items.find((i) => i.item_id === id), qty: q }))
    .filter((e): e is { item: Item; qty: number } => !!e.item);

  const totalQty = selectedList.reduce((s, e) => s + e.qty, 0);
  const directionLabel = state.direction === "in" ? "입고" : state.direction === "out" ? "출고" : "-";
  const intent: "success" | "danger" = state.direction === "in" ? "success" : "danger";
  const headlineColor = state.direction === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.red;
  const headline = `${state.department ?? ""}부 · ${directionLabel}을 처리합니다`;

  return (
    <div className="flex flex-col gap-3 px-4 pb-36 pt-4">
      <div>
        <div
          className={`${TYPO.headline} font-black leading-tight`}
          style={{ color: headlineColor }}
        >
          {headline}
        </div>
        <div className={`${TYPO.caption} mt-1`} style={{ color: LEGACY_COLORS.muted2 }}>
          확정을 누르면 지금 즉시 재고가 반영됩니다.
        </div>
      </div>

      <SectionCard title="기본 정보" padding="sm">
        <SectionCardRow label="부서" value={state.department ?? "-"} />
        <SectionCardRow label="담당" value={employee?.name ?? "-"} />
        <SectionCardRow
          label="방향"
          value={state.direction === "in" ? "부서 입고" : state.direction === "out" ? "부서 출고" : "-"}
          valueColor={headlineColor}
        />
      </SectionCard>

      <SectionCard
        title={`품목 · ${selectedList.length}건 · 합계 ${formatQty(totalQty)}`}
        padding="none"
      >
        <div className="max-h-[30vh] overflow-y-auto">
          {selectedList.map((e, idx) => (
            <div
              key={e.item.item_id}
              className="flex items-center justify-between px-4 py-2"
              style={{
                borderBottom: idx === selectedList.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              <div className="min-w-0 flex-1">
                <div className={`${TYPO.body} truncate font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {e.item.item_name}
                </div>
                <div className={`${TYPO.caption} truncate`} style={{ color: LEGACY_COLORS.muted }}>
                  {e.item.erp_code}
                </div>
              </div>
              <div
                className={`${TYPO.title} shrink-0 font-black tabular-nums`}
                style={{ color: LEGACY_COLORS.blue }}
              >
                {formatQty(e.qty)} {e.item.unit}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="참조번호 · 비고" padding="sm">
        <div className="flex flex-col gap-2">
          <input
            value={state.referenceNo}
            onChange={(e) => dispatch({ type: "SET_REFERENCE", referenceNo: e.target.value })}
            placeholder="참조번호 (예: DIO-240412)"
            className={`${TYPO.body} rounded-[14px] border px-3 py-3 outline-none`}
            style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
          <textarea
            value={state.note}
            onChange={(e) => dispatch({ type: "SET_NOTE", note: e.target.value })}
            rows={2}
            placeholder="비고 (선택)"
            className={`${TYPO.body} resize-none rounded-[14px] border px-3 py-3 outline-none`}
            style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </div>
      </SectionCard>

      {state.error ? (
        <div
          className={`${TYPO.caption} rounded-[14px] border px-3 py-2`}
          style={{
            background: "rgba(242,95,92,.12)",
            borderColor: "rgba(242,95,92,.28)",
            color: LEGACY_COLORS.red,
          }}
        >
          {state.error}
        </div>
      ) : null}

      <StickyFooter>
        <div className="flex flex-col gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={state.submitting}
              className={`${TYPO.caption} w-full rounded-[14px] py-2 font-semibold disabled:opacity-40`}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              뒤로 가서 수정
            </button>
          ) : null}
          <PrimaryActionButton
            intent={intent}
            label={`부서 ${directionLabel} 확정`}
            count={selectedList.length}
            total={totalQty}
            onClick={onSubmit}
            disabled={state.submitting}
            loadingText="처리 중…"
          />
        </div>
      </StickyFooter>
    </div>
  );
}
