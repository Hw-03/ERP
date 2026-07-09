"use client";

import { useEffect, useState } from "react";
import { GitBranch, Package, XCircle } from "lucide-react";
import { api, type TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types/io";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import {
  describeBatchFlow,
  getBatchFlowEndpoints,
  getHistoryActor,
  getHistoryBomParentLine,
  getHistoryDisplayLabel,
  getHistoryLineSignedQuantity,
  getHistoryLineStatusLabel,
  getHistoryMovementSummary,
  type LineSignTone,
} from "./historyBatchInterpreter";
import { formatHistoryDateTimeLong } from "./historyFormat";
import {
  FlowBadge,
  FlowSummaryCell,
  MovementSummaryCell,
  PeopleStatusCell,
  QuantityStockCell,
  TargetSummaryBlock,
} from "./historyTableHelpers";
import { HistoryDetailMemo } from "./HistoryDetailPanel";
import { getHistoryRowPresentation } from "./historyPresentation";
import type { HistoryTableFocusTarget } from "./HistoryTable";

const SIGN_TONE_HEX: Record<LineSignTone, string> = {
  increase: LEGACY_COLORS.blue,
  decrease: LEGACY_COLORS.red,
  move: LEGACY_COLORS.cyan,
  muted: LEGACY_COLORS.muted2,
};

type CancelState =
  | { step: "idle" }
  | { step: "confirm" }
  | { step: "submitting" }
  | { step: "error"; message: string };

type Props = {
  batchId: string;
  logs: TransactionLog[];
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  onBatchCancelled: (batchId: string) => void;
  onFocusLineInList?: (target: Omit<HistoryTableFocusTarget, "nonce">) => void;
  onSelectLog?: (log: TransactionLog) => void;
  variant?: "default" | "desktop";
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
  onBatchCancelled,
  onFocusLineInList,
  onSelectLog,
  variant = "default",
}: Props) {
  const operator = useCurrentOperator();
  const [cancelState, setCancelState] = useState<CancelState>({ step: "idle" });
  const [cancelReason, setCancelReason] = useState("");
  const [cancelPin, setCancelPin] = useState("");

  const cached = batchCache.get(batchId) ?? null;
  const [state, setState] = useState<FetchState>(
    cached ? { status: "available", batch: cached } : { status: "loading" },
  );

  useEffect(() => {
    setCancelState({ step: "idle" });
    setCancelReason("");
    setCancelPin("");
  }, [batchId]);

  useEffect(() => {
    const hit = batchCache.get(batchId);
    if (hit) {
      setState({ status: "available", batch: hit });
      return;
    }
    setState({ status: "loading" });
    let cancelled = false;
    const controller = new AbortController();
    void ioApi.getBatch(batchId, { signal: controller.signal })
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
      .catch((err: unknown) => {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        setState({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isBatchCancelled = logs.every((l) => l.cancelled);

  const handleCancelSubmit = async () => {
    if (!cancelReason.trim() || !cancelPin) return;
    if (!operator?.employee_code) {
      setCancelState({ step: "error", message: "로그인 정보가 없습니다. 다시 로그인해 주세요." });
      return;
    }
    setCancelState({ step: "submitting" });
    try {
      await api.cancelTransaction(logs[0].log_id, {
        reason: cancelReason.trim(),
        employee_code: operator.employee_code,
        pin: cancelPin,
      });
      setCancelState({ step: "idle" });
      setCancelReason("");
      setCancelPin("");
      onBatchCancelled(batchId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "취소 처리 중 오류가 발생했습니다.";
      setCancelState({ step: "error", message: msg });
    }
  };

  const first = logs[0];
  const batch = state.status === "available" ? state.batch : null;

  const logByItemId = new Map<string, TransactionLog>();
  for (const l of logs) logByItemId.set(l.item_id, l);

  function handleLineClick(line: IoLine) {
    const matched = logByItemId.get(line.item_id);
    if (onFocusLineInList) {
      onFocusLineInList({
        groupKey: batchId,
        logId: matched?.log_id ?? null,
        itemId: line.item_id,
      });
      return;
    }
    if (matched) {
      onSelectLog?.(matched);
    }
  }

  return (
    <div className="space-y-4">
      <HistoryBatchHero
        first={first}
        logs={logs}
        batch={batch}
        loading={state.status === "loading"}
        isBatchCancelled={isBatchCancelled}
        onCancelClick={() => setCancelState({ step: "confirm" })}
      />

      {variant === "desktop" && batch && (
        <HistoryBatchDecisionSummary first={first} batch={batch} />
      )}
      {isBatchCancelled && (
        <div
          className="rounded-[16px] border px-4 py-3 text-sm font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          <XCircle className="mr-1.5 inline h-4 w-4" />
          취소된 거래
        </div>
      )}

      <HistoryDetailMemo notes={first.notes} />

      {cancelState.step !== "idle" && !isBatchCancelled && (
        <div
          className="rounded-[20px] border p-4 space-y-3"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.text }}>
            배치 전체 취소 확인
          </div>
          <textarea
            className="w-full rounded-[12px] border px-3 py-2 text-[13px] resize-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            rows={2}
            placeholder="취소 사유를 입력하세요 (필수)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-[12px] border px-3 py-2 text-[13px]"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            placeholder="PIN 입력"
            value={cancelPin}
            onChange={(e) => setCancelPin(e.target.value)}
          />
          {cancelState.step === "error" && (
            <div className="text-[12px]" style={{ color: LEGACY_COLORS.red }}>{cancelState.message}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancelSubmit}
              disabled={cancelState.step === "submitting" || !cancelReason.trim() || !cancelPin}
              className="flex-1 rounded-[12px] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: LEGACY_COLORS.red }}
            >
              {cancelState.step === "submitting" ? "처리 중…" : "취소 확정"}
            </button>
            <button
              type="button"
              onClick={() => { setCancelState({ step: "idle" }); setCancelReason(""); setCancelPin(""); }}
              className="rounded-[12px] border px-3 py-2 text-[13px] font-bold"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {batch && batch.bundles.length > 0 && (
        <div
          className="rounded-[20px] border p-4"
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

function HistoryBatchDecisionSummary({
  first,
  batch,
}: {
  first: TransactionLog;
  batch: IoBatch;
}) {
  const presentation = getHistoryRowPresentation(first, batch);
  return (
    <div className="grid gap-2 rounded-[20px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <TargetSummaryBlock
        presentation={presentation}
        icon={<GitBranch className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />}
      />
      <div className="grid gap-2 xl:grid-cols-2">
        <div className="rounded-[14px] border px-3 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="mb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>흐름</div>
          <FlowSummaryCell presentation={presentation} />
        </div>
        <div className="rounded-[14px] border px-3 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="mb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>수량 · 재고</div>
          <QuantityStockCell presentation={presentation} />
        </div>
      </div>
      <div className="rounded-[14px] border px-3 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} />
      </div>
    </div>
  );
}
function HistoryBatchHero({
  first,
  logs,
  batch,
  loading,
  isBatchCancelled,
  onCancelClick,
}: {
  first: TransactionLog;
  logs: TransactionLog[];
  batch: IoBatch | null;
  loading: boolean;
  isBatchCancelled: boolean;
  onCancelClick: () => void;
}) {
  const tcolor = transactionColor(first.transaction_type);
  const heroStyle = {
    background: `color-mix(in srgb, ${tcolor} 5%, ${LEGACY_COLORS.s2})`,
    borderColor: `color-mix(in srgb, ${tcolor} 22%, ${LEGACY_COLORS.border})`,
  };

  const summary = getHistoryMovementSummary(first, batch ?? undefined, logs.length);
  const eps = batch ? getBatchFlowEndpoints(batch) : null;
  const flow = batch ? describeBatchFlow(first, batch) : null;

  let lineCount = 0;
  let included = 0;
  let excluded = 0;
  let shortage = 0;
  let bundleCount = 0;
  if (batch) {
    bundleCount = batch.bundles.length;
    for (const b of batch.bundles) {
      const parent = getHistoryBomParentLine(b);
      for (const l of b.lines) {
        if (l === parent) continue;
        lineCount += 1;
        if (l.included) included++; else excluded++;
        if (l.shortage > 0) shortage++;
      }
    }
  }

  const reqName = batch?.requester_name ?? getHistoryActor(first);
  const rawApproverName = (batch?.approver_name ?? first.approver_name ?? "").trim();
  const approverName = rawApproverName && rawApproverName !== reqName ? rawApproverName : null;

  return (
    <div className="rounded-[20px] border p-4 space-y-3" style={heroStyle}>
      {/* 1줄: 정체 + 변동요약 + work_type */}
      <div className="flex flex-wrap items-center gap-2">
        <FlowBadge
          type={first.transaction_type}
          label={getHistoryDisplayLabel(first, batch ?? undefined)}
          color={tcolor}
        />
        <MovementSummaryCell summary={summary} />
      </div>

      {/* 2줄: 흐름 — endpoints 우선, from==to 면 단일 칩, 없으면 flow.secondary, 둘 다 없으면 미렌더 */}
      {eps ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className="rounded-full border px-2.5 py-0.5 font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          >
            {eps.from}
          </span>
          {eps.from !== eps.to && (
            <>
              <span style={{ color: LEGACY_COLORS.muted2 }}>→</span>
              <span
                className="rounded-full border px-2.5 py-0.5 font-bold"
                style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                {eps.to}
              </span>
            </>
          )}
        </div>
      ) : flow?.secondary ? (
        <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {flow.secondary}
        </div>
      ) : loading ? (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          작업 흐름 로딩…
        </div>
      ) : null}

      {/* 3줄: 라인 카운트 (batch 있을 때만) */}
      {batch && (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          총 {bundleCount}묶음 / {lineCount}라인 · 포함 {included} · 제외 {excluded}
          {shortage > 0 && (
            <span style={{ color: LEGACY_COLORS.red }}> · 부족 {shortage}</span>
          )}
        </div>
      )}
      {!batch && !loading && (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          세부 거래 {logs.length}건
        </div>
      )}

      {/* 4줄: 메타 — 요청자(시각) / 승인자(시각) */}
      <div className="flex flex-col gap-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
        <span>
          요청자{" "}
          <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {reqName}
          </span>
          {" "}
          {formatHistoryDateTimeLong(first.requested_at ?? first.created_at)}
        </span>
        {approverName && (
        <span>
          승인자{" "}
          <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {approverName}
          </span>
          {" "}
          {formatHistoryDateTimeLong(first.approved_at ?? first.created_at)}
        </span>
        )}
      </div>

      {!isBatchCancelled && (
        <button
          type="button"
          onClick={onCancelClick}
          className="mt-1 rounded-[10px] border px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
            color: LEGACY_COLORS.red,
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
          }}
        >
          배치 취소
        </button>
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
  const parentLine = getHistoryBomParentLine(bundle);
  const childLines = parentLine ? bundle.lines.filter((l) => l !== parentLine) : bundle.lines;
  const headerSigned = parentLine ? getHistoryLineSignedQuantity(parentLine, batch, bundle) : null;
  // parentLine 없는 경로(BOM warehouse_to_dept 등)는 bundle.quantity 만으론 단위가 빠져
  // 자식 라인 "N EA" 와 헤더가 어색하게 갈림. 라인 unit 단일이면 그 unit 을 헤더에도 붙임.
  const bundleUnit = (() => {
    const units = new Set(bundle.lines.map((l) => (l.unit ?? "").trim()).filter(Boolean));
    return units.size === 1 ? Array.from(units)[0] : null;
  })();
  const headerQtyText = headerSigned
    ? headerSigned.label
    : bundleUnit
      ? `${formatQty(bundle.quantity)} ${bundleUnit}`
      : formatQty(bundle.quantity);
  const headerQtyColor = headerSigned ? SIGN_TONE_HEX[headerSigned.tone] : LEGACY_COLORS.muted2;

  return (
    <div className="rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgba(101,169,255,.05)" }}>
        <span
          className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
          style={{
            background: isBomParent
              ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
            color: isBomParent ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
          }}
        >
          {isBomParent ? <GitBranch className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
          {isBomParent ? "BOM" : "단품"}
        </span>
        <span className="flex-1 truncate text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
          {bundle.title}
        </span>
        <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: headerQtyColor }}>
          {headerQtyText}
        </span>
      </div>

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
              {line.mes_code && (
                <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {line.mes_code}
                </span>
              )}
              <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: qtyColor }}>
                {signed.label}
              </span>
              <LineStatusBadge included={line.included} shortage={line.shortage} />
              {!clickable && (
                <span
                  className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
                    color: LEGACY_COLORS.muted2,
                  }}
                  title="이 라인에 대응하는 거래 행이 현재 표시 목록에 없습니다."
                >
                  목록 외
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
  // 포함(ok) 은 기본값이라 chip 노출 안 함 — 부족/제외만 시각 신호.
  if (status.tone === "ok") return null;
  const color = status.tone === "danger" ? LEGACY_COLORS.red : LEGACY_COLORS.muted2;
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
