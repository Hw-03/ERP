"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { XCircle } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { productionApi } from "@/lib/api/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
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

type HistoryCancellationScopeState =
  | { scopeKey: string; status: "loading"; logs: TransactionLog[] }
  | { scopeKey: string; status: "error"; logs: TransactionLog[] }
  | { scopeKey: string; status: "ready"; logs: TransactionLog[] };

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
  operationBatchId,
  referenceNo,
}: {
  panelOpen: boolean;
  identity: string;
  visibleLogs: TransactionLog[];
  operationBatchId?: string | null;
  referenceNo?: string | null;
}): HistoryCancellationScopeState & { retry: () => void } {
  const requestKey = operationBatchId
    ? `operation:${operationBatchId}`
    : referenceNo
      ? `reference:${referenceNo}`
      : null;
  const scopeKey = `${identity}|${requestKey ?? "none"}`;
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<HistoryCancellationScopeState>({
    scopeKey,
    status: requestKey ? "loading" : "ready",
    logs: requestKey ? [] : visibleLogs,
  });

  useEffect(() => {
    if (!requestKey || !panelOpen) return;

    let active = true;
    const controller = new AbortController();
    setState({ scopeKey, status: "loading", logs: [] });
    const params = operationBatchId
      ? { operationBatchId, limit: 2000, skip: 0 }
      : { referenceNo: referenceNo!, limit: 2000, skip: 0 };

    void productionApi.getTransactions(params, { signal: controller.signal })
      .then((logs) => {
        if (!active) return;
        if (logs.length === 0) {
          setState({ scopeKey, status: "error", logs: [] });
          return;
        }
        setState({ scopeKey, status: "ready", logs });
      })
      .catch((err: unknown) => {
        if (!active || (err as Error)?.name === "AbortError") return;
        setState({ scopeKey, status: "error", logs: [] });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [operationBatchId, panelOpen, referenceNo, requestKey, retryNonce, scopeKey]);

  const synchronizedState = requestKey && state.scopeKey === scopeKey
    ? patchAtomicScopeFromVisibleCancellation(state, visibleLogs)
    : state;

  useEffect(() => {
    if (synchronizedState !== state) setState(synchronizedState);
  }, [state, synchronizedState]);

  if (!requestKey) {
    return {
      status: "ready",
      scopeKey,
      logs: visibleLogs,
      retry: () => {},
    };
  }
  if (synchronizedState.scopeKey !== scopeKey) {
    return {
      scopeKey,
      status: "loading",
      logs: [],
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
    <div
      className="flex min-h-11 items-center justify-between gap-3 border-t pt-4 text-xs"
      style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
    >
      <span>{status === "loading" ? "취소 범위 확인 중..." : "취소 범위를 불러오지 못했습니다."}</span>
      {status === "error" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[10px] border px-3 py-2 text-xs font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
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
  onRetryScope,
  onSubmit,
  triggerLabel,
  scopeCount,
  children,
  pinToDesktopFooter = false,
}: {
  panelOpen: boolean;
  identity: string;
  scope: HistoryCancelScope;
  effects: InventoryEffectRow[];
  cancelled: boolean;
  scopeStatus?: HistoryCancelScopeStatus;
  onRetryScope?: () => void;
  onSubmit: (credentials: HistoryCancelCredentials) => Promise<void>;
  triggerLabel?: string;
  scopeCount?: number;
  children?: (controller: HistoryCancelController) => ReactNode;
  pinToDesktopFooter?: boolean;
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

  function closeConfirmation(): void {
    lifecycleTokenRef.current += 1;
    setStep("idle");
    setReason("");
    setPin("");
    setError("");
  }

  async function submitCancellation(): Promise<void> {
    const normalizedReason = reason.trim();
    if (
      !normalizedReason
      || !pin
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
    } catch (err: unknown) {
      submittingRef.current = false;
      inFlightCancellationIdentities.delete(requestIdentity);
      if (lifecycleTokenRef.current !== token) return;
      setStep("error");
      setError(err instanceof Error ? err.message : "취소 처리 중 오류가 발생했습니다.");
    }
  }

  const available = panelOpen && !cancelled && scopeStatus === "ready";
  const controller: HistoryCancelController = {
    available,
    step,
    reason,
    pin,
    error,
    scopeStatus,
    openConfirmation: () => {
      if (available) setStep("confirm");
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
  } else if (panelOpen && !cancelled && step === "idle") {
    content = (
      <div className="border-t pt-4" style={{ borderColor: LEGACY_COLORS.border }}>
        <button
          type="button"
          onClick={controller.openConfirmation}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-bold transition hover:brightness-110 active:scale-[0.98]"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 7%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, ${LEGACY_COLORS.border})`,
            color: LEGACY_COLORS.red,
          }}
        >
          <XCircle className="h-4 w-4" />
          {triggerLabel ?? copy.trigger}
        </button>
      </div>
    );
  } else if (panelOpen && !cancelled) {
    content = (
    <section
      data-testid="history-cancel-confirmation"
      className="space-y-3 border-t pt-4"
      style={{ borderColor: LEGACY_COLORS.border }}
    >
      <div>
        <div className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
          취소 범위 확인
        </div>
        <div className="mt-1 text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>
          {copy.description}
        </div>
        <HistoryCancelImpactPreview effects={effects} scopeCount={scopeCount} />
      </div>

      <textarea
        aria-label="취소 사유"
        className="w-full resize-none rounded-[12px] border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
        rows={2}
        placeholder="취소 사유를 입력하세요 (필수)"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <input
        aria-label="PIN"
        type="password"
        autoComplete="off"
        className="min-h-11 w-full rounded-[12px] border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
        placeholder="PIN 입력"
        value={pin}
        onChange={(event) => setPin(event.target.value)}
      />
      {error && (
        <div className="text-xs" role="alert" style={{ color: LEGACY_COLORS.red }}>
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submitCancellation()}
          disabled={step === "submitting" || !reason.trim() || !pin}
          className="min-h-11 flex-1 rounded-[12px] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: LEGACY_COLORS.red }}
        >
          {step === "submitting" ? "처리 중…" : "취소 확정"}
        </button>
        <button
          type="button"
          onClick={closeConfirmation}
          disabled={step === "submitting"}
          className="min-h-11 rounded-[12px] border px-4 py-2 text-sm font-bold disabled:opacity-50"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          닫기
        </button>
      </div>
    </section>
    );
  }

  return pinToDesktopFooter ? <DesktopRightPanelFooter>{content}</DesktopRightPanelFooter> : content;
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
        <div className="mt-2 text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
          대상 {scopeCount}건
        </div>
      )}
      <div
        className="mt-3 overflow-hidden rounded-[12px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className="px-3 py-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          되돌릴 실제 영향
        </div>
        {effects.length > 0 ? effects.map((effect) => {
          const color = effect.delta > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red;
          return (
            <div
              key={effect.key}
              className="flex min-h-11 items-center justify-between gap-3 border-t px-3 py-2"
              style={{ borderColor: LEGACY_COLORS.border }}
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
                  {effect.itemName}
                </div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {effect.label}
                </div>
              </div>
              <div className="shrink-0 text-sm font-black" style={{ color }}>
                {effect.deltaLabel}{effect.unit ? ` ${effect.unit}` : ""}
              </div>
            </div>
          );
        }) : (
          <div
            className="border-t px-3 py-2 text-xs"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            기록된 실제 재고 영향이 없습니다.
          </div>
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
    <div
      className="space-y-3 rounded-[20px] border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.text }}>
        취소 범위 확인
      </div>
      <div
        className="rounded-[12px] border px-3 py-2 text-xs font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.red }}
      >
        {scopeDescription}
      </div>
      <HistoryCancelImpactPreview effects={effects} scopeCount={scopeCount} />
      <textarea
        aria-label="취소 사유"
        className="w-full resize-none rounded-[12px] border px-3 py-2 text-[13px]"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
        rows={2}
        placeholder="취소 사유를 입력하세요 (필수)"
        value={controller.reason}
        onChange={(event) => controller.setReason(event.target.value)}
      />
      <input
        aria-label="PIN"
        type="password"
        autoComplete="off"
        className="w-full rounded-[12px] border px-3 py-2 text-[13px]"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
        placeholder="PIN 입력"
        value={controller.pin}
        onChange={(event) => controller.setPin(event.target.value)}
      />
      {controller.error && (
        <div className="text-[12px]" role="alert" style={{ color: LEGACY_COLORS.red }}>
          {controller.error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void controller.submitCancellation()}
          disabled={controller.step === "submitting" || !controller.reason.trim() || !controller.pin}
          className="flex-1 rounded-[12px] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: LEGACY_COLORS.red }}
        >
          {controller.step === "submitting"
            ? "처리 중…"
            : variant === "single"
              ? "범위 확인 후 취소"
              : "취소 확정"}
        </button>
        <button
          type="button"
          onClick={controller.closeConfirmation}
          className="rounded-[12px] border px-3 py-2 text-[13px] font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
