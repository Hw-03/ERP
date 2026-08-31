"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { XCircle } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { ApiConnectionError } from "@/lib/api-core";
import { productionApi } from "@/lib/api/production";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { DesktopRightPanelFooter } from "../DesktopRightPanel";
import {
  getHistoryCancelCopy,
  type HistoryCancelScope,
} from "./historyCancellation";
import type { InventoryEffectRow } from "./historyInventoryEffect";

export type HistoryCancelCredentials = {
  reason: string;
  pin: string;
};

type CancelStep = "idle" | "confirm" | "submitting" | "error";
export type HistoryCancelScopeStatus = "ready" | "loading" | "error";
const inFlightCancellationIdentities = new Set<string>();

export type HistoryCancelController = {
  available: boolean;
  step: CancelStep;
  reason: string;
  pin: string;
  error: string;
  scopeStatus: HistoryCancelScopeStatus;
  openConfirmation: () => void;
  closeConfirmation: () => void;
  retryScope: () => void;
  setReason: (value: string) => void;
  setPin: (value: string) => void;
  submitCancellation: () => Promise<void>;
};

type HistoryCancellationScopeState = {
  scopeKey: string;
  status: HistoryCancelScopeStatus;
  logs: TransactionLog[];
  planHash: string | null;
  blocker: string | null;
};

function scopeState(
  scopeKey: string,
  status: HistoryCancelScopeStatus,
  logs: TransactionLog[] = [],
  preview?: { planHash: string; canCancel: boolean; blockers: string[] } | null,
): HistoryCancellationScopeState {
  return {
    scopeKey,
    status,
    logs,
    planHash: preview?.planHash ?? null,
    blocker: preview && !preview.canCancel
      ? preview.blockers[0] ?? "현재 상태에서는 이 작업을 취소할 수 없습니다."
      : null,
  };
}

function patchAtomicScopeFromVisibleCancellation(
  state: HistoryCancellationScopeState,
  visibleLogs: TransactionLog[],
): HistoryCancellationScopeState {
  if (state.status !== "ready") return state;
  const cancelledVisible = visibleLogs.find(
    (visible) => visible.cancelled && state.logs.some(
      (scopeLog) => scopeLog.log_id === visible.log_id && !scopeLog.cancelled,
    ),
  );
  if (!cancelledVisible) return state;

  return {
    ...state,
    logs: state.logs.map((scopeLog) => scopeLog.cancelled ? scopeLog : {
      ...scopeLog,
      cancelled: true,
      cancel_reason: cancelledVisible.cancel_reason,
      cancelled_by: cancelledVisible.cancelled_by,
      cancelled_at: cancelledVisible.cancelled_at,
    }),
  };
}

export function useHistoryCancellationScopeLogs({
  panelOpen,
  identity,
  visibleLogs,
  operationId,
  operationBatchId,
  referenceNo,
}: {
  panelOpen: boolean;
  identity: string;
  visibleLogs: TransactionLog[];
  operationId?: string | null;
  operationBatchId?: string | null;
  referenceNo?: string | null;
}): HistoryCancellationScopeState & { retry: () => void } {
  const realtimeRevision = useRealtimeRevision();
  const requestKey = operationId
    ? `inventory-operation:${operationId}`
    : operationBatchId
      ? `operation:${operationBatchId}`
      : referenceNo
        ? `reference:${referenceNo}`
        : null;
  const scopeKey = `${identity}|${requestKey ?? "none"}`;
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<HistoryCancellationScopeState>(
    scopeState(scopeKey, requestKey ? "loading" : "ready", requestKey ? [] : visibleLogs),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!requestKey || !panelOpen) return;

    let active = true;
    const controller = new AbortController();
    const background = stateRef.current.scopeKey === scopeKey && stateRef.current.status === "ready";
    if (!background) {
      setState(scopeState(scopeKey, "loading"));
    }
    const params = operationId
      ? { operationId, limit: 2000, skip: 0 }
      : operationBatchId
        ? { operationBatchId, limit: 2000, skip: 0 }
        : { referenceNo: referenceNo!, limit: 2000, skip: 0 };
    const preview = operationId
      ? productionApi.previewInventoryOperationCancellation(operationId)
      : Promise.resolve(null);

    void Promise.all([
      productionApi.getTransactions(params, { signal: controller.signal }),
      preview,
    ])
      .then(([logs, cancellationPreview]) => {
        if (!active) return;
        if (logs.length === 0) {
          if (!background) {
            setState(scopeState(scopeKey, "error"));
          }
          return;
        }
        setState(scopeState(scopeKey, "ready", logs, cancellationPreview));
      })
      .catch((err: unknown) => {
        if (!active || (err as Error)?.name === "AbortError") return;
        if (!background) {
          setState(scopeState(scopeKey, "error"));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [operationBatchId, operationId, panelOpen, realtimeRevision, referenceNo, requestKey, retryNonce, scopeKey]);

  const synchronizedState = requestKey && state.scopeKey === scopeKey
    ? patchAtomicScopeFromVisibleCancellation(state, visibleLogs)
    : state;

  useEffect(() => {
    if (synchronizedState !== state) setState(synchronizedState);
  }, [state, synchronizedState]);

  if (!requestKey) {
    return {
      ...scopeState(scopeKey, "ready", visibleLogs),
      retry: () => {},
    };
  }
  if (synchronizedState.scopeKey !== scopeKey) {
    return {
      ...scopeState(scopeKey, "loading"),
      retry: () => setRetryNonce((nonce) => nonce + 1),
    };
  }
  return {
    ...synchronizedState,
    retry: () => setRetryNonce((nonce) => nonce + 1),
  };
}

export function HistoryCancelScopeLoadState({
  status,
  onRetry,
}: {
  status: Exclude<HistoryCancelScopeStatus, "ready">;
  onRetry?: () => void;
}) {
  return (
    <div className="hc-load">
      <span>{status === "loading" ? "취소 범위 확인 중..." : "취소 범위를 불러오지 못했습니다."}</span>
      {status === "error" && onRetry && (
        <button type="button" onClick={onRetry}>
          취소 범위 다시 불러오기
        </button>
      )}
    </div>
  );
}

export function HistoryCancelAction({
  panelOpen,
  identity,
  scope,
  effects,
  cancelled,
  scopeStatus = "ready",
  blocker,
  onRetryScope,
  onSubmit,
  triggerLabel,
  scopeCount,
  children,
  pinToDesktopFooter = false,
  desktopCancellationOpen = false,
  onDesktopCancellationOpenChange,
}: {
  panelOpen: boolean;
  identity: string;
  scope: HistoryCancelScope;
  effects: InventoryEffectRow[];
  cancelled: boolean;
  scopeStatus?: HistoryCancelScopeStatus;
  blocker?: string | null;
  onRetryScope?: () => void;
  onSubmit: (credentials: HistoryCancelCredentials) => Promise<void>;
  triggerLabel?: string;
  scopeCount?: number;
  children?: (controller: HistoryCancelController) => ReactNode;
  pinToDesktopFooter?: boolean;
  desktopCancellationOpen?: boolean;
  onDesktopCancellationOpenChange?: (open: boolean) => void;
}) {
  const copy = getHistoryCancelCopy(scope);
  const [step, setStep] = useState<CancelStep>("idle");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const lifecycleTokenRef = useRef(0);

  useLayoutEffect(() => {
    lifecycleTokenRef.current += 1;
    setStep("idle");
    setReason("");
    setPin("");
    setError("");
  }, [panelOpen, identity, cancelled]);

  useLayoutEffect(() => {
    if (desktopCancellationOpen) return;
    lifecycleTokenRef.current += 1;
    setStep("idle");
    setReason("");
    setPin("");
    setError("");
  }, [desktopCancellationOpen]);

  function closeConfirmation(): void {
    lifecycleTokenRef.current += 1;
    setStep("idle");
    setReason("");
    setPin("");
    setError("");
    onDesktopCancellationOpenChange?.(false);
  }

  async function submitCancellation(): Promise<void> {
    const normalizedReason = reason.trim();
    if (
      !normalizedReason
      || !pin
      || blocker
      || submittingRef.current
      || inFlightCancellationIdentities.has(identity)
    ) return;

    submittingRef.current = true;
    const requestIdentity = identity;
    inFlightCancellationIdentities.add(requestIdentity);
    const token = ++lifecycleTokenRef.current;
    setStep("submitting");
    setError("");
    try {
      await onSubmit({ reason: normalizedReason, pin });
      submittingRef.current = false;
      inFlightCancellationIdentities.delete(requestIdentity);
      if (lifecycleTokenRef.current !== token) return;
      setReason("");
      setPin("");
      setStep("idle");
      onDesktopCancellationOpenChange?.(false);
    } catch (err: unknown) {
      submittingRef.current = false;
      inFlightCancellationIdentities.delete(requestIdentity);
      if (lifecycleTokenRef.current !== token) return;
      setStep("error");
      setError(
        err instanceof ApiConnectionError
          ? "서버와 연결할 수 없습니다. 취소 처리 여부를 확인한 뒤 다시 시도해 주세요."
          : err instanceof Error
            ? err.message
            : "취소 처리 중 오류가 발생했습니다.",
      );
    }
  }

  const available = panelOpen && !cancelled && scopeStatus === "ready" && !blocker;
  const controller: HistoryCancelController = {
    available,
    step,
    reason,
    pin,
    error,
    scopeStatus,
    openConfirmation: () => {
      if (!available) return;
      setStep("confirm");
      onDesktopCancellationOpenChange?.(true);
    },
    closeConfirmation,
    retryScope: () => onRetryScope?.(),
    setReason,
    setPin,
    submitCancellation,
  };

  if (children) return <>{children(controller)}</>;

  let content: ReactNode = null;
  if (panelOpen && !cancelled && scopeStatus !== "ready") {
    content = <HistoryCancelScopeLoadState status={scopeStatus} onRetry={onRetryScope} />;
  } else if (panelOpen && !cancelled && !blocker && step === "idle") {
    content = (
      <div className="hc-idle">
        <button
          type="button"
          onClick={controller.openConfirmation}
        >
          <XCircle className="h-4 w-4" />
          {triggerLabel ?? copy.trigger}
        </button>
      </div>
    );
  } else if (panelOpen && !cancelled && !blocker) {
    content = (
    <section
      data-testid="history-cancel-confirmation"
      className={desktopCancellationOpen ? "hc-confirm hc-confirm--desktop hc-confirm--desktop-safe-focus hc-confirm--desktop-panel-surface flex-1" : "hc-confirm"}
    >
      <div className={desktopCancellationOpen ? "hc-confirm-summary--desktop" : undefined}>
        <strong>취소 내용 확인</strong>
        <p>{copy.description}</p>
        <HistoryCancelImpactPreview effects={effects} scopeCount={scopeCount} />
      </div>

      <textarea
        aria-label="취소 사유"
        rows={2}
        placeholder="취소 사유를 입력하세요 (필수)"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <input
        aria-label="PIN"
        type="password"
        autoComplete="off"
        placeholder="PIN 입력"
        value={pin}
        onChange={(event) => setPin(event.target.value)}
      />
      {error && (
        <div className="hc-error" role="alert">{error}</div>
      )}
      <div className="hc-actions">
        <button
          type="button"
          className="hc-submit"
          onClick={() => void submitCancellation()}
          disabled={step === "submitting" || !reason.trim() || !pin}
        >
          {step === "submitting" ? "처리 중…" : step === "error" ? "다시 시도" : "취소 확정"}
        </button>
        {!desktopCancellationOpen && (
          <button
            type="button"
            onClick={closeConfirmation}
            disabled={step === "submitting"}
          >
            닫기
          </button>
        )}
      </div>
    </section>
    );
  }

  return pinToDesktopFooter && !desktopCancellationOpen ? <DesktopRightPanelFooter>{content}</DesktopRightPanelFooter> : content;
}

function HistoryCancelImpactPreview({
  effects,
  scopeCount,
}: {
  effects: InventoryEffectRow[];
  scopeCount?: number;
}) {
  return (
    <>
      {scopeCount != null && (
        <div className="hc-count">취소할 내역 {scopeCount}건</div>
      )}
      <div className="hc-impact">
        <strong>되돌릴 재고 변동</strong>
        {effects.length > 0 ? effects.map((effect) => {
          return (
            <div key={effect.key} className="hc-impact-row">
              <div>
                <strong>{effect.itemName}</strong>
                <small>{effect.label}</small>
              </div>
              <b data-positive={effect.delta > 0}>
                {effect.deltaLabel}{effect.unit ? ` ${effect.unit}` : ""}
              </b>
            </div>
          );
        }) : (
          <p>기록된 실제 재고 영향이 없습니다.</p>
        )}
      </div>
    </>
  );
}

export function HistoryMobileCancelConfirmation({
  controller,
  scope,
  variant,
  effects,
  scopeCount,
}: {
  controller: HistoryCancelController;
  scope: HistoryCancelScope;
  variant: "single" | "batch";
  effects: InventoryEffectRow[];
  scopeCount?: number;
}) {
  if (!controller.available || controller.step === "idle") return null;

  const scopeDescription = scope === "batch"
    ? "이 작업 묶음에 포함된 재고 변동을 함께 취소합니다."
    : "선택한 이력 1건의 재고 변동만 취소합니다.";

  return (
    <div className="hc-mobile">
      <strong>취소 범위 확인</strong>
      <p className="hc-scope">{scopeDescription}</p>
      <HistoryCancelImpactPreview effects={effects} scopeCount={scopeCount} />
      <textarea
        aria-label="취소 사유"
        rows={2}
        placeholder="취소 사유를 입력하세요 (필수)"
        value={controller.reason}
        onChange={(event) => controller.setReason(event.target.value)}
      />
      <input
        aria-label="PIN"
        type="password"
        autoComplete="off"
        placeholder="PIN 입력"
        value={controller.pin}
        onChange={(event) => controller.setPin(event.target.value)}
      />
      {controller.error && (
        <div className="hc-error" role="alert">{controller.error}</div>
      )}
      <div className="hc-actions">
        <button
          type="button"
          onClick={() => void controller.submitCancellation()}
          disabled={controller.step === "submitting" || !controller.reason.trim() || !controller.pin}
        >
          {controller.step === "submitting"
            ? "처리 중…"
            : controller.step === "error"
              ? "다시 시도"
            : variant === "single"
              ? "범위 확인 후 취소"
              : "취소 확정"}
        </button>
        <button
          type="button"
          onClick={controller.closeConfirmation}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
