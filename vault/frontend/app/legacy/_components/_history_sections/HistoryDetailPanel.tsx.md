---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_history_sections/HistoryDetailPanel.tsx
status: active
updated: 2026-04-27
source_sha: 7db1583e5fba
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# HistoryDetailPanel.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_history_sections/HistoryDetailPanel.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `8643` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_history_sections/_history_sections|frontend/app/legacy/_components/_history_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { Activity } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, transactionColor, transactionLabel } from "../legacyUi";
import { CATEGORY_META, formatHistoryDate, parseUtc } from "./historyShared";

type Props = {
  selected: TransactionLog | null;
  editingNotes: string;
  setEditingNotes: (v: string) => void;
  savingNotes: boolean;
  onSaveNotes: () => void;
  itemRecentLogs: TransactionLog[];
  onSelectLog: (log: TransactionLog) => void;
};

export function HistoryDetailPanel({
  selected,
  editingNotes,
  setEditingNotes,
  savingNotes,
  onSaveNotes,
  itemRecentLogs,
  onSelectLog,
}: Props) {
  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center" style={{ color: LEGACY_COLORS.muted2 }}>
          <Activity className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <div className="text-base">테이블에서 항목을 클릭하면<br />상세 내용이 표시됩니다</div>
        </div>
      </div>
    );
  }

  const tcolor = transactionColor(selected.transaction_type);

  return (
    <div className="space-y-4">
      {/* 거래 유형 + 수량 강조 */}
      <div
        className="rounded-[24px] border p-5 text-center"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <span
          className="inline-flex rounded-full px-4 py-1.5 text-sm font-bold"
          style={{ background: `color-mix(in srgb, ${tcolor} 14%, transparent)`, color: tcolor }}
        >
          {transactionLabel(selected.transaction_type)}
        </span>
        <div className="mt-3 text-4xl font-black" style={{ color: tcolor }}>
          {Number(selected.quantity_change) >= 0 ? "+" : ""}
          {formatNumber(selected.quantity_change)}
          <span className="ml-2 text-base font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
            {selected.item_unit}
          </span>
        </div>
        {(selected.quantity_before != null || selected.quantity_after != null) && (
          <div className="mt-3 flex items-center gap-2">
            <div
              className="flex-1 rounded-[14px] border px-3 py-2 text-center"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`,
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 25%, transparent)`,
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>
                처리 전
              </div>
              <div className="mt-1 text-lg font-black" style={{ color: LEGACY_COLORS.muted2 }}>
                {selected.quantity_before != null ? formatNumber(selected.quantity_before) : "-"}
              </div>
            </div>
            <span className="text-lg" style={{ color: LEGACY_COLORS.muted2 }}>→</span>
            <div
              className="flex-1 rounded-[14px] border px-3 py-2 text-center"
              style={{
                background: `color-mix(in srgb, ${tcolor} 8%, transparent)`,
                borderColor: `color-mix(in srgb, ${tcolor} 30%, transparent)`,
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tcolor }}>
                처리 후
              </div>
              <div className="mt-1 text-lg font-black" style={{ color: tcolor }}>
                {selected.quantity_after != null ? formatNumber(selected.quantity_after) : "-"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 상세 정보 */}
      <div
        className="space-y-2.5 rounded-[24px] border p-4"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {(
          [
            ["품목명", selected.item_name],
            ["ERP코드", selected.erp_code ?? "-"],
            ["분류", (CATEGORY_META[selected.item_category] ?? { label: selected.item_category }).label],
            ["단위", selected.item_unit],
            ["담당자", selected.produced_by ?? "-"],
            ["참조번호", selected.reference_no ?? "-"],
            ["일시", parseUtc(selected.created_at).toLocaleString("ko-KR")],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              {label}
            </span>
            <span className="text-right text-base font-semibold break-all" style={{ color: LEGACY_COLORS.text }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* 메모 편집 */}
      <div
        className="rounded-[24px] border p-4"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="mb-2 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
          메모
        </div>
        <textarea
          value={editingNotes}
          onChange={(e) => setEditingNotes(e.target.value)}
          placeholder="메모를 입력하세요..."
          className="min-h-[80px] w-full rounded-[14px] border px-3 py-2.5 text-base outline-none"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
        <button
          onClick={onSaveNotes}
          disabled={savingNotes || editingNotes === (selected.notes ?? "")}
          className="mt-2 w-full rounded-[14px] py-2.5 text-base font-bold text-white disabled:opacity-40"
          style={{ background: LEGACY_COLORS.blue }}
        >
          {savingNotes ? "저장 중..." : "메모 저장"}
        </button>
      </div>

      {/* 이 품목의 최근 거래 */}
      <div
        className="rounded-[24px] border p-4"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
          이 품목의 최근 거래
        </div>
        {itemRecentLogs.length === 0 ? (
          <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>최근 거래 없음</div>
        ) : (
          <div className="space-y-2">
            {itemRecentLogs.map((log) => (
              <button
                key={log.log_id}
                onClick={() => onSelectLog(log)}
                className="flex w-full items-center justify-between rounded-[14px] border p-3 text-left transition-all hover:brightness-110"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="flex-1 min-w-0">
                  <span
                    className="inline-flex rounded px-2 py-0.5 text-xs font-bold"
                    style={{
                      background: `color-mix(in srgb, ${transactionColor(log.transaction_type)} 14%, transparent)`,
                      color: transactionColor(log.transaction_type),
                    }}
                  >
                    {transactionLabel(log.transaction_type)}
                  </span>
                  <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {formatHistoryDate(log.created_at)}
                  </div>
                  {(log.quantity_before != null || log.quantity_after != null) && (
                    <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {log.quantity_before != null ? formatNumber(log.quantity_before) : "-"} →{" "}
                      {log.quantity_after != null ? formatNumber(log.quantity_after) : "-"}
                    </div>
                  )}
                </div>
                <div
                  className="shrink-0 ml-2 text-base font-bold text-right"
                  style={{ color: transactionColor(log.transaction_type) }}
                >
                  {Number(log.quantity_change) >= 0 ? "+" : ""}
                  {formatNumber(log.quantity_change)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
