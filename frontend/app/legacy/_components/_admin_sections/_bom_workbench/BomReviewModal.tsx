"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import { BomBadge } from "./BomBadge";

/**
 * 검토 · 완료 모달.
 *
 * 저장 대상 BOM row 요약 + 검증 결과(수량≤0 / 중복 자식)를 보여주고
 *   - 미완료 parent → [완료로 표시] (검증 통과 + row≥1 일 때만 활성)
 *   - 완료 parent   → [완료 해제]
 *
 * 순환 참조는 BOM 추가 시점에 backend 가 이미 차단하므로 저장된 row 에는
 * 존재할 수 없음 — 본 모달은 수량/중복만 사전 점검.
 */
interface Props {
  parent: Item;
  rows: BOMEntry[];
  items: Item[];
  isCompleted: boolean;
  onClose: () => void;
  onConfirm: (completed: boolean) => Promise<void>;
}

export function BomReviewModal({ parent, rows, items, isCompleted, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.item_id, i])), [items]);

  const badQty = rows.filter((r) => !(Number(r.quantity) > 0));
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.child_item_id, (seen.get(r.child_item_id) ?? 0) + 1);
  const dupChildIds = Array.from(seen.entries())
    .filter(([, n]) => n > 1)
    .map(([id]) => id);

  const hasIssue = badQty.length > 0 || dupChildIds.length > 0;
  const canComplete = rows.length > 0 && !hasIssue;

  async function handleConfirm() {
    // 완료로 표시하는 방향은 검증 통과 + row≥1 일 때만. 완료 해제는 항상 허용.
    if (!isCompleted && !canComplete) return;
    setBusy(true);
    try {
      await onConfirm(!isCompleted);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmModal
      open
      title="BOM 검토 · 완료"
      tone={isCompleted ? "caution" : "normal"}
      onClose={onClose}
      onConfirm={handleConfirm}
      busy={busy}
      confirmLabel={isCompleted ? "완료 해제" : "완료로 표시"}
      busyLabel="처리 중…"
      confirmAccent={
        isCompleted
          ? LEGACY_COLORS.muted2
          : canComplete
            ? LEGACY_COLORS.green
            : LEGACY_COLORS.border
      }
    >
      <div className="flex flex-col gap-3">
        {/* 부모 헤더 */}
        <div
          className="flex items-center gap-3 rounded-[12px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <BomBadge processTypeCode={parent.process_type_code} small />
          <div className="min-w-0">
            <TruncatedText className="truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
              {parent.item_name}
            </TruncatedText>
            <TruncatedText className="truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
              {parent.erp_code ?? "(코드 없음)"} · {rows.length}개 자식
            </TruncatedText>
          </div>
        </div>

        {/* 저장 대상 요약 */}
        <div
          className="max-h-[240px] overflow-y-auto rounded-[12px] border"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          {rows.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              등록된 BOM 이 없습니다.
            </div>
          ) : (
            rows.map((r) => {
              const child = itemMap.get(r.child_item_id);
              const bad = !(Number(r.quantity) > 0);
              const dup = dupChildIds.includes(r.child_item_id);
              return (
                <div
                  key={r.bom_id}
                  className="grid items-center gap-2 px-3 py-1.5 text-xs"
                  style={{
                    gridTemplateColumns: "auto 1fr auto",
                    borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                    background:
                      bad || dup ? `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)` : "transparent",
                  }}
                >
                  <BomBadge processTypeCode={child?.process_type_code} small />
                  <div className="min-w-0">
                    <TruncatedText className="truncate font-semibold" style={{ color: LEGACY_COLORS.text }}>
                      {child?.item_name ?? "(삭제된 품목)"}
                      {dup && (
                        <span className="ml-1 font-bold" style={{ color: LEGACY_COLORS.red }}>
                          · 중복
                        </span>
                      )}
                    </TruncatedText>
                  </div>
                  <span
                    className="font-semibold"
                    style={{ color: bad ? LEGACY_COLORS.red : LEGACY_COLORS.muted }}
                  >
                    ×{formatQty(r.quantity)} {r.unit || child?.unit || "EA"}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* 검증 결과 */}
        {hasIssue ? (
          <div
            className="flex items-start gap-2 rounded-[12px] border px-3 py-2 text-xs font-semibold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              {badQty.length > 0 && <div>수량이 0 이하인 항목 {badQty.length}건 — 수정 후 완료하세요.</div>}
              {dupChildIds.length > 0 && <div>중복 자식 {dupChildIds.length}건 — 정리 후 완료하세요.</div>}
            </div>
          </div>
        ) : isCompleted ? (
          <div
            className="flex items-center gap-2 rounded-[12px] border px-3 py-2 text-xs font-semibold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            <AlertTriangle size={14} className="shrink-0" />
            이미 완료 처리된 BOM 입니다. 해제하면 &quot;작업중&quot; 으로 돌아갑니다.
          </div>
        ) : (
          <div
            className="flex items-center gap-2 rounded-[12px] border px-3 py-2 text-xs font-semibold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.green} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 40%, transparent)`,
              color: LEGACY_COLORS.green,
            }}
          >
            <CheckCircle2 size={14} className="shrink-0" />
            검증 통과 — 완료로 표시할 수 있습니다.
          </div>
        )}
      </div>
    </ConfirmModal>
  );
}
