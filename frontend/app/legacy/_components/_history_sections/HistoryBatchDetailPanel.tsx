"use client";

import { useEffect, useState } from "react";
import { GitBranch, Layers, Package } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import {
  describeBatchFlow,
  getHistoryActor,
  getHistoryBomParentLine,
  getHistoryDisplayLabel,
  getHistoryLineSignedQuantity,
  getHistoryLineStatusLabel,
  type LineSignTone,
} from "./historyBatchInterpreter";
import { formatHistoryDateTimeLong } from "./historyFormat";

const SIGN_TONE_HEX: Record<LineSignTone, string> = {
  increase: LEGACY_COLORS.blue,
  decrease: LEGACY_COLORS.red,
  move: LEGACY_COLORS.cyan,
  muted: LEGACY_COLORS.muted2,
};

type Props = {
  batchId: string;
  logs: TransactionLog[];
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  onSelectLog: (log: TransactionLog) => void;
};

type FetchState =
  | { status: "loading" }
  | { status: "available"; batch: IoBatch }
  | { status: "unavailable" };

/**
 * BOM/op_batch 묶음 조회 전용 우측 상세 패널.
 * 정정/수량 보정 액션 없음 (조회 전용 — kind="log" 분기에서만 노출).
 */
export function HistoryBatchDetailPanel({
  batchId,
  logs,
  batchCache,
  setBatchCache,
  onSelectLog,
}: Props) {
  const cached = batchCache.get(batchId) ?? null;
  const [state, setState] = useState<FetchState>(
    cached ? { status: "available", batch: cached } : { status: "loading" },
  );

  useEffect(() => {
    const hit = batchCache.get(batchId);
    if (hit) {
      setState({ status: "available", batch: hit });
      return;
    }
    setState({ status: "loading" });
    let cancelled = false;
    void ioApi.getBatch(batchId)
      .then((b) => {
        if (cancelled) return;
        setBatchCache((prev) => {
          if (prev.has(batchId)) return prev;
          const m = new Map(prev);
          m.set(batchId, b);
          return m;
        });
        setState({ status: "available", batch: b });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "unavailable" });
      });
    return () => { cancelled = true; };
  }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = logs[0];
  const batch = state.status === "available" ? state.batch : null;

  // logs 안의 item_id → TransactionLog map (라인 클릭 시 매칭)
  const logByItemId = new Map<string, TransactionLog>();
  for (const l of logs) logByItemId.set(l.item_id, l);

  function handleLineClick(line: IoLine) {
    const matched = logByItemId.get(line.item_id);
    if (matched) onSelectLog(matched);
  }

  // 헤더 강조 박스: 작업 종류 + 라인 요약 (BOM 부모 자기 자신은 카운트에서 제외 — 헤더로 흡수됨).
  let summaryEl: React.ReactNode;
  if (batch) {
    let included = 0, excluded = 0, shortage = 0, lineCount = 0;
    for (const b of batch.bundles) {
      const parent = getHistoryBomParentLine(b);
      for (const l of b.lines) {
        if (l === parent) continue;
        lineCount += 1;
        if (l.included) included++; else excluded++;
        if (l.shortage > 0) shortage++;
      }
    }
    summaryEl = (
      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        총 {batch.bundles.length}개 묶음 / {lineCount}개 라인 · 포함 {included} · 제외 {excluded}{shortage > 0 ? ` · 부족 ${shortage}` : ""}
      </span>
    );
  } else {
    summaryEl = (
      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        하위 거래 {logs.length}건
      </span>
    );
  }

  // 작업 묶음 카드 안에 합칠 흐름 보조문구 (batch 있을 때만 의미).
  const flow = batch ? describeBatchFlow(first, batch) : null;

  // 메타 정보 — 참조번호는 값이 있을 때만 노출.
  const refNo = batch?.reference_no ?? first.reference_no;
  const metaRows: [string, string][] = [
    ["요청자", batch?.requester_name ?? getHistoryActor(first)],
    ["처리자", first.produced_by ?? "-"],
    ...(refNo ? [["참조번호", refNo] as [string, string]] : []),
    ["메모", batch?.notes ?? first.notes ?? "-"],
    ["일시", formatHistoryDateTimeLong(first.created_at)],
  ];

  return (
    <div className="space-y-4">
      {/* 작업 묶음 — 작업명 + 흐름 보조문구 + work_type/sub_type + 라인 요약 한꺼번에 */}
      <div
        className="rounded-[24px] border p-5"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>
            작업 묶음
          </span>
        </div>
        <div className="mt-2 text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>
          {getHistoryDisplayLabel(first, batch)}
        </div>
        {batch && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
            {flow?.secondary && <span>{flow.secondary}</span>}
            {flow?.secondary && <span>·</span>}
            <span>{batch.work_type} · {batch.sub_type}</span>
          </div>
        )}
        <div className="mt-1">{summaryEl}</div>
      </div>

      {/* 메타 정보 */}
      <div
        className="space-y-2.5 rounded-[24px] border p-4"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {metaRows.map(([label, value]) => (
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

      {/* BOM 구조 */}
      {batch && batch.bundles.length > 0 && (
        <div
          className="rounded-[24px] border p-4"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>
            <GitBranch className="h-3.5 w-3.5" />
            구성 라인
          </div>
          <div className="flex flex-col gap-3">
            {batch.bundles.map((bundle) => (
              <BundleBlock
                key={bundle.bundle_id}
                bundle={bundle}
                batch={batch}
                onLineClick={handleLineClick}
                isLineClickable={(line) => logByItemId.has(line.item_id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BundleBlock({
  bundle,
  batch,
  onLineClick,
  isLineClickable,
}: {
  bundle: IoBundle;
  batch: IoBatch;
  onLineClick: (line: IoLine) => void;
  isLineClickable: (line: IoLine) => boolean;
}) {
  const isBomParent = bundle.source_kind === "bom_parent";
  // BOM 부모 자기 자신은 헤더로 흡수, 자식 목록에서 제외. helper 단일 진입.
  const parentLine = getHistoryBomParentLine(bundle);
  const childLines = parentLine ? bundle.lines.filter((l) => l !== parentLine) : bundle.lines;
  const headerSigned = parentLine ? getHistoryLineSignedQuantity(parentLine, batch, bundle) : null;
  const headerQtyText = headerSigned ? headerSigned.label : formatQty(bundle.quantity);
  const headerQtyColor = headerSigned ? SIGN_TONE_HEX[headerSigned.tone] : LEGACY_COLORS.muted2;

  return (
    <div className="rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
      {/* 번들 헤더 — 부모 라인 있으면 실제 입고 수량(파랑)을 헤더가 흡수 */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgba(101,169,255,.05)" }}>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            background: isBomParent
              ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 16%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
            color: isBomParent ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
          }}
        >
          {isBomParent ? <GitBranch className="h-3 w-3" /> : <Package className="h-3 w-3" />}
          {isBomParent ? "BOM" : "단품"}
        </span>
        <span className="flex-1 truncate text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
          {bundle.title}
        </span>
        <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: headerQtyColor }}>
          {headerQtyText}
        </span>
      </div>

      {/* 라인 목록 — 부모 자기 자신 제외 */}
      <div>
        {childLines.map((line) => {
          const clickable = isLineClickable(line);
          const dim = !line.included;
          const signed = getHistoryLineSignedQuantity(line, batch, bundle);
          const qtyColor = SIGN_TONE_HEX[signed.tone];
          return (
            <button
              key={line.line_id}
              type="button"
              onClick={() => clickable && onLineClick(line)}
              disabled={!clickable}
              className="flex w-full items-center gap-2 border-t px-3 py-1.5 text-left transition-colors disabled:cursor-default enabled:hover:brightness-125"
              style={{
                borderColor: LEGACY_COLORS.border,
                background: line.included
                  ? "transparent"
                  : "rgba(255,100,100,.04)",
                opacity: dim ? 0.6 : 1,
              }}
            >
              <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
              <span className="flex-1 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
                {line.item_name}
              </span>
              {line.erp_code && (
                <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {line.erp_code}
                </span>
              )}
              <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: qtyColor }}>
                {signed.label}
              </span>
              <LineStatusBadge included={line.included} shortage={line.shortage} />
              {!clickable && (
                <span className="ml-1 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }} title="이 라인에 대응하는 거래 행이 현재 표시 목록에 없습니다.">
                  현재 필터 목록에 없음
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LineStatusBadge({ included, shortage }: { included: boolean; shortage: number }) {
  const status = getHistoryLineStatusLabel({ included, shortage });
  const color =
    status.tone === "danger" ? LEGACY_COLORS.red
    : status.tone === "ok" ? LEGACY_COLORS.green
    : LEGACY_COLORS.muted2;
  const label = status.tone === "danger" ? `부족 ${formatQty(shortage)}` : status.label;
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
    >
      {label}
    </span>
  );
}
