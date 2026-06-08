"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-core";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { WarehouseQueueRow } from "./WarehouseQueueRow";
import {
  useApproveStockRequestDepartmentMutation,
  useDepartmentQueueQuery,
  useRejectStockRequestDepartmentMutation,
} from "@/lib/queries/useStockRequestsQuery";

/**
 * 부서 결재 정/부 전용 결재함 (낱개 IO + 듀얼 결재 케이스).
 *
 * WarehouseQueuePanel 와 동일한 행 UI(WarehouseQueueRow)를 재사용하되 API 만
 * department-* 엔드포인트로 교체. actor 의 부서와 일치하는 요청만 노출 (백엔드 필터).
 */

interface Props {
  approverEmployeeId: string;
  refreshNonce: number;
  onChanged: () => void;
}

export function DepartmentQueuePanel({ approverEmployeeId, refreshNonce, onChanged }: Props) {
  const { data: items = [], isLoading: loading, error: qError, refetch } =
    useDepartmentQueueQuery(approverEmployeeId);
  const approveMutation = useApproveStockRequestDepartmentMutation();
  const rejectMutation = useRejectStockRequestDepartmentMutation();
  const error = qError
    ? qError instanceof Error
      ? qError.message
      : "부서 결재함을 불러오지 못했습니다."
    : null;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectPin, setRejectPin] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [approvePinFor, setApprovePinFor] = useState<string | null>(null);
  const [approvePin, setApprovePin] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);

  // refreshNonce 변경 시 수동 refetch (외부 트리거 지원)
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
    if (!approvePin) return;
    setBusyId(requestId);
    approveMutation.mutate(
      { requestId, payload: { actor_employee_id: approverEmployeeId, pin: approvePin } },
      {
        onSuccess: () => {
          closeApprove();
          onChanged();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.isConflict) {
            setApproveError("이미 처리된 요청입니다.");
          } else if (err instanceof ApiError && err.isUnavailable) {
            setApproveError("서버 과부하 — 잠시 후 다시 시도하세요.");
          } else {
            setApproveError(err instanceof Error ? err.message : "승인에 실패했습니다.");
          }
        },
        onSettled: () => setBusyId(null),
      },
    );
  };

  const submitReject = (requestId: string) => {
    if (!rejectPin || !rejectReason.trim()) {
      setRejectError("PIN과 반려 사유를 모두 입력해 주세요.");
      return;
    }
    setRejectError(null);
    setBusyId(requestId);
    rejectMutation.mutate(
      {
        requestId,
        payload: {
          actor_employee_id: approverEmployeeId,
          pin: rejectPin,
          reason: rejectReason.trim(),
        },
      },
      {
        onSuccess: () => {
          closeReject();
          onChanged();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.isConflict) {
            setRejectError("이미 처리된 요청입니다.");
          } else if (err instanceof ApiError && err.isUnavailable) {
            setRejectError("서버 과부하 — 잠시 후 다시 시도하세요.");
          } else {
            setRejectError(err instanceof Error ? err.message : "반려에 실패했습니다.");
          }
        },
        onSettled: () => setBusyId(null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {loading && <LoadingSkeleton variant="list" rows={2} />}
      {error && <LoadFailureCard message={error} onRetry={() => void refetch()} />}
      {!loading && items.length === 0 && !error && (
        <EmptyState variant="no-data" compact title="부서 결재 대기 요청이 없습니다." />
      )}
      {items.map((req) => (
        <WarehouseQueueRow
          key={req.request_id}
          req={req}
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
          submitApprove={(id) => submitApprove(id)}
          submitReject={(id) => submitReject(id)}
        />
      ))}
    </div>
  );
}
