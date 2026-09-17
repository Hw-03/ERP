"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { ApiError } from "@/lib/api-core";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ReadFailure } from "../common/ReadState";
import { WarehouseLoadingWorkArea } from "./WarehouseLoadingWorkArea";
import { WarehouseQueueRow } from "./WarehouseQueueRow";
import {
  useApproveStockRequestAsResearchMutation,
  useAsResearchQueueQuery,
  useRejectStockRequestAsResearchMutation,
} from "@/lib/queries/useStockRequestsQuery";
import { prioritizeTargetRequest } from "./prioritizeTargetRequest";
import { WarehouseEmptyWorkArea } from "./WarehouseEmptyWorkArea";

interface Props {
  targetRequestId?: string | null;
  approverEmployeeId: string;
  refreshNonce: number;
  onChanged: () => void;
  onEmptyStateChange?: (empty: boolean) => void;
}

/** AS·연구 사용출고의 부서 AR·AA 재고 승인 대기열. */
export function AsResearchQueuePanel({ approverEmployeeId, refreshNonce, onChanged, onEmptyStateChange, targetRequestId }: Props) {
  const query = useAsResearchQueueQuery(approverEmployeeId);
  const { data: items = [], isLoading: loading, error: qError, refetch } = query;
  const approveMutation = useApproveStockRequestAsResearchMutation();
  const rejectMutation = useRejectStockRequestAsResearchMutation();
  const error = qError ? (qError instanceof Error ? qError.message : "AS·연구 승인함을 불러오지 못했습니다.") : null;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectPin, setRejectPin] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [approvePinFor, setApprovePinFor] = useState<string | null>(null);
  const [approvePin, setApprovePin] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);

  useEffect(() => {
    onEmptyStateChange?.(loading || (items.length === 0 && !error));
  }, [error, items.length, loading, onEmptyStateChange]);

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  const closeApprove = () => {
    setApprovePinFor(null);
    setApprovePin("");
    setApproveError(null);
  };
  const closeReject = () => {
    setShowRejectFor(null);
    setRejectReason("");
    setRejectPin("");
    setRejectError(null);
  };

  const submitApprove = (requestId: string) => {
    if (approvePin.length !== 4) {
      setApproveError("PIN 자리를 입력해 주세요.");
      return;
    }
    setApproveError(null);
    setBusyId(requestId);
    approveMutation.mutate(
      { requestId, payload: { actor_employee_id: approverEmployeeId, pin: approvePin } },
      {
        onSuccess: () => { closeApprove(); onChanged(); },
        onError: (err) => {
          if (err instanceof ApiError && err.isConflict) setApproveError("이미 처리된 요청입니다.");
          else if (err instanceof ApiError && err.isUnavailable) setApproveError("서버 과부하 — 잠시 후 다시 시도하세요.");
          else setApproveError(err instanceof Error ? err.message : "승인에 실패했습니다.");
        },
        onSettled: () => setBusyId(null),
      },
    );
  };

  const submitReject = (requestId: string) => {
    if (rejectPin.length !== 4 || !rejectReason.trim()) {
      setRejectError("PIN과 반려 사유를 모두 입력해 주세요.");
      return;
    }
    setRejectError(null);
    setBusyId(requestId);
    rejectMutation.mutate(
      { requestId, payload: { actor_employee_id: approverEmployeeId, pin: rejectPin, reason: rejectReason.trim() } },
      {
        onSuccess: () => { closeReject(); onChanged(); },
        onError: (err) => {
          if (err instanceof ApiError && err.isConflict) setRejectError("이미 처리된 요청입니다.");
          else if (err instanceof ApiError && err.isUnavailable) setRejectError("서버 과부하 — 잠시 후 다시 시도하세요.");
          else setRejectError(err instanceof Error ? err.message : "반려에 실패했습니다.");
        },
        onSettled: () => setBusyId(null),
      },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {loading && <WarehouseLoadingWorkArea label="결재 요청을 불러오고 있습니다…" />}
      {error && <ReadFailure message={error} refresh={query.data !== undefined} onRetry={() => void refetch()} />}
      {!loading && items.length === 0 && (query.data !== undefined || !error) && (
        <WarehouseEmptyWorkArea
          icon={<FlaskConical style={{ color: LEGACY_COLORS.blue }} />}
          title="AS·연구 승인 대기 요청이 없습니다."
          description="AS·연구 사용출고가 도착하면 여기에서 승인할 수 있습니다."
        />
      )}
      {prioritizeTargetRequest(items, targetRequestId).map((req) => (
        <WarehouseQueueRow
          key={req.request_id}
          req={req}
          highlighted={req.request_id === targetRequestId}
          busyId={busyId}
          approvePinFor={approvePinFor}
          approvePin={approvePin}
          approveError={approveError}
          setApprovePin={setApprovePin}
          setApprovePinFor={setApprovePinFor}
          showRejectFor={showRejectFor}
          rejectReason={rejectReason}
          rejectPin={rejectPin}
          rejectError={rejectError}
          setRejectReason={setRejectReason}
          setRejectPin={setRejectPin}
          setShowRejectFor={setShowRejectFor}
          closeApprove={closeApprove}
          closeReject={closeReject}
          submitApprove={submitApprove}
          submitReject={submitReject}
        />
      ))}
    </div>
  );
}
