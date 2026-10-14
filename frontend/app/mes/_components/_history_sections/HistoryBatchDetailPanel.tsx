"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Package, XCircle } from "lucide-react";
import { api, type TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import { productionApi } from "@/lib/api/production";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types/io";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { historyOperationColor, historyUserNotes, isStocktakeOperation } from "./historyOperationSource";
import { formatQty } from "@/lib/mes/format";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import {
  INTERNAL_USE_BOM_MODE_LABEL,
} from "../_warehouse_v2/internalUseBom";
import {
  describeBatchFlow,
  getBatchFlowEndpoints,
  getHistoryActor,
  getHistoryBomParentLine,
  getHistoryDisplayLabel,
  getHistoryDisplayTransactionType,
  getHistoryLineExecutionLog,
  getInternalUseHistoryLineEffectLabel,
  getHistoryLineSignedQuantity,
  getHistoryLineStatusLabel,
  getHistoryMovementSummary,
  type LineSignTone,
} from "./historyBatchInterpreter";
import { formatHistoryDate, formatHistoryDateTimeLong } from "./historyFormat";
import {
  FlowBadge,
  InternalUseEffectBadge,
  MovementSummaryCell,
  StockSnapshotContent,
} from "./historyTableHelpers";
import { getBomLineSnapshotLog, getAdjustmentDisplayBundles } from "./BomBatchDetail";
import { HistoryDetailMemo, HistoryDetailReason } from "./HistoryDetailPanel";
import { HistoryMobileContext, HistoryMobileStockDetails, HistoryMobileLogStock } from "./HistoryMobileInformation";
import type { HistoryTableFocusTarget } from "./HistoryTable";
import { buildHistoryDetailSummary } from "./historyDetailSummary";
import { HistoryKeyPointSummary } from "./HistoryKeyPointSummary";
import {
  HistoryCancelAction,
  HistoryMobileCancelConfirmation,
  type HistoryCancelCredentials,
  type HistoryCancelScopeStatus,
  useHistoryCancellationScopeLogs,
} from "./HistoryCancelAction";
import { getHistoryCancelScope, type HistoryCancelScope } from "./historyCancellation";
import mobileStyles from "./HistoryMobileDetail.module.css";

const SIGN_TONE_HEX: Record<LineSignTone, string> = {
  increase: LEGACY_COLORS.blue,
  decrease: LEGACY_COLORS.red,
  move: LEGACY_COLORS.cyan,
  muted: LEGACY_COLORS.muted2,
};

const STOCKTAKE_CATEGORY_LABELS = { normal: "정상", defect: "불량", b_grade: "B급", obsolete: "구형" } as const;

type Props = {
  panelOpen: boolean;
  batchId: string;
  logs: TransactionLog[];
  workOperationId?: string;
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  onBatchCancelled: (batchId: string, updated: TransactionLog) => void;
  onFocusLineInList?: (target: Omit<HistoryTableFocusTarget, "nonce">) => void;
  onSelectLog?: (log: TransactionLog) => void;
  variant?: "default" | "desktop";
  mobilePresentation?: boolean;
  desktopCancellationOpen?: boolean;
  onDesktopCancellationOpenChange?: (open: boolean) => void;
};

type FetchState =
  | { status: "loading" }
  | { status: "available"; batch: IoBatch }
  | { status: "error" }
  | { status: "unavailable" };

/**
 * BOM/op_batch 묶음 조회 전용 우측 상세 패널.
 * 정정/수량 보정 액션 없음 (조회 전용 — kind="log" 분기에서만 노출).
 */
export function HistoryBatchDetailPanel({
  panelOpen,
  batchId,
  logs,
  workOperationId,
  batchCache,
  setBatchCache,
  onBatchCancelled,
  onFocusLineInList,
  onSelectLog,
  variant = "default",
  mobilePresentation = false,
  desktopCancellationOpen = false,
  onDesktopCancellationOpenChange,
}: Props) {
  const operator = useCurrentOperator();
  const realtimeRevision = useRealtimeRevision();
  const operationBatchId = logs[0]?.operation_batch_id ?? null;
  const cached = operationBatchId ? batchCache.get(operationBatchId) ?? null : null;
  const [state, setState] = useState<FetchState>(
    cached
      ? { status: "available", batch: cached }
      : operationBatchId
        ? { status: "loading" }
        : { status: "unavailable" },
  );
  const batchRevisionRef = useRef(realtimeRevision);
  const [retryEpoch, setRetryEpoch] = useState(0);

  useLayoutEffect(() => {
    const revisionChanged = batchRevisionRef.current !== realtimeRevision;
    batchRevisionRef.current = realtimeRevision;
    if (!operationBatchId) {
      setState({ status: "unavailable" });
      return;
    }
    const hit = batchCache.get(operationBatchId);
    if (hit && !revisionChanged) {
      setState({ status: "available", batch: hit });
      return;
    }
    const background = Boolean(hit);
    if (!background) {
      setState({ status: "loading" });
    }
    let cancelled = false;
    const controller = new AbortController();
    void ioApi.getBatch(operationBatchId, { signal: controller.signal })
      .then((b) => {
        if (cancelled) return;
        setBatchCache((prev) => {
          if (prev.get(operationBatchId) === b) return prev;
          if (!revisionChanged && prev.has(operationBatchId)) return prev;
          const m = new Map(prev);
          m.set(operationBatchId, b);
          return m;
        });
        setState({ status: "available", batch: b });
      })
      .catch((err: unknown) => {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        if (!background) {
          setState({ status: "error" });
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [operationBatchId, realtimeRevision, retryEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = logs[0];
  const stocktakeOperationQuery = useQuery({
    queryKey: ["transactions", "operations", "detail", first.operation_id],
    queryFn: ({ signal }) => productionApi.getInventoryOperation(first.operation_id!, { signal }),
    enabled: panelOpen && (mobilePresentation || variant === "desktop") && isStocktakeOperation(first) && Boolean(first.operation_id),
  });
  const cancelScope = getHistoryCancelScope(first);
  const canCancelAsBatch = cancelScope === "batch";
  const cancellationScope = useHistoryCancellationScopeLogs({
    panelOpen: panelOpen && (Boolean(first.operation_batch_id) || canCancelAsBatch),
    identity: `batch:${batchId}`,
    visibleLogs: logs,
    operationId: first.operation_id,
    operationBatchId: first.operation_batch_id,
    referenceNo: canCancelAsBatch && !first.operation_batch_id ? first.reference_no : null,
  });

  const handleCancelSubmit = async ({ reason, pin }: HistoryCancelCredentials) => {
    if (!operator?.employee_code) {
      throw new Error("로그인 정보가 없습니다. 다시 로그인해 주세요.");
    }
    if (canCancelAsBatch && cancellationScope.status !== "ready") {
      throw new Error("취소 범위를 확인한 뒤 다시 시도해 주세요.");
    }
    const targetLogs = canCancelAsBatch ? cancellationScope.logs : [first];
    if (first.operation_id) {
      if (cancellationScope.blocker || !cancellationScope.planHash) {
        throw new Error(cancellationScope.blocker ?? "취소 계획을 확인한 뒤 다시 시도해 주세요.");
      }
      const cancellation = await productionApi.cancelInventoryOperation(first.operation_id, {
        reason, employee_code: operator.employee_code, pin, plan_hash: cancellationScope.planHash,
      });
      onBatchCancelled(batchId, {
        ...first, cancelled: true, cancel_reason: reason,
        cancelled_by: cancellation.actorEmployeeId, cancelled_at: cancellation.effectiveAt,
        operation_effective_status: "cancelled", reversal_operation_id: cancellation.operationId,
      });
      return;
    }
    const target = targetLogs.find((log) => !log.cancelled);
    if (!target) {
      throw new Error("이미 취소된 작업입니다.");
    }
    const updated = await api.cancelTransaction(target.log_id, {
      reason,
      employee_code: operator.employee_code,
      pin,
    });
    onBatchCancelled(batchId, updated);
  };

  const fullBatch = state.status === "available" ? state.batch : null;
  const workLineIds = new Set(logs.map((log) => log.operation_line_id).filter(Boolean));
  const workItemIds = new Set(logs.map((log) => log.item_id));
  const batch = fullBatch && workOperationId ? {
    ...fullBatch,
    bundles: fullBatch.bundles.flatMap((bundle) => {
      const selected = bundle.lines.some((line) => workLineIds.size ? workLineIds.has(line.line_id) : workItemIds.has(line.item_id));
      return selected ? [{ ...bundle, lines: bundle.lines.filter((line) => !line.included || (workLineIds.size ? workLineIds.has(line.line_id) : workItemIds.has(line.item_id))) }] : [];
    }),
  } : fullBatch;
  const cancellationScopeStatus: HistoryCancelScopeStatus = canCancelAsBatch
    ? cancellationScope.status
    : "ready";
  const cancellationLogs = canCancelAsBatch && cancellationScope.status === "ready"
    ? cancellationScope.logs
    : [first];
  const cancellationSummary = buildHistoryDetailSummary(cancellationLogs, canCancelAsBatch ? batch : null);
  const visibleSummary = buildHistoryDetailSummary(logs, batch);
  const summary = cancellationScope.status === "ready"
    ? { ...buildHistoryDetailSummary(cancellationScope.logs, batch), actualStock: visibleSummary.actualStock }
    : { ...visibleSummary, impactGroups: [] };
  const stocktakeImpactGroups = cancellationScope.status === "ready" ? summary.impactGroups : visibleSummary.impactGroups;
  const stocktakeObservations = stocktakeOperationQuery.data?.observationLines ?? [];
  const excludedLineCount = batch && batch.sub_type !== "internal_use_out"
    ? batch.bundles.reduce((count, bundle) => {
      const parent = getHistoryBomParentLine(bundle);
      return count + bundle.lines.filter((line) => line !== parent && !line.included).length;
    }, 0)
    : 0;
  const isBatchCancelled = first.operation_effective_status === "cancelled"
    || cancellationLogs.every((log) => log.cancelled);
  const isCancellationReadOnly = isBatchCancelled || first.operation_kind === "CANCELLATION";
  const effects = cancellationScopeStatus === "ready"
    ? cancellationSummary.impactGroups.flatMap((group) => group.effects)
    : [];
  const cancellationIdentity = canCancelAsBatch ? `batch:${batchId}` : `log:${first.log_id}`;
  const cancellationActionScope = canCancelAsBatch ? cancelScope : "single";

  const logByItemId = new Map<string, TransactionLog>();
  for (const l of logs) logByItemId.set(l.item_id, l);
  const unmatchedLogs = mobilePresentation && batch ? logs.filter((log) => !batch.bundles.some((bundle) =>
    bundle.lines.some((line) => getBomLineSnapshotLog(line, logs, batch)?.log_id === log.log_id))) : [];

  function handleLineClick(line: IoLine) {
    const matched = mobilePresentation && batch ? getBomLineSnapshotLog(line, logs, batch) : logByItemId.get(line.item_id);
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

  if (variant === "desktop") {
    const isDesktopCancellationOpen = desktopCancellationOpen;
    return (
      <div className={isDesktopCancellationOpen
        ? "flex h-full min-h-0 flex-1 flex-col"
        : "flex min-h-full min-h-0 flex-col gap-4"}
      >
        {!isDesktopCancellationOpen && (
          <>
            <HistoryKeyPointSummary
              summary={summary}
              operation={first}
              stocktakeOperation={stocktakeOperationQuery.data}
              impactStatus={stocktakeOperationQuery.isError ? "error" : cancellationScope.status}
              onRetryImpact={() => { cancellationScope.retry(); if (isStocktakeOperation(first) && first.operation_id) void stocktakeOperationQuery.refetch(); }}
              fillHeight
            />
            {excludedLineCount > 0 && (
              <div className="px-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                제외 {excludedLineCount}개
              </div>
            )}
            <HistoryDetailMemo
              notes={historyUserNotes(first)}
              reasonMemo={first.reason_memo}
              transactionType={first.transaction_type}
            />
          </>
        )}

        <HistoryCancelAction
          workflowMessage={cancellationScope.workflowMessage}
          blocker={cancellationScope.blocker}
          panelOpen={panelOpen}
          identity={cancellationIdentity}
          scope={cancellationActionScope}
          effects={effects}
          cancelled={isCancellationReadOnly}
          scopeStatus={cancellationScopeStatus}
          onRetryScope={cancellationScope.retry}
          onSubmit={handleCancelSubmit}
          triggerLabel="이 내역 취소"
          scopeCount={cancellationScopeStatus === "ready" ? cancellationLogs.length : undefined}
          pinToDesktopFooter={!isDesktopCancellationOpen}
          desktopCancellationOpen={desktopCancellationOpen}
          onDesktopCancellationOpenChange={onDesktopCancellationOpenChange}
        />
      </div>
    );
  }

  return (
    <HistoryCancelAction
      workflowMessage={cancellationScope.workflowMessage}
      blocker={cancellationScope.blocker}
      panelOpen={panelOpen}
      identity={cancellationIdentity}
      scope={cancellationActionScope}
      effects={effects}
      cancelled={isCancellationReadOnly}
      scopeStatus={cancellationScopeStatus}
      onRetryScope={cancellationScope.retry}
      onSubmit={handleCancelSubmit}
      triggerLabel="이 내역 취소"
      scopeCount={cancellationScopeStatus === "ready" ? cancellationLogs.length : undefined}
    >
      {(controller) => (
        <div className="space-y-4">
          <HistoryBatchHero
            first={first}
            logs={logs}
            batch={batch}
            loading={state.status === "loading"}
            canCancel={controller.available}
            blocker={isCancellationReadOnly ? null : cancellationScope.blocker}
            scopeStatus={isCancellationReadOnly ? "ready" : controller.scopeStatus}
            onRetryScope={controller.retryScope}
            onCancelClick={controller.openConfirmation}
            mobilePresentation={mobilePresentation}
          />
          {mobilePresentation && <HistoryMobileContext summary={visibleSummary} omitCancelledStatus
            omitParticipantNames={[batch?.requester_name ?? getHistoryActor(first), batch?.approver_name ?? first.approver_name ?? ""]} />}
          {mobilePresentation && isStocktakeOperation(first) && !operationBatchId && (
            <section aria-label="재고 변화" className="space-y-2">
              <h3 className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>재고 변화</h3>
              {stocktakeObservations.map((line) => {
                const location = line.scopeKey === "warehouse" ? "창고" : stocktakeOperationQuery.data?.department ?? first.department ?? "부서";
                const changedCategories = (Object.keys(STOCKTAKE_CATEGORY_LABELS) as Array<keyof typeof STOCKTAKE_CATEGORY_LABELS>).filter((category) => line.beforeQuantities[category] !== line.afterQuantities[category]);
                return (
                  <section key={`${line.applicationId}:${line.countId}`} aria-label={`${line.itemName ?? "품목"} · ${location}`} className="rounded-[16px] border px-3 py-2.5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <h4 className="break-words text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>{line.itemName ?? line.mesCode ?? "품목"}</h4>
                    <p className="mb-1 mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{line.mesCode} · {location}</p>
                    {changedCategories.length === 0 && <p className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>수량 변동 없음</p>}
                    <div className={`${mobileStyles.observationValues} grid grid-cols-2 gap-x-6 gap-y-1`}>{changedCategories.map((category) => {
                      const before = line.beforeQuantities[category];
                      const after = line.afterQuantities[category];
                      const delta = after - before;
                      const label = STOCKTAKE_CATEGORY_LABELS[category];
                      return (
                        <div key={category} aria-label={`${label}: ${formatQty(before)} → ${formatQty(after)}`} className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 py-1 text-sm tabular-nums">
                          <span style={{ color: LEGACY_COLORS.muted2 }}>{label}</span>
                          <span className="ml-auto inline-grid grid-cols-[auto_auto_auto] items-center gap-2 whitespace-nowrap font-bold">
                            <span style={{ color: LEGACY_COLORS.muted2 }}>{formatQty(before)}</span>
                            <span aria-hidden="true" style={{ color: LEGACY_COLORS.muted2 }}>→</span>
                            <span style={{ color: delta > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.red }}>{formatQty(after)}</span>
                          </span>
                        </div>
                      );
                    })}</div>
                  </section>
                );
              })}
              {stocktakeObservations.length === 0 && stocktakeImpactGroups.map((group) => (
                <div key={group.key} className="overflow-hidden rounded-[20px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <h4 className="px-3 pt-3 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{group.label}</h4>
                  {group.effects.map((effect) => {
                    const unit = effect.unit ? ` ${effect.unit}` : "";
                    const snapshot = effect.quantityBefore != null && effect.quantityAfter != null
                      ? `${formatQty(effect.quantityBefore)} → ${formatQty(effect.quantityAfter)}`
                      : null;
                    return (
                      <div key={effect.key} aria-label={`${effect.itemName} · ${effect.label}: ${snapshot ? `${snapshot}${unit}` : "전후 수량 기록 없음"}`} className="space-y-1 px-3 py-3 text-sm">
                        <div className="break-words font-bold" style={{ color: LEGACY_COLORS.text }}>{effect.itemName}</div>
                        <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                          {snapshot ? <span style={{ color: LEGACY_COLORS.text }}>{snapshot}{unit}</span>
                            : <span style={{ color: LEGACY_COLORS.muted2 }}>전후 수량 기록 없음</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {stocktakeObservations.length === 0 && (cancellationScope.status === "loading" || Boolean(first.operation_id) && stocktakeOperationQuery.isLoading) && <p role="status" className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>재고 변화 불러오는 중</p>}
              {stocktakeObservations.length === 0 && (cancellationScope.status === "error" || stocktakeOperationQuery.isError) && (
                <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                  <p>전체 재고 변화를 불러오지 못했습니다.</p>
                  <button type="button" onClick={() => { cancellationScope.retry(); if (first.operation_id) void stocktakeOperationQuery.refetch(); }} className="min-h-11 text-sm font-bold" style={{ color: LEGACY_COLORS.blue }}>재고 변화 다시 불러오기</button>
                </div>
              )}
            </section>
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
              취소된 거래{first.cancel_reason && ` — ${first.cancel_reason}`}
            </div>
          )}

          {mobilePresentation && <HistoryDetailReason log={first} />}
          <HistoryDetailMemo
            notes={historyUserNotes(first)}
            reasonMemo={first.reason_memo}
            transactionType={first.transaction_type}
          />
          <HistoryMobileCancelConfirmation
            workflowMessage={cancellationScope.workflowMessage}
            controller={controller}
            scope={cancellationActionScope}
            variant="batch"
            effects={effects}
            scopeCount={cancellationScopeStatus === "ready" ? cancellationLogs.length : undefined}
          />

          {mobilePresentation && state.status === "loading" && <div role="status" className="text-sm" style={{color:LEGACY_COLORS.muted2}}>작업 구성 불러오는 중</div>}
          {mobilePresentation && state.status === "error" && <div className="text-sm" style={{color:LEGACY_COLORS.muted2}}>
            작업 구성을 불러오지 못했습니다.
            <button type="button" className="ml-2 rounded-[12px] border px-3" style={{borderColor:LEGACY_COLORS.border,color:LEGACY_COLORS.blue}} onClick={() => setRetryEpoch((value) => value + 1)}>다시 시도</button>
          </div>}
          {mobilePresentation && !isStocktakeOperation(first) && (!batch || batch.bundles.length === 0) && <HistoryMobileStockDetails logs={logs} onSelectLog={(log) => onSelectLog?.(log)} />}
          {batch && batch.bundles.length > 0 && (
            <div
              className={mobilePresentation ? "space-y-3" : "rounded-[20px] border p-4"}
              style={mobilePresentation ? undefined : { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div
                className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                <GitBranch className="h-3.5 w-3.5" />
                {mobilePresentation ? "재고 변화" : "구성 라인"}
              </div>
              <div className="flex flex-col gap-3">
                {(mobilePresentation ? getAdjustmentDisplayBundles(batch) : batch.bundles).map((bundle) => (
                  <BundleBlock
                    key={bundle.bundle_id}
                    bundle={bundle}
                    batch={batch}
                    logs={logs}
                    onLineClick={handleLineClick}
                    isLineClickable={(line) => mobilePresentation ? Boolean(getBomLineSnapshotLog(line, logs, batch)) : logByItemId.has(line.item_id)}
                    mobilePresentation={mobilePresentation}
                    framed
                  />
                ))}
                {unmatchedLogs.length > 0 && <HistoryMobileStockDetails logs={unmatchedLogs} batch={batch} onSelectLog={(log) => onSelectLog?.(log)} />}
              </div>
            </div>
          )}
        </div>
      )}
    </HistoryCancelAction>
  );
}

function HistoryBatchHero({
  first,
  logs,
  batch,
  loading,
  canCancel,
  blocker,
  scopeStatus,
  onRetryScope,
  onCancelClick,
  mobilePresentation = false,
}: {
  first: TransactionLog;
  logs: TransactionLog[];
  batch: IoBatch | null;
  loading: boolean;
  canCancel: boolean;
  blocker?: string | null;
  scopeStatus: HistoryCancelScopeStatus;
  onRetryScope: () => void;
  onCancelClick: () => void;
  mobilePresentation?: boolean;
}) {
  const blockerId = useId();
  const displayType = getHistoryDisplayTransactionType(first, batch);
  const tcolor = historyOperationColor(first, displayType);
  const heroStyle = {
    background: `color-mix(in srgb, ${tcolor} 5%, ${LEGACY_COLORS.s2})`,
    borderColor: `color-mix(in srgb, ${tcolor} 22%, ${LEGACY_COLORS.border})`,
  };

  const summary = getHistoryMovementSummary(first, batch ?? undefined, logs.length, logs);
  const eps = batch ? getBatchFlowEndpoints(batch) : null;
  const flow = batch ? describeBatchFlow(first, batch) : null;

  let lineCount = 0;
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
        if (!l.included) excluded++;
        if (l.shortage > 0) shortage++;
      }
    }
  }

  const isShipping = first.transaction_type === "SHIP";
  const reqName = isShipping
    ? getHistoryActor(first)
    : batch?.requester_name ?? getHistoryActor(first);
  const actorLabel = isShipping ? "담당자" : "요청자";
  const rawApproverName = (batch?.approver_name ?? first.approver_name ?? "").trim();
  const approverName = rawApproverName && rawApproverName !== reqName ? rawApproverName : null;

  return (
    <div className="rounded-[20px] border p-4 space-y-3" style={heroStyle}>
      {/* 1줄: 정체 + 변동요약 + work_type */}
      <div className={mobilePresentation ? mobileStyles.heroHeader : "flex flex-wrap items-center gap-2"}>
        <div className={mobilePresentation ? "flex min-w-0 flex-wrap items-center gap-2" : "contents"}>
          <FlowBadge
            type={displayType}
            operation={first}
            label={getHistoryDisplayLabel(first, batch ?? undefined)}
            color={tcolor}
            variant="panel"
          />
          {!mobilePresentation && <MovementSummaryCell summary={summary} />}
          {mobilePresentation && eps && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border px-2.5 py-0.5 font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>{eps.from}</span>
              {eps.from !== eps.to && <>
                <span style={{ color: LEGACY_COLORS.muted2 }}>→</span>
                <span className="rounded-full border px-2.5 py-0.5 font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>{eps.to}</span>
              </>}
            </div>
          )}
        </div>
        {mobilePresentation && (
          <dl className={mobileStyles.heroMetadata} style={{ color: LEGACY_COLORS.muted2 }}>
            <div><dt>{actorLabel}</dt><dd style={{ color: LEGACY_COLORS.text }}>{reqName}</dd></div>
            <div><dt>일시</dt><dd>
              <time dateTime={first.requested_at ?? first.created_at} aria-label={formatHistoryDateTimeLong(first.requested_at ?? first.created_at)}>
                {formatHistoryDate(first.requested_at ?? first.created_at)}
              </time>
            </dd></div>
          </dl>
        )}
      </div>

      {/* 2줄: 흐름 — endpoints 우선, from==to 면 단일 칩, 없으면 flow.secondary, 둘 다 없으면 미렌더 */}
      {!(mobilePresentation && eps) && (eps ? (
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
      ) : null)}

      {/* 3줄: 라인 카운트 (batch 있을 때만) */}
      {batch && !mobilePresentation && (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          총 {bundleCount}묶음 / {lineCount}라인
          {excluded > 0 && <span> · 제외 {excluded}개</span>}
          {shortage > 0 && (
            <span style={{ color: LEGACY_COLORS.red }}> · 부족 {shortage}</span>
          )}
        </div>
      )}
      {!batch && !loading && !mobilePresentation && (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          세부 거래 {logs.length}건
        </div>
      )}

      {/* 4줄: 메타 — 담당자 또는 요청자(시각) / 승인자(시각) */}
      {mobilePresentation && (excluded > 0 || shortage > 0) && (
        <div className="flex flex-wrap gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          {excluded > 0 && <span>제외 {excluded}개</span>}
          {shortage > 0 && <span style={{ color: LEGACY_COLORS.red }}>부족 {shortage}</span>}
        </div>
      )}
      {mobilePresentation ? approverName && (
        <dl className={mobileStyles.metadata} style={{ color: LEGACY_COLORS.muted2 }}>
          <dt>승인자</dt><dd style={{ color: LEGACY_COLORS.text }}>{approverName}</dd>
          <dt>승인 일시</dt><dd style={{ color: LEGACY_COLORS.text }}>{formatHistoryDateTimeLong(first.approved_at ?? first.created_at)}</dd>
        </dl>
      ) : <div className="flex flex-col gap-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
        <span>
          {actorLabel}{" "}
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
      </div>}

      {scopeStatus === "loading" && (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          취소 범위 확인 중...
        </div>
      )}
      {scopeStatus === "error" && (
        <button
          type="button"
          onClick={onRetryScope}
          className="mt-1 rounded-[10px] border px-3 py-1.5 text-[12px] font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          취소 범위 다시 불러오기
        </button>
      )}
      {(canCancel || (scopeStatus === "ready" && blocker)) && (
        <button
          type="button"
          disabled={!canCancel}
          aria-describedby={blocker ? blockerId : undefined}
          onClick={onCancelClick}
          className={`mt-1 rounded-[10px] border px-3 py-1.5 text-[12px] font-bold transition-colors enabled:hover:brightness-110 disabled:opacity-50${mobilePresentation ? " min-h-[44px] w-full" : ""}`}
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
            color: LEGACY_COLORS.red,
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
          }}
        >
          이 내역 취소
        </button>
      )}
      {!canCancel && scopeStatus === "ready" && blocker && (
        <p id={blockerId} className="mt-2 break-words text-xs font-bold leading-5" style={{ color: LEGACY_COLORS.red }}>{blocker}</p>
      )}
    </div>
  );
}

function BundleBlock({
  bundle,
  batch,
  logs,
  onLineClick,
  isLineClickable,
  framed = false,
  mobilePresentation = false,
}: {
  bundle: IoBundle;
  batch: IoBatch;
  logs: TransactionLog[];
  onLineClick: (line: IoLine) => void;
  isLineClickable: (line: IoLine) => boolean;
  framed?: boolean;
  mobilePresentation?: boolean;
}) {
  const isBomParent = bundle.source_kind === "bom_parent";
  const isInternalUseBom = batch.sub_type === "internal_use_out" && isBomParent;
  const parentLine = getHistoryBomParentLine(bundle);
  const parentLog = parentLine ? getBomLineSnapshotLog(parentLine, logs, batch) : null;
  const childLines = parentLine ? bundle.lines.filter((l) => l !== parentLine) : bundle.lines;
  const compactSingleLine = mobilePresentation && !isBomParent && childLines.length === 1;
  const parentNotExecuted = !!parentLine && !parentLine.included;
  const headerSigned = parentLine && !parentNotExecuted
    ? getHistoryLineSignedQuantity(parentLine, batch, bundle, getHistoryLineExecutionLog(parentLine, logs))
    : null;
  // parentLine 없는 경로(BOM warehouse_to_dept 등)는 bundle.quantity 만으론 단위가 빠져
  // 자식 라인 "N EA" 와 헤더가 어색하게 갈림. 라인 unit 단일이면 그 unit 을 헤더에도 붙임.
  const bundleUnit = (() => {
    const units = new Set(bundle.lines.map((l) => (l.unit ?? "").trim()).filter(Boolean));
    return units.size === 1 ? Array.from(units)[0] : null;
  })();
  const headerQtyText = parentNotExecuted
    ? "상위 미반영"
    : headerSigned
    ? headerSigned.label
    : bundleUnit
      ? `${formatQty(bundle.quantity)} ${bundleUnit}`
      : formatQty(bundle.quantity);
  const headerQtyColor = headerSigned ? SIGN_TONE_HEX[headerSigned.tone] : LEGACY_COLORS.muted2;

  return (
    <div
      className={framed ? "rounded-[16px] border" : "border-b last:border-b-0"}
      style={{ borderColor: LEGACY_COLORS.border }}
    >
      {!compactSingleLine && <div
        className={mobilePresentation ? `${mobileStyles.bundleHeader} ${mobileStyles.compositionRow}` : "flex items-center gap-2 px-3 py-2"}
        style={{
          background: framed
            ? "color-mix(in srgb, var(--c-blue) 5%, transparent)"
            : `color-mix(in srgb, ${LEGACY_COLORS.blue} 5%, transparent)`,
        }}
      >
        <div className={mobilePresentation ? mobileStyles.bundleIdentity : "contents"}>
        <div className={mobilePresentation ? mobileStyles.itemMetadata : "contents"}>
        <span
          className={mobilePresentation ? "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium" : "inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"}
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
        {isInternalUseBom && bundle.internal_use_bom_mode && (
          <span
            className="inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[10px] font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
              color: LEGACY_COLORS.blue,
            }}
          >
            {INTERNAL_USE_BOM_MODE_LABEL[bundle.internal_use_bom_mode]}
          </span>
        )}
        {mobilePresentation && (parentLine?.mes_code || bundle.source_mes_code) && <span className={mobileStyles.code} style={{color:LEGACY_COLORS.muted2}}>{parentLine?.mes_code || bundle.source_mes_code}</span>}
        </div>
        <div className={mobilePresentation ? mobileStyles.bundleTitle : "min-w-0 flex-1"}>
          {mobilePresentation && parentLine ? <button type="button" disabled={!parentLog} onClick={() => onLineClick(parentLine)} className="w-full text-left">
            <span className={mobileStyles.name}>{bundle.title}</span>
          </button> : <TruncatedText className={mobilePresentation ? mobileStyles.name : "truncate text-xs font-bold"} style={{ color: LEGACY_COLORS.text }}>{bundle.title}</TruncatedText>}
        </div>
        </div>
        {mobilePresentation ? parentLine ? (
          <div className={mobileStyles.stockChange}>
            {parentNotExecuted ? <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{headerQtyText}</span>
              : parentLog ? <HistoryMobileLogStock log={parentLog} /> : <StockSnapshotContent log={null} variant="panel" />}
          </div>
        ) : <span className="text-sm font-bold" style={{color:headerQtyColor}}>{headerQtyText}</span> : <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: headerQtyColor }}>{headerQtyText}</span>}
      </div>}

      <div>
        {childLines.filter((line) => isInternalUseBom || line.included).map((line) => {
          const clickable = isLineClickable(line);
          const signed = getHistoryLineSignedQuantity(
            line,
            batch,
            bundle,
            getHistoryLineExecutionLog(line, logs),
          );
          const qtyColor = SIGN_TONE_HEX[signed.tone];
          const internalUseEffect = isInternalUseBom
            ? getInternalUseHistoryLineEffectLabel(line, batch)
            : null;
          const snapshotLog = getBomLineSnapshotLog(line, logs, batch);
          const LineContainer = mobilePresentation ? "div" : "button";
          return (
            <LineContainer
              key={line.line_id}
              type={mobilePresentation ? undefined : "button"}
              onClick={mobilePresentation ? undefined : () => clickable && onLineClick(line)}
              disabled={mobilePresentation ? undefined : !clickable}
              className={mobilePresentation ? `${mobileStyles.line} ${compactSingleLine ? mobileStyles.singleLine : "border-t"} text-left transition-colors disabled:cursor-default enabled:hover:brightness-125` : "flex w-full items-center gap-2 border-t px-3 py-1.5 text-left transition-colors disabled:cursor-default enabled:hover:brightness-125"}
              style={{
                borderColor: LEGACY_COLORS.border,
                background: "transparent",
              }}
            >
              {!compactSingleLine && <span className={mobilePresentation ? mobileStyles.branch : "text-[10px]"} style={{ color: LEGACY_COLORS.muted2 }}>└</span>}
              <div className="min-w-0 flex-1">
                {mobilePresentation ? <button type="button" disabled={!clickable} onClick={() => onLineClick(line)} className="w-full text-left" aria-label={`${line.item_name} ${line.mes_code ?? ""} 상세`}>
                  <span className={mobileStyles.name}>{line.item_name}</span>
                  {line.mes_code && <span className={mobileStyles.itemMetadata} style={{color:LEGACY_COLORS.muted2}}><span className={mobileStyles.code}>{line.mes_code}</span></span>}
                </button> : <TruncatedText className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>{line.item_name}</TruncatedText>}
              </div>
              {!mobilePresentation && line.mes_code && (
                <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {line.mes_code}
                </span>
              )}
              {mobilePresentation ? (
                <div className={mobileStyles.lineMetadata}>
                  <div className={mobileStyles.stockChange}>
                    {snapshotLog
                      ? <HistoryMobileLogStock log={snapshotLog} />
                      : <StockSnapshotContent log={null} variant="panel" />}
                  </div>
                </div>
              ) : <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: qtyColor }}>{signed.label}</span>}
              {internalUseEffect
                ? <InternalUseEffectBadge label={internalUseEffect} />
                : <LineStatusBadge included={line.included} shortage={line.shortage} />}
              {internalUseEffect && line.shortage > 0 && (
                <LineStatusBadge included shortage={line.shortage} />
              )}
              {mobilePresentation && line.approval_outcome === "rejected" && <span className="text-xs font-bold" style={{color:LEGACY_COLORS.red}}>반려 · 재고 미차감</span>}
              {!clickable && (!isInternalUseBom || line.included) && (
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
            </LineContainer>
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
