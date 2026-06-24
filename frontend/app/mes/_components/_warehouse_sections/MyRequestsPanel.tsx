"use client";

import { useEffect, useState } from "react";
import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { MyRequestRow } from "./MyRequestRow";
import {
  useCancelStockRequestMutation,
  useMyStockRequestsQuery,
  useRevertToDraftMutation,
} from "@/lib/queries/useStockRequestsQuery";

interface Props {
  employeeId: string | null;
  refreshNonce: number;
  onChanged: () => void;
}

export function MyRequestsPanel({ employeeId, refreshNonce, onChanged }: Props) {
  const { data: items = [], isLoading: loading, error: qError, refetch } =
    useMyStockRequestsQuery(employeeId ?? "");
  const cancelMutation = useCancelStockRequestMutation();
  const revertMutation = useRevertToDraftMutation();
  const loadError = qError
    ? qError instanceof Error
      ? qError.message
      : "요청 목록을 불러오지 못했습니다."
    : null;
  const [cancelTarget, setCancelTarget] = useState<StockRequest | null>(null);
  const [cancelPin, setCancelPin] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [revertTarget, setRevertTarget] = useState<StockRequest | null>(null);
  const [revertPin, setRevertPin] = useState("");
  const [revertError, setRevertError] = useState<string | null>(null);

  // refreshNonce 변경 시 수동 refetch (외부 트리거). 30초 폴링은 훅의 refetchInterval 이 담당.
  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  const openCancel = (request: StockRequest) => {
    setCancelTarget(request);
    setCancelPin("");
    setCancelError(null);
  };

  const closeCancel = () => {
    setCancelTarget(null);
    setCancelPin("");
    setCancelError(null);
  };

  const openRevert = (request: StockRequest) => {
    setRevertTarget(request);
    setRevertPin("");
    setRevertError(null);
  };

  const closeRevert = () => {
    setRevertTarget(null);
    setRevertPin("");
    setRevertError(null);
  };

  const submitRevert = () => {
    if (!revertTarget || !revertPin.trim() || revertMutation.isPending) return;
    setRevertError(null);
    revertMutation.mutate(
      {
        requestId: revertTarget.request_id,
        payload: { actor_employee_id: revertTarget.requester_employee_id, pin: revertPin },
      },
      {
        onSuccess: () => {
          closeRevert();
          onChanged();
        },
        onError: (err) => {
          setRevertError(err instanceof Error ? err.message : "수정 전환에 실패했습니다.");
        },
      },
    );
  };

  const submitCancel = () => {
    if (!cancelTarget || !cancelPin.trim() || cancelMutation.isPending) return;
    setCancelError(null);
    cancelMutation.mutate(
      {
        requestId: cancelTarget.request_id,
        payload: { actor_employee_id: cancelTarget.requester_employee_id, pin: cancelPin },
      },
      {
        onSuccess: () => {
          closeCancel();
          onChanged();
        },
        onError: (err) => {
          setCancelError(err instanceof Error ? err.message : "요청 취소에 실패했습니다.");
        },
      },
    );
  };

  if (!employeeId) {
    return (
      <EmptyState
        compact
        title="담당자를 선택해 주세요."
        description="담당자를 선택하면 내 요청 현황이 표시됩니다."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {loading && <LoadingSkeleton variant="list" rows={2} />}
      {loadError && <LoadFailureCard message={loadError} onRetry={() => void refetch()} />}
      {!loading && items.length === 0 && !loadError && (
        <EmptyState variant="no-data" compact title="아직 제출한 요청이 없습니다." />
      )}
      {items.map((req) => (
        <MyRequestRow
          key={req.request_id}
          req={req}
          onCancelRequest={() => openCancel(req)}
          onRevertToDraft={() => openRevert(req)}
        />
      ))}

      <ConfirmModal
        open={revertTarget !== null}
        title="요청 수정 — PIN 확인"
        tone="normal"
        confirmLabel="수정하기"
        cancelLabel="닫기"
        busy={revertMutation.isPending}
        onClose={closeRevert}
        onConfirm={submitRevert}
      >
        <p className="mb-3 text-sm" style={{ color: LEGACY_COLORS.text }}>
          요청이 취소되고 작업 중 목록으로 이동합니다. 내용을 수정한 뒤 다시 제출하세요.
        </p>
        {revertError && (
          <p className="mb-2 text-xs" style={{ color: LEGACY_COLORS.red }}>
            {revertError}
          </p>
        )}
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={revertPin}
          onChange={(e) => setRevertPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitRevert(); }}
          className="w-full rounded-[10px] border px-3 py-2 text-sm outline-none"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
          autoFocus
        />
      </ConfirmModal>

      <ConfirmModal
        open={cancelTarget !== null}
        title="요청 취소 — PIN 확인"
        tone="danger"
        confirmLabel="요청 취소"
        cancelLabel="닫기"
        busy={cancelMutation.isPending}
        onClose={closeCancel}
        onConfirm={submitCancel}
      >
        <p className="mb-3 text-sm" style={{ color: LEGACY_COLORS.text }}>
          본인 PIN을 입력하면 이 요청이 취소됩니다.
        </p>
        {cancelError && (
          <p className="mb-2 text-xs" style={{ color: LEGACY_COLORS.red }}>
            {cancelError}
          </p>
        )}
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={cancelPin}
          onChange={(e) => setCancelPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitCancel(); }}
          className="w-full rounded-[10px] border px-3 py-2 text-sm outline-none"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
          autoFocus
        />
      </ConfirmModal>
    </div>
  );
}
