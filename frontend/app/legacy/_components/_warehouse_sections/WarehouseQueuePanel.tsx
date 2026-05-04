"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { EmptyState, LoadingSkeleton } from "../common";
import { WarehouseQueueRow } from "./WarehouseQueueRow";

interface Props {
  approverEmployeeId: string;
  refreshNonce: number;
  onChanged: () => void;
}

export function WarehouseQueuePanel({ approverEmployeeId, refreshNonce, onChanged }: Props) {
  const [items, setItems] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectPin, setRejectPin] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [approvePinFor, setApprovePinFor] = useState<string | null>(null);
  const [approvePin, setApprovePin] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listWarehouseQueue();
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "승인함을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshNonce]);

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

  const submitApprove = async (requestId: string) => {
    if (!approvePin) return;
    setBusyId(requestId);
    try {
      await api.approveStockRequest(requestId, {
        actor_employee_id: approverEmployeeId,
        pin: approvePin,
      });
      closeApprove();
      await reload();
      onChanged();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "승인에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async (requestId: string) => {
    if (!rejectPin || !rejectReason.trim()) {
      setRejectError("PIN과 반려 사유를 모두 입력해 주세요.");
      return;
    }
    setRejectError(null);
    setBusyId(requestId);
    try {
      await api.rejectStockRequest(requestId, {
        actor_employee_id: approverEmployeeId,
        pin: rejectPin,
        reason: rejectReason.trim(),
      });
      closeReject();
      await reload();
      onChanged();
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : "반려에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {loading && <LoadingSkeleton variant="list" rows={2} />}
      {error && (
        <div
          className="rounded-[12px] border px-4 py-3 text-sm"
          style={{
            borderColor: tint(LEGACY_COLORS.red, 30),
            color: LEGACY_COLORS.red,
            background: tint(LEGACY_COLORS.red, 10),
          }}
        >
          {error}
        </div>
      )}
      {!loading && items.length === 0 && !error && (
        <EmptyState variant="no-data" compact title="승인 대기 중인 요청이 없습니다." />
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
          submitApprove={(id) => void submitApprove(id)}
          submitReject={(id) => void submitReject(id)}
        />
      ))}
    </div>
  );
}
